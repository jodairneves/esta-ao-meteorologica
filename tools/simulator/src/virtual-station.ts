import { randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  commandMessageSchema,
  configMessageSchema,
  DEFAULT_DEVICE_CONFIG,
  type DeviceConfig,
  type MessageKind,
  measuresPressure,
  stationClientId,
  stationTopic,
  type TelemetryReading,
} from '@wx/shared';
import mqtt, { type MqttClient } from 'mqtt';
import { PowerModel, type PowerStep } from './power-model';
import { clamp, createRng, gaussian, hashString, type Rng } from './rng';
import type { StationCredentials } from './stations-file';
import { WeatherModel } from './weather-model';

const FIRMWARE = 'sim-1.0.0';
const MAX_BATCH = 30;
/** Same size as the firmware RAM buffer (~2 h at one reading per minute). */
const BUFFER_CAPACITY = 120;

export interface VirtualStationOptions {
  mqttUrl: string;
  /** Overrides the configured reading interval (seconds), to see data faster in development. */
  intervalOverrideS?: number;
  /** Multiplier of the failure probabilities; 0 disables chaos. */
  chaos: number;
  log: (code: string, message: string) => void;
}

interface PendingEvent {
  level: 'info' | 'warn' | 'error';
  code: string;
  msg: string;
  data?: Record<string, unknown>;
  ts: number;
}

const randomRun = () => randomInt(1, 0xffff_ffff);
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * A station speaking contract v1 exactly like the firmware will: power profiles (normal keeps
 * the connection, economy/survival connect in sessions), RAM buffer with store-and-forward,
 * retained config, commands and, optionally, injected failures.
 */
export class VirtualStation {
  private config: DeviceConfig = structuredClone(DEFAULT_DEVICE_CONFIG);
  private appliedRev = 0;
  private run = randomRun();
  private seq = 0;
  private rainCount = 0;
  private rainRemainderTips = 0;
  private bootAtMs = Date.now();
  private resetReason = 'Power On';
  private buffer: TelemetryReading[] = [];
  private events: PendingEvent[] = [];
  private dropped = 0;
  private mqttReconnects = 0;
  private rssi: number;
  private bmeFailureUntil = 0;
  private bmeFailing = false;
  private offlineUntil = 0;
  private lastTickMs = Date.now();
  private lastHealthMs = 0;
  private nextSessionMs = 0;
  private lastBatteryMv = 0;
  private lastTelemetryPayload: string | null = null;
  private client: MqttClient | null = null;
  private readonly weather: WeatherModel;
  private readonly power: PowerModel;
  private readonly rng: Rng;
  /** Fictitious local address from the documentation range (RFC 5737): it never answers. */
  private readonly ip: string;

  constructor(
    private readonly def: StationCredentials,
    private readonly options: VirtualStationOptions,
  ) {
    const seed = hashString(def.code);
    this.ip = `192.0.2.${10 + (seed % 200)}`;
    this.rng = createRng(seed ^ 0x9e3779b9);
    this.rssi = -55 - Math.round(this.rng() * 20);
    this.weather = new WeatherModel(def.climate, def, seed);
    this.power = new PowerModel(def.power, def.longitude, () => this.config.power);
  }

  get code(): string {
    return this.def.code;
  }

  private get hasBarometer(): boolean {
    return measuresPressure(this.def.climateSensor);
  }

  private get climateName(): string {
    return this.def.climateSensor === 'htu21d' ? 'HTU21D' : 'BME280';
  }

