import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  alerts,
  and,
  createDb,
  createPool,
  type Database,
  type DbPool,
  eq,
  eventLogs,
  openAlert,
  prepareDatabase,
  readings,
  stationSensors,
  stations,
  users,
} from '@wx/db';
import { stationClientId, stationTopic } from '@wx/shared';
import mqtt, { type MqttClient } from 'mqtt';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  AlertDto,
  CreateStationResponse,
  LatestResponse,
  LocalPageAccess,
  LogDto,
  Page,
  SeriesResponse,
  StationCredentials,
  StationDetail,
  StationSummary,
  SystemStatus,
  TemporaryPasswordResponse,
} from '../common/api';
import { buildApp } from './app';
import { ensureFirstAdmin } from './auth/first-admin';
import type { DashboardConfig } from './config';
import { BrokerAdmin } from './services/broker';
import { EventHub } from './services/events';

const APP_URL = 'http://localhost:5173';
const ADMIN = { email: 'admin@test.local', password: 'admin-password-1' };

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: cp .env.example .env && pnpm infra:up`);
  return value;
}

type App = Awaited<ReturnType<typeof buildApp>>;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A signed-in browser: session cookie, Origin and the CSRF header on every call. */
function clientFor(app: App, cookie: string) {
  const call = (method: Method, url: string, payload?: unknown) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      cookies: { wx_session: cookie },
      headers: { origin: APP_URL, 'x-wx-request': '1' },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  return {
    get: (url: string) => call('GET', url),
    post: (url: string, payload?: unknown) => call('POST', url, payload ?? {}),
    put: (url: string, payload: unknown) => call('PUT', url, payload),
    patch: (url: string, payload: unknown) => call('PATCH', url, payload),
    del: (url: string, payload?: unknown) => call('DELETE', url, payload ?? {}),
  };
}

async function login(app: App, email: string, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: APP_URL, 'x-wx-request': '1' },
    payload: { email, password },
  });
  const cookie = response.cookies.find((c) => c.name === 'wx_session');
  if (response.statusCode !== 200 || !cookie) {
    throw new Error(`login failed (${response.statusCode}): ${response.body}`);
  }
  return { client: clientFor(app, cookie.value), cookie };
}

// Generated local page passwords: three groups of four, no look-alike characters.
const LOCAL_PASSWORD_FORMAT = /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/;

describe('dashboard API', () => {
  let pool: DbPool;
  let db: Database;
  let broker: BrokerAdmin;
  let hub: EventHub;
  let app: App;
  let admin: ReturnType<typeof clientFor>;
  let config: DashboardConfig;
  const stationClients: MqttClient[] = [];
  const createdCodes: string[] = [];
  const suffix = randomBytes(2).toString('hex');

  const connectStation = (credentials: StationCredentials) =>
    mqtt.connectAsync(env('MQTT_URL'), {
      username: credentials.username,
      password: credentials.password ?? undefined,
      clientId: credentials.clientId,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 5000,
    });

  beforeAll(async () => {
    const databaseUrl = env('TEST_DATABASE_URL');
    pool = createPool(databaseUrl, { max: 5, onError: () => {} });
    db = createDb(pool);
    await pool.query('drop schema if exists drizzle cascade');
    await pool.query('drop schema if exists public cascade');
    await pool.query('create schema public');
    await prepareDatabase(pool);

    const logger = pino({ level: 'silent' });
    config = {
      databaseUrl,
      mqtt: {
        mode: 'per-station',
        url: env('MQTT_URL'),
        adminUsername: process.env.MQTT_ADMIN_USERNAME ?? 'admin',
        adminPassword: env('MOSQUITTO_DYNSEC_PASSWORD'),
        collectorPassword: env('MQTT_COLLECTOR_PASSWORD'),
      },
      firstAdmin: { ...ADMIN, name: 'Admin Teste' },
      appUrl: new URL(APP_URL),
      publicMqtt: { host: 'mqtt.test.local', port: 8883, tls: true },
      host: '127.0.0.1',
      port: 0,
      trustProxy: false,
      logLevel: 'silent',
      session: { ttlMs: 3_600_000, rememberMs: 86_400_000, secureCookie: false },
    };

    broker = new BrokerAdmin(config.mqtt, logger);
    broker.start();
    await vi.waitFor(() => expect(broker.connected).toBe(true), { timeout: 10_000 });
    hub = new EventHub(logger);
    await ensureFirstAdmin(db, config, logger);
    app = await buildApp({
      config,
      db,
      logger,
      broker,
      hub,
      version: 'test',
      startedAt: new Date(),
    });
    await app.ready();
    admin = (await login(app, ADMIN.email, ADMIN.password)).client;
  });

  afterAll(async () => {
    await Promise.allSettled(stationClients.map((client) => client.endAsync(true)));
    for (const code of createdCodes) await broker?.remove(code).catch(() => {});
    await app?.close();
    hub?.close();
    await broker?.stop();
    await pool?.end();
  });

  describe('authentication', () => {
    it('signs in with an http-only, same-site cookie and signs out', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: APP_URL, 'x-wx-request': '1' },
        payload: ADMIN,
      });
      expect(response.statusCode).toBe(200);
      const cookie = response.cookies.find((c) => c.name === 'wx_session');
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });

      const client = clientFor(app, cookie?.value ?? '');
      expect((await client.get('/auth/me')).json()).toMatchObject({
        user: { email: ADMIN.email, role: 'admin' },
      });
      expect((await client.post('/auth/logout')).statusCode).toBe(204);
      expect((await client.get('/auth/me')).statusCode).toBe(401);
    });

    it('rejects wrong credentials without revealing which part is wrong', async () => {
      for (const payload of [
        { email: ADMIN.email, password: 'wrong-password' },
        { email: 'nobody@test.local', password: 'whatever-123' },
      ]) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: { 'x-wx-request': '1' },
          payload,
        });
        expect(response.statusCode).toBe(401);
        expect(response.json().error.message).toBe('E-mail ou senha inválidos');
      }
    });

    it('requires the CSRF header and our Origin on state-changing calls', async () => {
      const noHeader = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
      expect(noHeader.statusCode).toBe(403);
      const foreign = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { origin: 'https://evil.example', 'x-wx-request': '1' },
      });
      expect(foreign.statusCode).toBe(403);
      expect(foreign.json().error.code).toBe('CSRF');
    });

    it('rate-limits repeated attempts for the same e-mail', async () => {
      const attempt = () =>
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: { 'x-wx-request': '1' },
          payload: { email: 'brute@test.local', password: 'guess-guess-1' },
        });
      const statuses = [];
      for (let i = 0; i < 6; i++) statuses.push((await attempt()).statusCode);
      expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(statuses[5]).toBe(429);
    });

    it('locks an account after ten wrong passwords', async () => {
      const email = `locked-${suffix}@test.local`;
      const created = await admin.post('/users', { name: 'Bloqueado', email, role: 'operator' });
      const { temporaryPassword } = created.json() as TemporaryPasswordResponse;
      await db.update(users).set({ failedLogins: 9 }).where(eq(users.email, email));

      const wrong = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'x-wx-request': '1' },
        payload: { email, password: 'wrong-password' },
      });
      expect(wrong.statusCode).toBe(401);
      const right = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'x-wx-request': '1' },
        payload: { email, password: temporaryPassword },
      });
      expect(right.statusCode).toBe(429);
      expect(right.json().error.code).toBe('ACCOUNT_LOCKED');
    });
  });

  describe('users and permissions', () => {
    it('makes a new operator replace the temporary password before anything else', async () => {
      const email = `operador-${suffix}@test.local`;
      const created = await admin.post('/users', { name: 'Operador', email, role: 'operator' });
      expect(created.statusCode).toBe(201);
      const { temporaryPassword, user } = created.json() as TemporaryPasswordResponse;
      expect(user.mustChangePassword).toBe(true);

      const { client: operator } = await login(app, email, temporaryPassword);
      expect((await operator.get('/stations')).json().error.code).toBe('PASSWORD_CHANGE_REQUIRED');

      const wrongCurrent = await operator.post('/auth/password', {
        currentPassword: 'not-it',
        newPassword: 'nova-senha-segura-1',
      });
      expect(wrongCurrent.statusCode).toBe(400);
      const tooShort = await operator.post('/auth/password', {
        currentPassword: temporaryPassword,
        newPassword: 'curta',
      });
      expect(tooShort.statusCode).toBe(400);
      const changed = await operator.post('/auth/password', {
        currentPassword: temporaryPassword,
        newPassword: 'nova-senha-segura-1',
      });
      expect(changed.statusCode).toBe(200);
      expect((await operator.get('/stations')).statusCode).toBe(200);
    });

    it('keeps operators read-only', async () => {
      const email = `leitor-${suffix}@test.local`;
      const { temporaryPassword } = (
        await admin.post('/users', { name: 'Leitor', email, role: 'operator' })
      ).json() as TemporaryPasswordResponse;
      const { client: firstSession } = await login(app, email, temporaryPassword);
      await firstSession.post('/auth/password', {
        currentPassword: temporaryPassword,
        newPassword: 'senha-do-leitor-1',
      });
      const { client: operator } = await login(app, email, 'senha-do-leitor-1');

      expect((await operator.get('/stations')).statusCode).toBe(200);
      expect((await operator.get('/users')).statusCode).toBe(403);
      expect(
        (await operator.post('/users', { name: 'X', email: 'x@test.local', role: 'admin' }))
          .statusCode,
      ).toBe(403);
      expect((await operator.post('/stations', { name: 'Proibida' })).statusCode).toBe(403);
      expect((await operator.put('/settings', {})).statusCode).toBe(403);
      expect((await operator.get('/stations/qualquer/local-access')).statusCode).toBe(403);
    });

    it('never leaves the system without an active administrator', async () => {
      const [me] = await db.select().from(users).where(eq(users.email, ADMIN.email));
      expect((await admin.patch(`/users/${me?.id}`, { isActive: false })).statusCode).toBe(403);
      expect((await admin.patch(`/users/${me?.id}`, { role: 'operator' })).statusCode).toBe(403);
      expect((await admin.del(`/users/${me?.id}`)).statusCode).toBe(403);
    });
  });

  describe('stations', () => {
    let created: CreateStationResponse;
    let station: MqttClient;

    it('registers a station and returns working MQTT credentials once', async () => {
      const response = await admin.post('/stations', {
        name: `Estação Teste ${suffix}`,
        latitude: -22.7,
        longitude: -47.6,
        elevationM: 500,
      });
      expect(response.statusCode).toBe(201);
      created = response.json() as CreateStationResponse;
      createdCodes.push(created.station.code);
      expect(created.station.code).toBe(`estacao-teste-${suffix}`);
      expect(created.credentials).toMatchObject({
        username: created.station.code,
        clientId: stationClientId(created.station.code),
        host: 'mqtt.test.local',
        port: 8883,
        tls: true,
      });
      expect(created.credentials.password).toHaveLength(24);

      station = await connectStation(created.credentials);
      stationClients.push(station);
      const config = new Promise<string>((resolve) =>
        station.on('message', (topic, payload) => {
          if (topic === stationTopic(created.station.code, 'config')) resolve(payload.toString());
        }),
      );
      await station.subscribeAsync(stationTopic(created.station.code, 'config'), { qos: 1 });
      expect(JSON.parse(await config)).toMatchObject({
        v: 1,
        rev: 1,
        interval_s: 60,
        local_password: expect.stringMatching(LOCAL_PASSWORD_FORMAT),
      });
      expect(created.station.state.ipAddress).toBeNull();
    });

    it('refuses a duplicate code', async () => {
      const response = await admin.post('/stations', { name: 'Outra', code: created.station.code });
      expect(response.statusCode).toBe(409);
    });

    it('publishes a new configuration revision and commands to the station', async () => {
      const code = created.station.code;
      const received: { topic: string; payload: Record<string, unknown> }[] = [];
      station.on('message', (topic, payload) =>
        received.push({ topic, payload: JSON.parse(payload.toString()) }),
      );
      await station.subscribeAsync(stationTopic(code, 'cmd'), { qos: 1 });

      const config = { ...created.station.deviceConfig, interval_s: 30 };
      const updated = await admin.put(`/stations/${code}/device-config`, config);
      expect(updated.json()).toMatchObject({ deviceConfigRev: 2 });
      const invalid = await admin.put(`/stations/${code}/device-config`, {
        ...config,
        interval_s: 1,
      });
      expect(invalid.statusCode).toBe(400);

      const command = await admin.post(`/stations/${code}/commands`, { command: 'identify' });
      expect(command.statusCode).toBe(201);
      const commandId = command.json().id;

      await vi.waitFor(() => {
        expect(received).toContainEqual({
          topic: stationTopic(code, 'config'),
          payload: expect.objectContaining({ rev: 2, interval_s: 30 }),
        });
        expect(received).toContainEqual({
          topic: stationTopic(code, 'cmd'),
          payload: expect.objectContaining({ id: commandId, cmd: 'identify' }),
        });
      });
      expect((await admin.get(`/stations/${code}/commands`)).json()[0]).toMatchObject({
        id: commandId,
        status: 'sent',
      });
    });

    it('disables, re-enables and rotates the credentials of a station', async () => {
      const code = created.station.code;
      expect((await admin.patch(`/stations/${code}`, { isActive: false })).json()).toMatchObject({
        isActive: false,
        status: 'inactive',
      });
      await expect(connectStation(created.credentials)).rejects.toThrow();
      await admin.patch(`/stations/${code}`, { isActive: true });

      const rotated = (
        await admin.post(`/stations/${code}/credentials`)
      ).json() as StationCredentials;
      expect(rotated.password).not.toBe(created.credentials.password);
      await expect(connectStation(created.credentials)).rejects.toThrow();
      const reconnected = await connectStation(rotated);
      stationClients.push(reconnected);
      created = { ...created, credentials: rotated };
    });

    it('shows the local page login to admins and sends a new password in the config', async () => {
      const code = created.station.code;
      const shown = (await admin.get(`/stations/${code}/local-access`)).json() as LocalPageAccess;
      expect(shown).toEqual({
        username: 'admin',
        password: expect.stringMatching(LOCAL_PASSWORD_FORMAT),
      });
      const [viewed] = await db
        .select()
        .from(eventLogs)
        .where(
          and(
            eq(eventLogs.stationId, created.station.id),
            eq(eventLogs.code, 'LOCAL_PASSWORD_VIEWED'),
          ),
        );
      expect(viewed).toBeDefined();

      const listener = await connectStation(created.credentials);
      stationClients.push(listener);
      const configs: Record<string, unknown>[] = [];
      listener.on('message', (topic, payload) => {
        if (topic === stationTopic(code, 'config')) configs.push(JSON.parse(payload.toString()));
      });
      await listener.subscribeAsync(stationTopic(code, 'config'), { qos: 1 });

      const before = (await admin.get(`/stations/${code}`)).json() as StationDetail;
      const rotated = (
        await admin.post(`/stations/${code}/local-access`)
      ).json() as LocalPageAccess;
      expect(rotated.password).toMatch(LOCAL_PASSWORD_FORMAT);
      expect(rotated.password).not.toBe(shown.password);
      await vi.waitFor(() =>
        expect(configs).toContainEqual(
          expect.objectContaining({
            rev: before.deviceConfigRev + 1,
            local_password: rotated.password,
            interval_s: before.deviceConfig.interval_s,
          }),
        ),
      );
      // The desired configuration seen by every user never carries the password.
      const after = (await admin.get(`/stations/${code}`)).json() as StationDetail;
      expect(after.deviceConfigRev).toBe(before.deviceConfigRev + 1);
      expect(JSON.stringify(after)).not.toContain(rotated.password as string);
    });

    it('deletes a station only after the code is typed', async () => {
      const response = await admin.post('/stations', { name: `Descartável ${suffix}` });
      const disposable = response.json() as CreateStationResponse;
      createdCodes.push(disposable.station.code);
      expect(
        (await admin.del(`/stations/${disposable.station.code}`, { confirmCode: 'nope' }))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await admin.del(`/stations/${disposable.station.code}`, {
            confirmCode: disposable.station.code,
          })
        ).statusCode,
      ).toBe(204);
      expect((await admin.get(`/stations/${disposable.station.code}`)).statusCode).toBe(404);
      await expect(connectStation(disposable.credentials)).rejects.toThrow();
    });

    it('registers the HTU21D version and switches versions cleanly', async () => {
      const response = await admin.post('/stations', {
        name: `Horta ${suffix}`,
        climateSensor: 'htu21d',
      });
      expect(response.statusCode).toBe(201);
      const htu = (response.json() as CreateStationResponse).station;
      createdCodes.push(htu.code);
      expect(htu.climateSensor).toBe('htu21d');
      expect(
        (await admin.post('/stations', { name: 'Outra', climateSensor: 'dht22' })).statusCode,
      ).toBe(400);

      // What the collector had recorded about the HTU21D before the version change.
      await db
        .insert(stationSensors)
        .values({ stationId: htu.id, sensor: 'htu21d', status: 'error' });
      await openAlert(db, {
        stationId: htu.id,
        type: 'sensor_error',
        subject: 'htu21d',
        severity: 'warning',
        message: 'Falha no HTU21D',
      });

      const switched = (
        await admin.patch(`/stations/${htu.code}`, { climateSensor: 'bme280' })
      ).json() as StationDetail;
      expect(switched.climateSensor).toBe('bme280');
      expect(switched.sensors.map((sensor) => sensor.sensor)).not.toContain('htu21d');
      expect(switched.alerts.filter((alert) => alert.subject === 'htu21d')).toHaveLength(0);
    });
  });

  describe('readings', () => {
    let code: string;

    beforeAll(async () => {
      const response = await admin.post('/stations', { name: `Dados ${suffix}`, elevationM: 500 });
      const created = response.json() as CreateStationResponse;
      code = created.station.code;
      createdCodes.push(code);

      // Three days of hourly readings ending now, rain only in the last 2 hours.
      const now = Date.now();
      const rows = Array.from({ length: 72 }, (_, i) => {
        const ts = new Date(now - (71 - i) * 3_600_000);
        return {
          stationId: created.station.id,
          ts,
          run: 1,
          seq: i + 1,
          intervalS: 3600,
          temperatureC: 20 + (i % 24) / 2,
          humidityPct: 60,
          pressureHpa: 950 + i / 10,
          pressureMslHpa: 1010 + i / 10,
          dewPointC: 12,
          windSpeedMs: 2,
          windGustMs: 4 + (i % 5),
          rainMm: i >= 70 ? 1.5 : 0,
          windPulses: 100,
          gustPulses: 10,
          rainCount: i >= 70 ? (i - 69) * 3 : 0,
        };
      });
      await db.insert(readings).values(rows);
    });

    it('returns the latest values with derived data and rain totals', async () => {
      const latest = (await admin.get(`/stations/${code}/latest`)).json() as LatestResponse;
      expect(latest.reading?.temperatureC).toBe(20 + (71 % 24) / 2);
      expect(latest.derived.beaufort).toEqual({ force: 2, label: 'Aragem' });
      expect(latest.derived.pressureChange3hHpa).toBeCloseTo(0.3, 1);
      expect(latest.derived.pressureTrend).toBe('rising_slowly');
      expect(latest.rain.last24hMm).toBe(3);
      expect(latest.rain.last7dMm).toBe(3);
    });

    it('serves series with automatic aggregation', async () => {
      const day = (await admin.get(`/stations/${code}/series`)).json() as SeriesResponse;
      expect(day.bucket).toBe('raw');
      expect(day.t.length).toBeGreaterThanOrEqual(24);

      const from = new Date(Date.now() - 5 * 86_400_000).toISOString();
      const week = (
        await admin.get(`/stations/${code}/series?from=${encodeURIComponent(from)}`)
      ).json() as SeriesResponse;
      expect(week.bucket).toBe('10m');
      expect(week.temperature.min).toBeDefined();
      expect(week.rain.avg.reduce<number>((sum, v) => sum + (v ?? 0), 0)).toBe(3);

      const daily = (
        await admin.get(`/stations/${code}/series?from=${encodeURIComponent(from)}&bucket=1d`)
      ).json() as SeriesResponse;
      expect(daily.bucket).toBe('1d');
      expect(daily.t.length).toBeGreaterThanOrEqual(3);

      const tooLongRaw = await admin.get(
        `/stations/${code}/series?from=${encodeURIComponent(new Date(Date.now() - 20 * 86_400_000).toISOString())}&bucket=raw`,
      );
      expect(tooLongRaw.statusCode).toBe(400);
    });

    it('summarises days, builds the heatmap and compares stations', async () => {
      const daily = (await admin.get(`/stations/${code}/daily`)).json() as { readings: number }[];
      expect(daily.reduce((sum, row) => sum + row.readings, 0)).toBe(72);

      const heatmap = (await admin.get(`/stations/${code}/heatmap?metric=temperature`)).json();
      expect(heatmap.cells.length).toBe(72);

      const compare = (await admin.get(`/compare?stations=${code},${code}&metric=gust`)).json();
      expect(compare.series).toHaveLength(2);
    });

    it('exports CSV in the Brazilian Excel format', async () => {
      const response = await admin.get(`/stations/${code}/export.csv?bucket=1h`);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain(`${code}_`);
      const body = response.body;
      expect(body.charCodeAt(0)).toBe(0xfeff);
      const [header, first] = body.slice(1).split('\r\n');
      expect(header?.split(';')[0]).toBe('Data/hora');
      expect(first).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2};/);
      expect(first).toMatch(/;\d+,\d+;/);
    });

    it('lists the station with its latest values', async () => {
      const list = (await admin.get('/stations')).json() as StationSummary[];
      const summary = list.find((s) => s.code === code);
      expect(summary?.latest?.windGustMs).toBeGreaterThan(0);
      expect(summary?.sparkline).toHaveLength(24);
    });
  });

  describe('alerts, logs and system', () => {
    it('lists and acknowledges alerts', async () => {
      const [anyStation] = await db.select().from(stations).limit(1);
      const [alert] = await db
        .insert(alerts)
        .values({
          stationId: anyStation?.id ?? null,
          type: 'battery_low',
          severity: 'warning',
          message: 'Bateria baixa (teste)',
        })
        .returning();
      const page = (await admin.get('/alerts?status=active')).json() as Page<AlertDto>;
      expect(page.items.some((item) => item.id === alert?.id)).toBe(true);

      const acked = (await admin.post(`/alerts/${alert?.id}/ack`)).json() as AlertDto;
      expect(acked.acknowledgedBy).toBe(ADMIN.email);
      expect(acked.acknowledgedAt).not.toBeNull();
    });

    it('filters the system log by level and text', async () => {
      const warnings = (await admin.get('/logs?level=warn&limit=200')).json() as Page<LogDto>;
      expect(warnings.items.length).toBeGreaterThan(0);
      expect(warnings.items.every((log) => ['warn', 'error', 'critical'].includes(log.level))).toBe(
        true,
      );

      const search = (await admin.get('/logs?q=senha%20incorreta')).json() as Page<LogDto>;
      expect(
        search.items.every((log) => log.message.toLowerCase().includes('senha incorreta')),
      ).toBe(true);
    });

    it('reports the system status', async () => {
      const status = (await admin.get('/system/status')).json() as SystemStatus;
      expect(status.broker.connected).toBe(true);
      expect(status.stations.total).toBeGreaterThan(0);
      expect(status.database.sizeBytes).toBeGreaterThan(0);
    });

    it('answers the health check without a session', async () => {
      const response = await app.inject({ method: 'GET', url: '/healthz' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true, broker: true });
    });

    it('validates and stores the settings', async () => {
      const current = (await admin.get('/settings')).json();
      const invalid = await admin.put('/settings', {
        monitoring: { ...current.monitoring, batteryCriticalMv: 3900, batteryLowMv: 3600 },
      });
      expect(invalid.statusCode).toBe(400);
      const saved = await admin.put('/settings', {
        retention: { ...current.retention, logsDays: 60 },
      });
      expect(saved.json().retention.logsDays).toBe(60);
    });
  });

  describe('with a shared broker login', () => {
    // A broker run by someone else, with one login for everyone, stations included (design
    // §3.10). The dev broker's admin stands in for that login: it publishes the configuration and
    // reads $SYS, which is all the dashboard needs in this mode.
    const sharedUsername = process.env.MQTT_ADMIN_USERNAME ?? 'admin';
    const connectObserver = () =>
      mqtt.connectAsync(env('MQTT_URL'), {
        username: sharedUsername,
        password: env('MOSQUITTO_DYNSEC_PASSWORD'),
        clean: true,
        reconnectPeriod: 0,
      });
    let sharedApp: App;
    let sharedBroker: BrokerAdmin;
    let shared: ReturnType<typeof clientFor>;
    let code: string;

    beforeAll(async () => {
      const logger = pino({ level: 'silent' });
      const sharedConfig: DashboardConfig = {
        ...config,
        mqtt: {
          mode: 'shared',
          url: env('MQTT_URL'),
          username: sharedUsername,
          password: env('MOSQUITTO_DYNSEC_PASSWORD'),
        },
      };
      sharedBroker = new BrokerAdmin(sharedConfig.mqtt, logger);
      sharedBroker.start();
      await vi.waitFor(() => expect(sharedBroker.connected).toBe(true), { timeout: 10_000 });
      sharedApp = await buildApp({
        config: sharedConfig,
        db,
        logger,
        broker: sharedBroker,
        hub: new EventHub(logger),
        version: 'test',
        startedAt: new Date(),
      });
      await sharedApp.ready();
      shared = (await login(sharedApp, ADMIN.email, ADMIN.password)).client;
    });

    afterAll(async () => {
      await sharedApp?.close();
      await sharedBroker?.stop();
    });

    it('registers a station that uses the broker login', async () => {
      const response = await shared.post('/stations', { name: `Compartilhada ${suffix}` });
      expect(response.statusCode).toBe(201);
      const created = response.json() as CreateStationResponse;
      code = created.station.code;
      expect(created.credentials).toEqual({
        login: 'shared',
        username: sharedUsername,
        password: null,
        clientId: stationClientId(code),
        host: 'mqtt.test.local',
        port: 8883,
        tls: true,
      });
      expect(created.station.mqttCredentialsSetAt).toBeNull();

      // The configuration is retained for the station, as with a login of its own.
      const observer = await connectObserver();
      const retained = new Promise<string>((resolve) =>
        observer.on('message', (topic, payload) => {
          if (topic === stationTopic(code, 'config')) resolve(payload.toString());
        }),
      );
      await observer.subscribeAsync(stationTopic(code, 'config'), { qos: 1 });
      expect(JSON.parse(await retained)).toMatchObject({ v: 1, rev: 1 });
      await observer.endAsync();
    });

    it('has no station password to replace', async () => {
      const response = await shared.post(`/stations/${code}/credentials`);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: { code: 'SHARED_BROKER_LOGIN' } });
    });

    it('disables a station without a login to block', async () => {
      const response = await shared.patch(`/stations/${code}`, { isActive: false });
      expect(response.statusCode).toBe(200);
      expect((response.json() as StationDetail).isActive).toBe(false);
    });

    it('reports the shared login in the system status', async () => {
      const status = (await shared.get('/system/status')).json() as SystemStatus;
      expect(status.broker).toMatchObject({ connected: true, login: 'shared' });
    });

    it('clears the retained messages of a deleted station', async () => {
      expect((await shared.del(`/stations/${code}`, { confirmCode: code })).statusCode).toBe(204);
      const observer = await connectObserver();
      const received: string[] = [];
      observer.on('message', (_topic, payload) => received.push(payload.toString()));
      await observer.subscribeAsync(stationTopic(code, 'config'), { qos: 1 });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await observer.endAsync();
      expect(received.filter((payload) => payload.length > 0)).toEqual([]);
    });
  });

  describe('server-sent events', () => {
    it('streams events to signed-in browsers', async () => {
      const { cookie } = await login(app, ADMIN.email, ADMIN.password);
      await app.listen({ host: '127.0.0.1', port: 0 });
      const { port } = app.server.address() as AddressInfo;

      const anonymous = await fetch(`http://127.0.0.1:${port}/api/v1/stream`);
      expect(anonymous.status).toBe(401);

      const controller = new AbortController();
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/stream`, {
        headers: { cookie: `wx_session=${cookie.value}` },
        signal: controller.signal,
      });
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('no body');

      await vi.waitFor(() => expect(hub.size).toBeGreaterThan(0));
      hub.handle({
        channel: 'wx_alert',
        payload: {
          alertId: 1,
          stationId: null,
          type: 'collector_down',
          status: 'active',
          severity: 'critical',
        },
      });

      let text = '';
      while (!text.includes('event: alert')) {
        const { value, done } = await reader.read();
        if (done) break;
        text += new TextDecoder().decode(value);
      }
      expect(text).toContain('"type":"collector_down"');
      controller.abort();
    });
  });
});
