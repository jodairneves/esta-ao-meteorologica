import { randomBytes } from 'node:crypto';
import {
  alerts,
  and,
  asc,
  commands,
  createDb,
  createPool,
  type Database,
  type DbPool,
  deviceHealth,
  eq,
  eventLogs,
  readings,
  stationSensors,
  stationState,
  stations,
} from '@wx/db';
import {
  bootstrapBroker,
  connectAdmin,
  DynsecClient,
  deleteClient,
  ensureClient,
  generatePassword,
  provisionStation,
  ROLE_NAMES,
  removeStation,
} from '@wx/mqtt-admin';
import {
  barometricAltitude,
  DEFAULT_DEVICE_CONFIG,
  dewPoint,
  seaLevelPressure,
  stationClientId,
  stationTopic,
  type TelemetryReading,
} from '@wx/shared';
import mqtt, { type MqttClient } from 'mqtt';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type Collector, createCollector } from './collector';

const suffix = randomBytes(3).toString('hex');
const CODE = `itc-${suffix}`;
const INACTIVE_CODE = `itc-${suffix}-off`;
const UNKNOWN_CODE = `itc-${suffix}-unk`;
const HTU_CODE = `itc-${suffix}-htu`;
const COLLECTOR_USER = `itc-collector-${suffix}`;
const RUN_1 = 1001;
const RUN_2 = 1002;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: cp .env.example .env && pnpm infra:up`);
  return value;
}

const nowS = () => Math.floor(Date.now() / 1000);

function telemetry(run: number, items: Array<Partial<TelemetryReading> & { seq: number }>): string {
  return JSON.stringify({
    v: 1,
    run,
    readings: items.map((item) => ({
      ts: nowS() - 60,
      dur: 60,
      temp: 25,
      hum: 60,
      pres: 950,
      wind_p: 120,
      gust_p: 9,
      rain_c: 10,
      ...item,
    })),
  });
}

const waitUntil = (assertion: () => Promise<void>, timeout = 8000) =>
  vi.waitFor(assertion, { timeout, interval: 100 });

describe('collector (App 1)', () => {
  let pool: DbPool;
  let db: Database;
  let admin: MqttClient;
  let dynsec: DynsecClient;
  let collector: Collector;
  let station: MqttClient;
  let stationId: string;
  const passwords = new Map<string, string>();
  const collectorPassword = generatePassword();

  const connectStation = (code: string) =>
    mqtt.connectAsync(env('MQTT_URL'), {
      username: code,
      password: passwords.get(code),
      clientId: stationClientId(code),
      clean: true,
      reconnectPeriod: 0,
      will: {
        topic: stationTopic(code, 'status'),
        payload: Buffer.from('{"v":1,"state":"offline"}'),
        qos: 1,
        retain: true,
      },
    });

  const publish = (
    client: MqttClient,
    code: string,
    kind: 'telemetry' | 'status' | 'health' | 'event',
    payload: string,
  ) => client.publishAsync(stationTopic(code, kind), payload, { qos: 1 });

  const stationReadings = () =>
    db.select().from(readings).where(eq(readings.stationId, stationId)).orderBy(asc(readings.id));

  const logsWithCode = (code: string) =>
    db.select().from(eventLogs).where(eq(eventLogs.code, code));

  const activeAlert = async (type: string, subject = '') => {
    const [row] = await db
      .select()
      .from(alerts)
      .where(
        and(
          eq(alerts.stationId, stationId),
          eq(alerts.type, type as 'station_offline'),
          eq(alerts.subject, subject),
          eq(alerts.status, 'active'),
        ),
      );
    return row;
  };

  const state = async () => {
    const [row] = await db.select().from(stationState).where(eq(stationState.stationId, stationId));
    return row;
  };

  beforeAll(async () => {
    const databaseUrl = env('TEST_DATABASE_URL');
    pool = createPool(databaseUrl, { max: 3, onError: () => {} });
    db = createDb(pool);
    await pool.query('drop schema if exists drizzle cascade');
    await pool.query('drop schema if exists public cascade');
    await pool.query('create schema public');

    admin = await connectAdmin({
      url: env('MQTT_URL'),
      username: process.env.MQTT_ADMIN_USERNAME ?? 'admin',
      password: env('MOSQUITTO_DYNSEC_PASSWORD'),
      reconnectPeriodMs: 0,
    });
    dynsec = new DynsecClient(admin);
    await bootstrapBroker(dynsec, { collectorPassword: env('MQTT_COLLECTOR_PASSWORD') });
    await ensureClient(dynsec, {
      username: COLLECTOR_USER,
      password: collectorPassword,
      clientid: COLLECTOR_USER,
      roles: [ROLE_NAMES.collector],
    });
    for (const code of [CODE, INACTIVE_CODE, UNKNOWN_CODE, HTU_CODE]) {
      const password = generatePassword();
      passwords.set(code, password);
      await provisionStation(dynsec, code, password);
    }

    collector = createCollector(
      {
        databaseUrl,
        mqtt: {
          url: env('MQTT_URL'),
          username: COLLECTOR_USER,
          password: collectorPassword,
          clientId: COLLECTOR_USER,
        },
        logLevel: 'silent',
        monitorIntervalMs: 0,
        heartbeatIntervalMs: 0,
        retentionIntervalMs: 0,
        dbRetry: { minMs: 100, maxMs: 500 },
      },
      pino({ level: 'silent' }),
    );
    await collector.start();

    const [created] = await db
      .insert(stations)
      .values([
        { code: CODE, name: 'Teste', elevationM: 500, deviceConfig: DEFAULT_DEVICE_CONFIG },
        {
          code: INACTIVE_CODE,
          name: 'Inativa',
          isActive: false,
          deviceConfig: DEFAULT_DEVICE_CONFIG,
        },
      ])
      .returning({ id: stations.id });
    if (!created) throw new Error('station not created');
    stationId = created.id;

    station = await connectStation(CODE);
  });

  afterAll(async () => {
    await station?.endAsync(true);
    await collector?.stop();
    if (dynsec) {
      // Drop the test collector's persistent session so the broker stops queueing for it.
      const session = await mqtt
        .connectAsync(env('MQTT_URL'), {
          username: COLLECTOR_USER,
          password: collectorPassword,
          clientId: COLLECTOR_USER,
          clean: true,
          reconnectPeriod: 0,
        })
        .catch(() => null);
      await session?.endAsync();
      for (const code of [CODE, INACTIVE_CODE, UNKNOWN_CODE, HTU_CODE]) {
        await removeStation(dynsec, admin, code).catch(() => {});
      }
      await deleteClient(dynsec, COLLECTOR_USER).catch(() => {});
      dynsec.dispose();
    }
    await admin?.endAsync();
    await pool?.end();
  });

  it('stores a reading with calibrated and derived values', async () => {
    await publish(station, CODE, 'telemetry', telemetry(RUN_1, [{ seq: 1, rain_c: 10 }]));

    await waitUntil(async () => expect(await stationReadings()).toHaveLength(1));
    const [row] = await stationReadings();
    expect(row).toMatchObject({
      run: RUN_1,
      seq: 1,
      intervalS: 60,
      temperatureC: 25,
      humidityPct: 60,
      pressureHpa: 950,
      windPulses: 120,
      gustPulses: 9,
      rainCount: 10,
      rainMm: 0,
    });
    expect(row?.dewPointC).toBeCloseTo(dewPoint(25, 60) ?? Number.NaN, 1);
    expect(row?.pressureMslHpa).toBeCloseTo(seaLevelPressure(950, 25, 500), 1);
    expect(row?.altitudeM).toBeCloseTo(barometricAltitude(950), 0);
    expect(row?.windSpeedMs).toBeCloseTo(0.84, 3);
    expect(row?.windGustMs).toBeCloseTo(1.26, 3);

    const current = await state();
    expect(current).toMatchObject({ connection: 'online', rainRun: RUN_1, rainLastCount: 10 });
    const sensors = await db
      .select({ sensor: stationSensors.sensor, status: stationSensors.status })
      .from(stationSensors)
      .where(eq(stationSensors.stationId, stationId));
    expect(sensors).toEqual(
      expect.arrayContaining([
        { sensor: 'bme280', status: 'ok' },
        { sensor: 'anemometer', status: 'ok' },
        { sensor: 'rain_gauge', status: 'ok' },
      ]),
    );
  });

  it('computes rain by difference within the same run', async () => {
    await publish(station, CODE, 'telemetry', telemetry(RUN_1, [{ seq: 2, rain_c: 13 }]));
    await waitUntil(async () => expect(await stationReadings()).toHaveLength(2));
    expect((await stationReadings())[1]?.rainMm).toBeCloseTo(1.92, 3);
  });

  it('ignores a redelivered message', async () => {
    const duplicatesBefore = collector.stats.duplicates;
    await publish(station, CODE, 'telemetry', telemetry(RUN_1, [{ seq: 2, rain_c: 13 }]));
    await waitUntil(async () => expect(collector.stats.duplicates).toBe(duplicatesBefore + 1));
    expect(await stationReadings()).toHaveLength(2);
  });

  it('stores a batch in one message', async () => {
    await publish(
      station,
      CODE,
      'telemetry',
      telemetry(RUN_1, [
        { seq: 3, rain_c: 13, ts: nowS() - 50 },
        { seq: 4, rain_c: 14, ts: nowS() - 40 },
        { seq: 5, rain_c: 16, ts: nowS() - 30 },
      ]),
    );
    await waitUntil(async () => expect(await stationReadings()).toHaveLength(5));
    expect((await stationReadings()).slice(2).map((r) => r.rainMm)).toEqual([0, 0.64, 1.28]);
  });

  it('counts the rain since the restart when the run changes', async () => {
    await publish(station, CODE, 'telemetry', telemetry(RUN_2, [{ seq: 1, rain_c: 2 }]));
    await waitUntil(async () => expect(await stationReadings()).toHaveLength(6));
    expect((await stationReadings())[5]?.rainMm).toBeCloseTo(1.28, 3);
    expect(await state()).toMatchObject({ rainRun: RUN_2, rainLastCount: 2, rainLastSeq: 1 });
  });

  it('discards impossible values and logs them', async () => {
    await publish(station, CODE, 'telemetry', telemetry(RUN_2, [{ seq: 2, rain_c: 2, temp: 150 }]));
    await waitUntil(async () => expect(await stationReadings()).toHaveLength(7));
    const last = (await stationReadings())[6];
    expect(last?.temperatureC).toBeNull();
    expect(last?.humidityPct).toBe(60);
    expect(await logsWithCode('VALUE_OUT_OF_RANGE')).toHaveLength(1);
  });

  it('rejects readings stamped by a wrong clock', async () => {
    await publish(station, CODE, 'telemetry', telemetry(RUN_2, [{ seq: 3, ts: nowS() + 3600 }]));
    await waitUntil(async () =>
      expect(await logsWithCode('READING_TS_OUT_OF_RANGE')).toHaveLength(1),
    );
    expect(await stationReadings()).toHaveLength(7);
  });

  it('logs invalid payloads', async () => {
    await publish(station, CODE, 'telemetry', JSON.stringify({ v: 1, run: RUN_2 }));
    await waitUntil(async () => expect(await logsWithCode('PAYLOAD_INVALID')).toHaveLength(1));
    const [entry] = await logsWithCode('PAYLOAD_INVALID');
    expect(entry?.details).toMatchObject({ topic: stationTopic(CODE, 'telemetry') });
  });

  it('ignores unknown and inactive stations', async () => {
    for (const code of [UNKNOWN_CODE, INACTIVE_CODE]) {
      const other = await connectStation(code);
      await publish(other, code, 'telemetry', telemetry(RUN_1, [{ seq: 1 }]));
      await other.endAsync();
    }
    // Other stations on the shared dev broker may also show up as unknown: count only ours.
    const unknownLogs = async () =>
      (await logsWithCode('UNKNOWN_STATION')).filter(
        (entry) => (entry.details as { code?: string } | null)?.code === UNKNOWN_CODE,
      );
    await waitUntil(async () => {
      expect(await unknownLogs()).toHaveLength(1);
      expect(await logsWithCode('STATION_INACTIVE')).toHaveLength(1);
    });
    expect((await db.select().from(readings)).every((r) => r.stationId === stationId)).toBe(true);
  });

  it('tracks sleeping, online and the last will', async () => {
    const next = nowS() + 600;
    await publish(
      station,
      CODE,
      'status',
      JSON.stringify({ v: 1, state: 'sleeping', mode: 'economy', next }),
    );
    await waitUntil(async () => expect((await state())?.connection).toBe('sleeping'));
    expect((await state())?.nextContactAt).toEqual(new Date(next * 1000));

    await publish(
      station,
      CODE,
      'status',
      JSON.stringify({ v: 1, state: 'online', mode: 'normal', fw: '1.0.0' }),
    );
    await waitUntil(async () => expect((await state())?.connection).toBe('online'));
    expect((await state())?.firmwareVersion).toBe('1.0.0');

    // Ungraceful disconnect: the broker publishes the will (offline, retained).
    station.stream.destroy();
    await waitUntil(async () => expect((await state())?.connection).toBe('offline'));
    expect(await logsWithCode('STATION_OFFLINE')).toHaveLength(1);
    await station.endAsync(true);
    station = await connectStation(CODE);
  });

  it('stores diagnostics, battery alerts and reported sensor failures', async () => {
    const base = { v: 1, fw: '1.0.0', rssi: -70, heap: 21000, uptime: 3600, buf: 0, dropped: 0 };
    await publish(
      station,
      CODE,
      'health',
      JSON.stringify({
        ...base,
        ts: nowS() - 20,
        mode: 'economy',
        bat_mv: 3600,
        sensors: { bme280: 'error', wind: 'ok', rain: 'ok' },
        ip: '10.25.50.111',
      }),
    );
    await waitUntil(async () => {
      expect(await activeAlert('battery_low')).toBeDefined();
      expect(await activeAlert('sensor_error', 'bme280')).toBeDefined();
    });
    expect(await state()).toMatchObject({
      batteryMv: 3600,
      powerMode: 'economy',
      rssi: -70,
      ipAddress: '10.25.50.111',
    });
    expect(
      await db.select().from(deviceHealth).where(eq(deviceHealth.stationId, stationId)),
    ).toHaveLength(1);

    await publish(
      station,
      CODE,
      'health',
      JSON.stringify({
        ...base,
        ts: nowS() - 10,
        mode: 'normal',
        bat_mv: 3950,
        sensors: { bme280: 'ok', wind: 'ok', rain: 'ok' },
      }),
    );
    await waitUntil(async () => {
      expect(await activeAlert('battery_low')).toBeUndefined();
      expect(await activeAlert('sensor_error', 'bme280')).toBeUndefined();
    });
    // A diagnosis without the address (older firmware) keeps the last one known.
    expect((await state())?.ipAddress).toBe('10.25.50.111');
  });

  it('applies command acknowledgements and config confirmations', async () => {
    const [command] = await db
      .insert(commands)
      .values({ stationId, command: 'identify', expiresAt: new Date(Date.now() + 600_000) })
      .returning({ id: commands.id });
    await publish(
      station,
      CODE,
      'event',
      JSON.stringify({
        v: 1,
        level: 'info',
        code: 'CMD_ACK',
        msg: 'Identificando',
        data: { id: command?.id, ok: true },
      }),
    );
    await publish(
      station,
      CODE,
      'event',
      JSON.stringify({
        v: 1,
        level: 'info',
        code: 'CONFIG_APPLIED',
        msg: 'Config aplicada',
        data: { rev: 3 },
      }),
    );
    await waitUntil(async () => {
      const [row] = await db
        .select()
        .from(commands)
        .where(eq(commands.id, command?.id ?? ''));
      expect(row?.status).toBe('acked');
      expect((await state())?.configAppliedRev).toBe(3);
    });
    const [deviceLog] = await logsWithCode('CMD_ACK');
    expect(deviceLog).toMatchObject({ source: 'device', category: 'command' });
  });

  it('pauses while the database is down and loses no reading', async () => {
    const adminPool = createPool(
      env('TEST_DATABASE_URL').replace(/\/weather_test(\?|$)/, '/weather$1'),
      {
        max: 1,
        onError: () => {},
      },
    );
    const outagesBefore = collector.stats.dbOutages;
    try {
      await adminPool.query('alter database weather_test with allow_connections false');
      await adminPool.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'weather_test'",
      );

      await publish(
        station,
        CODE,
        'telemetry',
        telemetry(RUN_2, [
          { seq: 10, rain_c: 2, ts: nowS() - 30 },
          { seq: 11, rain_c: 3, ts: nowS() - 20 },
          { seq: 12, rain_c: 3, ts: nowS() - 10 },
        ]),
      );
      await vi.waitFor(() => expect(collector.stats.dbOutages).toBe(outagesBefore + 1), {
        timeout: 8000,
      });
      expect(collector.stats.paused).toBe(true);
    } finally {
      await adminPool.query('alter database weather_test with allow_connections true');
      await adminPool.end();
    }

    await waitUntil(async () => {
      const seqs = (await stationReadings()).filter((r) => r.run === RUN_2).map((r) => r.seq);
      expect(seqs).toEqual(expect.arrayContaining([10, 11, 12]));
    }, 20_000);
    expect(collector.stats.paused).toBe(false);
    expect(await logsWithCode('DB_ERROR')).toHaveLength(1);
  });

  it('opens and resolves alerts from the monitor', async () => {
    // No contact for an hour: overdue.
    await db
      .update(stationState)
      .set({ connection: 'online', lastSeenAt: new Date(Date.now() - 3_600_000) })
      .where(eq(stationState.stationId, stationId));
    await collector.runMonitorOnce();
    expect(await activeAlert('station_offline')).toMatchObject({ severity: 'warning' });
    expect((await state())?.connection).toBe('offline');
    expect(await logsWithCode('STATION_OVERDUE')).toHaveLength(1);

    // Contact resumes: alert resolved, station back online.
    await publish(station, CODE, 'telemetry', telemetry(RUN_2, [{ seq: 20, rain_c: 3 }]));
    await waitUntil(async () => expect(await activeAlert('station_offline')).toBeUndefined());
    expect((await state())?.connection).toBe('online');

    // The anemometer stops delivering data while the station keeps talking.
    await db
      .update(stationSensors)
      .set({ lastValueAt: new Date(Date.now() - 3_600_000) })
      .where(and(eq(stationSensors.stationId, stationId), eq(stationSensors.sensor, 'anemometer')));
    await collector.runMonitorOnce();
    expect(await activeAlert('sensor_stale', 'anemometer')).toBeDefined();

    await publish(station, CODE, 'telemetry', telemetry(RUN_2, [{ seq: 21, rain_c: 3 }]));
    await waitUntil(async () =>
      expect(await activeAlert('sensor_stale', 'anemometer')).toBeUndefined(),
    );
  });

  it('handles the HTU21D version: no pressure, its own sensor and no BME280', async () => {
    const [htu] = await db
      .insert(stations)
      .values({
        code: HTU_CODE,
        name: 'Horta de teste',
        elevationM: 500,
        climateSensor: 'htu21d',
        deviceConfig: DEFAULT_DEVICE_CONFIG,
      })
      .returning({ id: stations.id });
    if (!htu) throw new Error('station not created');
    const sensorsOf = async () =>
      new Map(
        (await db.select().from(stationSensors).where(eq(stationSensors.stationId, htu.id))).map(
          (row) => [row.sensor, row.status],
        ),
      );
    const client = await connectStation(HTU_CODE);
    try {
      await publish(client, HTU_CODE, 'telemetry', telemetry(RUN_1, [{ seq: 1, pres: null }]));
      await waitUntil(async () => {
        const [row] = await db.select().from(readings).where(eq(readings.stationId, htu.id));
        expect(row).toMatchObject({
          temperatureC: 25,
          humidityPct: 60,
          pressureHpa: null,
          pressureMslHpa: null,
          altitudeM: null,
        });
      });

      await publish(
        client,
        HTU_CODE,
        'health',
        JSON.stringify({
          v: 1,
          fw: '1.0.0',
          ts: nowS() - 5,
          mode: 'normal',
          bat_mv: 3950,
          sensors: { htu21d: 'ok', bme280: 'absent', wind: 'ok', rain: 'ok' },
        }),
      );
      await waitUntil(async () =>
        expect(
          await db.select().from(deviceHealth).where(eq(deviceHealth.stationId, htu.id)),
        ).toHaveLength(1),
      );
      const sensors = await sensorsOf();
      expect(sensors.get('htu21d')).toBe('ok');
      // The BME280 reported as absent belongs to the other version: no row, no alert.
      expect(sensors.has('bme280')).toBe(false);
      const mismatch = await logsWithCode('CLIMATE_SENSOR_MISMATCH');
      expect(mismatch.filter((log) => log.stationId === htu.id)).toHaveLength(0);
    } finally {
      await client.endAsync(true);
    }
  });

  it('warns when a station reports the climate sensor of the other version', async () => {
    await publish(
      station,
      CODE,
      'health',
      JSON.stringify({
        v: 1,
        fw: '1.0.0',
        ts: nowS() - 2,
        mode: 'normal',
        bat_mv: 3950,
        sensors: { bme280: 'absent', htu21d: 'ok', wind: 'ok', rain: 'ok' },
      }),
    );
    await waitUntil(async () => {
      const logs = (await logsWithCode('CLIMATE_SENSOR_MISMATCH')).filter(
        (log) => log.stationId === stationId,
      );
      expect(logs).toHaveLength(1);
      expect(logs[0]?.message).toContain('HTU21D');
    });
    expect(await activeAlert('sensor_error', 'bme280')).toBeDefined();
  });
});