  /** Publishes history from `fromMs` to `toMs` as fast as the broker accepts it. */
  async backfill(fromMs: number, toMs: number): Promise<number> {
    this.bootAtMs = fromMs;
    const client = await this.connect();
    let t = alignUp(fromMs, this.config.interval_s);
    let count = 0;
    this.lastTickMs = t - this.config.interval_s * 1000;

    while (t <= toMs) {
      const durationS =
        this.power.currentMode === 'survival'
          ? this.config.survival_sleep_s
          : this.config.interval_s;
      const { reading, power } = this.measure(t, durationS);
      if (reading) {
        this.buffer.push(reading);
        count++;
      }
      if (this.buffer.length >= MAX_BATCH) await this.sendBuffer(client);
      if (!power.dead && t - this.lastHealthMs >= this.config.health_s * 1000) {
        await this.sendHealth(client, t);
      }
      this.lastTickMs = t;
      t += durationS * 1000;
    }
    await this.sendBuffer(client);
    this.events = [];

    // A station in economy/survival does not keep the connection: it goes to sleep.
    if (this.power.currentMode !== 'normal') {
      this.nextSessionMs = alignUp(Date.now() + 1, this.sessionIntervalS());
      await this.disconnect(this.nextSessionMs);
    }
    return count;
  }

  /** Seconds between connections in the economy and survival profiles. */
  private sessionIntervalS(): number {
    return this.power.currentMode === 'economy'
      ? this.config.economy_batch_s
      : this.config.survival_sleep_s;
  }

  /** Real-time operation until the signal aborts. */
  async runLive(signal: AbortSignal): Promise<void> {
    this.queueEvent('info', 'BOOT', 'Estação iniciada', { reset: this.resetReason, fw: FIRMWARE });
    while (!signal.aborted) {
      const intervalS = this.currentIntervalS();
      const nextMs = alignUp(Date.now() + 1, intervalS);
      await delay(nextMs - Date.now(), undefined, { signal }).catch(() => {});
      if (signal.aborted) break;
      const durationS = clamp(Math.round((nextMs - this.lastTickMs) / 1000), 1, 3600);
      this.lastTickMs = nextMs;
      try {
        await this.tick(nextMs, durationS);
      } catch (error) {
        this.options.log(
          this.code,
          `falha de comunicação (${(error as Error).message}); dados mantidos no buffer`,
        );
        this.dropClient();
      }
    }
  }

