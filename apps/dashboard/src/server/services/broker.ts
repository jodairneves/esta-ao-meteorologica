import { hostname } from 'node:os';
import {
  bootstrapBroker,
  clearStationRetained,
  DynsecClient,
  provisionStation,
  removeStation,
  rotateStationPassword,
  setStationEnabled,
} from '@wx/mqtt-admin';
import {
  type CommandMessage,
  type ConfigMessage,
  type DeviceConfig,
  PROTOCOL_VERSION,
  stationTopic,
} from '@wx/shared';
import mqtt, { type MqttClient } from 'mqtt';
import type { MqttLogin } from '../../common/api';
import type { MqttConfig } from '../config';
import { HttpError } from '../http';
import type { Logger } from '../logger';

const SYS_TOPICS = [
  '$SYS/broker/version',
  '$SYS/broker/uptime',
  '$SYS/broker/clients/connected',
] as const;

/**
 * The dashboard's MQTT connection: retained configuration and commands and, when each station has
 * a login of its own, those logins (Dynamic Security). With a shared broker everyone uses the
 * broker's single login (design §3.10). It never subscribes to telemetry (design §2.2).
 */
export class BrokerAdmin {
  private client: MqttClient | null = null;
  private dynsec: DynsecClient | null = null;
  private ready = false;
  private readonly sys = new Map<string, string>();

  constructor(
    private readonly config: MqttConfig,
    private readonly logger: Logger,
  ) {}

  start(): void {
    const login =
      this.config.mode === 'per-station'
        ? { username: this.config.adminUsername, password: this.config.adminPassword }
        : { username: this.config.username, password: this.config.password };
    const client = mqtt.connect(this.config.url, {
      ...login,
      clientId: `wx-dashboard-${hostname()}-${Math.random().toString(16).slice(2, 6)}`,
      clean: true,
      reconnectPeriod: 3000,
      // mqtt.js gives up after a refused login; Mosquitto may still be creating `admin`.
      reconnectOnConnackError: true,
      connectTimeout: 10_000,
    });
    this.client = client;
    if (this.config.mode === 'per-station') this.dynsec = new DynsecClient(client);

    client.on('connect', () => void this.onConnect());
    client.on('close', () => {
      this.ready = false;
    });
    client.on('error', (error) => this.logger.warn({ err: error }, 'mqtt admin connection error'));
    client.on('message', (topic, payload) => {
      if (topic.startsWith('$SYS/')) this.sys.set(topic, payload.toString('utf8'));
    });
  }

  async stop(): Promise<void> {
    this.ready = false;
    this.dynsec?.dispose();
    await this.client?.endAsync().catch(() => {});
  }

  get connected(): boolean {
    return this.ready && Boolean(this.client?.connected);
  }

  /** How stations log in: a login of their own, or the shared broker's single login. */
  get login(): MqttLogin {
    return this.config.mode === 'shared' ? 'shared' : 'station';
  }

  /** The shared broker's single login, which stations use too; null with one login per station. */
  get sharedUsername(): string | null {
    return this.config.mode === 'shared' ? this.config.username : null;
  }

  /** Broker facts from $SYS (updated by Mosquitto every few seconds). */
  get info(): { clients: number | null; uptime: string | null; version: string | null } {
    const clients = this.sys.get('$SYS/broker/clients/connected');
    return {
      clients: clients ? Number(clients) : null,
      uptime: this.sys.get('$SYS/broker/uptime') ?? null,
      version: this.sys.get('$SYS/broker/version') ?? null,
    };
  }

  async provision(code: string, password: string): Promise<void> {
    await provisionStation(this.requireDynsec(), code, password);
  }

  async rotatePassword(code: string, password: string): Promise<void> {
    await rotateStationPassword(this.requireDynsec(), code, password);
  }

  async setEnabled(code: string, enabled: boolean): Promise<void> {
    await setStationEnabled(this.requireDynsec(), code, enabled);
  }

  async remove(code: string): Promise<void> {
    if (this.config.mode === 'shared') {
      await clearStationRetained(this.requireClient(), code);
      return;
    }
    await removeStation(this.requireDynsec(), this.requireClient(), code);
  }

  async publishConfig(
    code: string,
    rev: number,
    config: DeviceConfig,
    localPassword: string | null,
  ): Promise<void> {
    const message: ConfigMessage = {
      v: PROTOCOL_VERSION,
      rev,
      ...config,
      ...(localPassword ? { local_password: localPassword } : {}),
    };
    await this.requireClient().publishAsync(stationTopic(code, 'config'), JSON.stringify(message), {
      qos: 1,
      retain: true,
    });
  }

  async publishCommand(code: string, message: CommandMessage): Promise<void> {
    await this.requireClient().publishAsync(stationTopic(code, 'cmd'), JSON.stringify(message), {
      qos: 1,
    });
  }

  private async onConnect(): Promise<void> {
    const client = this.client;
    if (!client) return;
    try {
      const report =
        this.config.mode === 'per-station' && this.dynsec
          ? await bootstrapBroker(this.dynsec, {
              collectorPassword: this.config.collectorPassword,
              adminUsername: this.config.adminUsername,
            })
          : null;
      await client.subscribeAsync([...SYS_TOPICS], { qos: 0 }).catch((error: unknown) => {
        // A broker run by someone else may keep $SYS to itself: the status page just shows less.
        if (!client.connected) throw error;
        this.logger.warn({ err: error }, 'broker refused the $SYS subscription');
      });
      this.ready = true;
      this.logger.info(
        { login: this.login, report },
        report ? 'mqtt admin connected and broker bootstrapped' : 'mqtt connected (shared login)',
      );
    } catch (error) {
      if (!client.connected) {
        // On the first start the bootstrap gives `admin` the dashboard-ops role, and the broker
        // drops the connection of a client whose roles change: it runs again on reconnecting.
        this.logger.warn({ err: error }, 'broker closed the connection during the bootstrap');
        return;
      }
      this.logger.error({ err: error }, 'broker bootstrap failed');
    }
  }

  private requireClient(): MqttClient {
    if (!this.connected || !this.client) {
      throw new HttpError(
        503,
        'BROKER_UNAVAILABLE',
        'Broker MQTT indisponível; tente novamente em instantes',
      );
    }
    return this.client;
  }

  private requireDynsec(): DynsecClient {
    if (this.config.mode === 'shared') {
      // The services never ask for it with a shared login: there are no station logins to manage.
      throw new Error('station logins are not managed with a shared broker login');
    }
    this.requireClient();
    if (!this.dynsec) throw new HttpError(503, 'BROKER_UNAVAILABLE', 'Broker MQTT indisponível');
    return this.dynsec;
  }
}