  /** Simulator shutdown: marks the station offline and closes the connection. */
  async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client?.connected) return;
    await this.publish(client, 'status', { v: 1, state: 'offline', ts: nowS() }, true).catch(
      () => {},
    );
    await client.endAsync().catch(() => {});
  }

  private currentIntervalS(): number {
    if (this.power.currentMode === 'survival') return this.config.survival_sleep_s;
    return this.options.intervalOverrideS ?? this.config.interval_s;
  }

  private async tick(endMs: number, durationS: number): Promise<void> {
    const { reading, power } = this.measure(endMs, durationS);
    if (power.dead) {
      if (this.client) {
        this.options.log(this.code, `bateria esgotada (${power.batteryMv} mV): estação desligada`);
        this.dropClient(); // ungraceful: the broker publishes the LWT
      }
      return;
    }
    if (power.revived)
      this.options.log(this.code, 'energia restabelecida: reinício com contadores zerados');
    if (power.modeChanged) {
      const { from, to } = power.modeChanged;
      this.options.log(this.code, `perfil ${from} → ${to} (${power.batteryMv} mV)`);
      this.queueEvent('info', 'MODE_CHANGED', `Perfil de energia: ${from} → ${to}`, {
        from,
        to,
        bat_mv: power.batteryMv,
      });
    }
    this.injectChaos(endMs);
    if (reading) this.bufferReading(reading);

    switch (power.mode) {
      case 'normal': {
        if (endMs < this.offlineUntil) return; // simulated Wi-Fi outage: keep buffering
        const client = await this.connect();
        await this.flush(client);
        if (endMs - this.lastHealthMs >= this.config.health_s * 1000)
          await this.sendHealth(client, endMs);
        break;
      }
      case 'economy':
      case 'survival': {
        const sessionEvery = this.sessionIntervalS();
        if (this.client && power.modeChanged?.from === 'normal') {
          await this.disconnect(endMs + sessionEvery * 1000);
          this.nextSessionMs = endMs + sessionEvery * 1000;
          return;
        }
        if (endMs < this.nextSessionMs) return;
        const client = await this.connect();
        await this.flush(client);
        await this.sendHealth(client, endMs);
        await delay(800); // window for retained config and queued commands
        this.nextSessionMs = endMs + sessionEvery * 1000;
        await this.disconnect(this.nextSessionMs);
        break;
      }
    }
  }

  private measure(
    endMs: number,
    durationS: number,
  ): { reading: TelemetryReading | null; power: PowerStep } {
    const weather = this.weather.sample(endMs, durationS);
    const power = this.power.step(endMs, durationS, weather.raining);
    this.lastBatteryMv = power.batteryMv;
    if (power.dead) return { reading: null, power };
    if (power.revived) this.powerLoss(endMs);

    let windPulses: number | null = null;
    let gustPulses: number | null = null;
    let rainCount: number | null = null;
    // In survival the ESP sleeps: wind and rain are not counted.
    if (power.mode !== 'survival') {
      windPulses = Math.round((weather.windMeanMs / this.def.windMsPerHz) * durationS);
      gustPulses = Math.min(
        windPulses,
        Math.round((weather.windGustMs / this.def.windMsPerHz) * 3),
      );
      this.rainRemainderTips += weather.rainMm / this.def.rainMmPerTip;
      const tips = Math.floor(this.rainRemainderTips);
      this.rainRemainderTips -= tips;
      this.rainCount += tips;
      rainCount = this.rainCount;
    }

    const bmeOk = endMs >= this.bmeFailureUntil;
    this.seq += 1;
    return {
      power,
      reading: {
        seq: this.seq,
        ts: Math.round(endMs / 1000),
        dur: durationS,
        temp: bmeOk ? round(weather.tempC + 0.05 * gaussian(this.rng), 2) : null,
        hum: bmeOk ? round(weather.humidityPct, 1) : null,
        // The HTU21D version has no barometer.
        pres: bmeOk && this.hasBarometer ? round(weather.pressureHpa, 2) : null,
        wind_p: windPulses,
        gust_p: gustPulses,
        rain_c: rainCount,
      },
    };
  }

  /** Brownout: the RTC memory is gone, so counters restart under a new run. */
  private powerLoss(atMs: number): void {
    this.run = randomRun();
    this.seq = 0;
    this.rainCount = 0;
    this.rainRemainderTips = 0;
    this.buffer = [];
    this.bootAtMs = atMs;
    this.resetReason = 'Power On';
    this.queueEvent('info', 'BOOT', 'Estação iniciada após falta de energia', {
      reset: 'Power On',
    });
  }

  private bufferReading(reading: TelemetryReading): void {
    this.buffer.push(reading);
    if (this.buffer.length > BUFFER_CAPACITY) {
      this.buffer.shift();
      this.dropped++;
      if (this.dropped === 1 || this.dropped % 30 === 0) {
        this.queueEvent('warn', 'BUFFER_OVERFLOW', 'Buffer cheio: leituras antigas descartadas', {
          dropped: this.dropped,
        });
      }
    }
  }

  private injectChaos(endMs: number): void {
    const rate = this.options.chaos;
    if (rate <= 0) return;
    const roll = (probability: number) => this.rng() < probability * rate;
    const intervalMs = this.currentIntervalS() * 1000;

    if (!this.bmeFailing && roll(0.002)) {
      this.bmeFailing = true;
      this.bmeFailureUntil = endMs + (10 + randomInt(20)) * intervalMs;
      this.options.log(this.code, `caos: ${this.climateName} falhou`);
      this.queueEvent('error', 'SENSOR_FAILED', `${this.climateName} não respondeu`, {
        sensor: this.def.climateSensor,
      });
    } else if (this.bmeFailing && endMs >= this.bmeFailureUntil) {
      this.bmeFailing = false;
      this.queueEvent('info', 'SENSOR_RECOVERED', `${this.climateName} voltou a responder`, {
        sensor: this.def.climateSensor,
      });
    }
    if (this.client && this.power.currentMode === 'normal' && roll(0.002)) {
      this.offlineUntil = endMs + (30 + randomInt(90)) * 1000;
      this.options.log(this.code, 'caos: queda de Wi-Fi');
      this.dropClient();
    }
    if (roll(0.0005)) {
      this.options.log(this.code, 'caos: falta de energia');
      this.dropClient();
      this.offlineUntil = endMs + 60_000;
      this.powerLoss(endMs);
    }
    if (this.client && roll(0.01) && this.lastTelemetryPayload) {
      void this.publish(this.client, 'telemetry', this.lastTelemetryPayload).catch(() => {});
    }
    if (this.client && roll(0.003)) {
      void this.publish(this.client, 'telemetry', '{"v":1,"run":').catch(() => {});
    }
  }

  // ---- MQTT ------------------------------------------------------------------------------

  private async connect(): Promise<MqttClient> {
    if (this.client?.connected) return this.client;
    this.dropClient();
    const client = await mqtt.connectAsync(this.options.mqttUrl, {
      username: this.def.code,
      password: this.def.password,
      clientId: stationClientId(this.def.code),
      clean: false,
      keepalive: 60,
      reconnectPeriod: 0,
      connectTimeout: 10_000,
      will: {
        topic: stationTopic(this.def.code, 'status'),
        payload: Buffer.from('{"v":1,"state":"offline"}'),
        qos: 1,
        retain: true,
      },
    });
    this.client = client;
    client.on('message', (topic, payload) => this.onMessage(topic, payload));
    client.on('close', () => {
      if (this.client === client) this.client = null;
    });
    await client.subscribeAsync(
      [stationTopic(this.def.code, 'config'), stationTopic(this.def.code, 'cmd')],
      { qos: 1 },
    );
    await this.publish(
      client,
      'status',
      { v: 1, state: 'online', ts: nowS(), mode: this.power.currentMode, fw: FIRMWARE },
      true,
    );
    return client;
  }

  private async disconnect(nextContactMs: number): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) return;
    await this.publish(
      client,
      'status',
      {
        v: 1,
        state: 'sleeping',
        ts: nowS(),
        mode: this.power.currentMode,
        next: Math.round(nextContactMs / 1000),
        fw: FIRMWARE,
      },
      true,
    );
    await client.endAsync();
  }

  /** Abrupt loss of connection (no DISCONNECT): the broker publishes the will. */
  private dropClient(): void {
    const client = this.client;
    this.client = null;
    if (!client) return;
    this.mqttReconnects++;
    client.stream.destroy();
    client.end(true);
  }

  private publish(
    client: MqttClient,
    kind: MessageKind,
    payload: object | string,
    retain = false,
  ): Promise<unknown> {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return client.publishAsync(stationTopic(this.def.code, kind), text, { qos: 1, retain });
  }

  private async flush(client: MqttClient): Promise<void> {
    const events = this.events;
    this.events = [];
    for (const event of events) {
      await this.publish(client, 'event', { v: 1, ...event });
    }
    await this.sendBuffer(client);
  }

  private async sendBuffer(client: MqttClient): Promise<void> {
    while (this.buffer.length > 0) {
      const batch = this.buffer.slice(0, MAX_BATCH);
      const payload = JSON.stringify({ v: 1, run: this.run, readings: batch });
      await this.publish(client, 'telemetry', payload);
      // Like the firmware: readings leave the buffer only after the PUBACK.
      this.buffer.splice(0, batch.length);
      this.lastTelemetryPayload = payload;
    }
  }

  private async sendHealth(client: MqttClient, atMs: number): Promise<void> {
    this.lastHealthMs = atMs;
    this.rssi = clamp(this.rssi + Math.round(gaussian(this.rng)), -90, -45);
    await this.publish(client, 'health', {
      v: 1,
      ts: Math.round(atMs / 1000),
      fw: FIRMWARE,
      mode: this.power.currentMode,
      bat_mv: this.lastBatteryMv,
      rssi: this.rssi,
      heap: 20_000 + Math.round(this.rng() * 4000),
      heap_frag: 5 + Math.round(this.rng() * 15),
      uptime: Math.max(0, Math.round((atMs - this.bootAtMs) / 1000)),
      reset: this.resetReason,
      wifi_reconn: 0,
      mqtt_reconn: this.mqttReconnects,
      buf: this.buffer.length,
      dropped: this.dropped,
      // Like the firmware: the probed climate sensor is reported, the other one as absent.
      sensors: {
        bme280: this.hasBarometer ? (atMs < this.bmeFailureUntil ? 'error' : 'ok') : 'absent',
        htu21d: this.hasBarometer ? 'absent' : atMs < this.bmeFailureUntil ? 'error' : 'ok',
        wind: 'ok',
        rain: 'ok',
      },
      cfg_rev: this.appliedRev > 0 ? this.appliedRev : null,
      ip: this.ip,
    });
  }

  private queueEvent(
    level: PendingEvent['level'],
    code: string,
    msg: string,
    data?: Record<string, unknown>,
  ): void {
    this.events.push({ level, code, msg, data, ts: nowS() });
  }

  private onMessage(topic: string, payload: Buffer): void {
    if (payload.length === 0) return;
    let json: unknown;
    try {
      json = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    const task = topic.endsWith('/config') ? this.applyConfig(json) : this.runCommand(json);
    task.catch((error: Error) =>
      this.options.log(this.code, `erro ao tratar ${topic}: ${error.message}`),
    );
  }

  private async applyConfig(json: unknown): Promise<void> {
    const parsed = configMessageSchema.safeParse(json);
    if (!parsed.success || parsed.data.rev <= this.appliedRev) return;
    const { v: _version, rev, ...config } = parsed.data;
    this.config = config;
    this.appliedRev = rev;
    this.options.log(
      this.code,
      `configuração rev ${rev} aplicada (intervalo ${config.interval_s} s)`,
    );
    await this.sendEventNow('info', 'CONFIG_APPLIED', `Configuração rev ${rev} aplicada`, { rev });
  }

  private async runCommand(json: unknown): Promise<void> {
    const parsed = commandMessageSchema.safeParse(json);
    if (!parsed.success) return;
    const { id, cmd, exp } = parsed.data;
    if (exp < nowS()) {
      await this.sendEventNow('warn', 'CMD_ACK', `Comando ${cmd} expirado`, {
        id,
        ok: false,
        detail: 'expired',
      });
      return;
    }
    this.options.log(this.code, `comando recebido: ${cmd}`);
    await this.sendEventNow('info', 'CMD_ACK', `Comando ${cmd} executado`, { id, ok: true });
    const client = this.client;
    if (!client) return;
    switch (cmd) {
      case 'health':
        await this.sendHealth(client, Date.now());
        break;
      case 'flush':
        await this.flush(client);
        break;
      case 'reboot':
        this.resetReason = 'Software/System restart';
        this.bootAtMs = Date.now();
        await client.endAsync();
        this.client = null;
        this.queueEvent('info', 'BOOT', 'Estação reiniciada por comando', {
          reset: this.resetReason,
        });
        break;
      case 'identify':
        break;
    }
  }

  private async sendEventNow(
    level: PendingEvent['level'],
    code: string,
    msg: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const client = this.client;
    if (!client) {
      this.queueEvent(level, code, msg, data);
      return;
    }
    await this.publish(client, 'event', { v: 1, level, code, msg, data, ts: nowS() });
  }
}

const nowS = () => Math.floor(Date.now() / 1000);

/** Next multiple of `intervalS` (wall-clock aligned, like the firmware with NTP). */
function alignUp(ms: number, intervalS: number): number {
  const step = intervalS * 1000;
  return Math.ceil(ms / step) * step;
}
