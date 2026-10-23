import { DEFAULT_DEVICE_CONFIG, DEFAULT_SETTINGS } from '@wx/shared';
import { eq } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDb, createPool, type Database } from './client';
import { prepareDatabase, runMigrations } from './migrate';
import { CHANNELS, type Notification, notifyStatement, startListener } from './notify';
import { alerts, settings, stations, users } from './schema';
import { getSettings } from './settings';

const EXPECTED_TABLES = [
  'alerts',
  'commands',
  'device_health',
  'event_logs',
  'readings',
  'service_heartbeats',
  'sessions',
  'settings',
  'station_sensors',
  'station_state',
  'stations',
  'users',
];

describe('database', () => {
  let connectionString: string;
  let pool: pg.Pool;
  let db: Database;

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url)
      throw new Error('TEST_DATABASE_URL is not set: cp .env.example .env && pnpm infra:up');
    connectionString = url;
    pool = createPool(url, { max: 5, applicationName: 'wx-db-test' });
    db = createDb(pool);
    await pool.query('drop schema if exists drizzle cascade');
    await pool.query('drop schema if exists public cascade');
    await pool.query('create schema public');
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('creates the whole schema from scratch', async () => {
    await prepareDatabase(pool);
    const { rows } = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    );
    expect(rows.map((row) => row.table_name)).toEqual(EXPECTED_TABLES);
  });

  it('is idempotent and safe to run concurrently', async () => {
    await Promise.all([runMigrations(pool), runMigrations(pool), runMigrations(pool)]);
    const { rows } = await pool.query<{ applied: number }>(
      'select count(*)::int as applied from drizzle.__drizzle_migrations',
    );
    expect(rows[0]?.applied).toBe(1);
  });

  it('seeds default settings without overwriting changes', async () => {
    await db
      .update(settings)
      .set({ value: { ...DEFAULT_SETTINGS.retention, logsDays: 30 } })
      .where(eq(settings.key, 'retention'));
    await prepareDatabase(pool);
    expect((await getSettings(db, 'retention')).logsDays).toBe(30);
    expect(await getSettings(db, 'monitoring')).toEqual(DEFAULT_SETTINGS.monitoring);
  });

  it('generates UUIDv7 ids', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: 'admin@example.com', name: 'Admin', passwordHash: 'x', role: 'admin' })
      .returning();
    expect(user?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
  });

  it('enforces the domain constraints', async () => {
    await expect(
      db
        .insert(stations)
        .values({ code: 'Bad Code', name: 'x', deviceConfig: DEFAULT_DEVICE_CONFIG }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(users)
        .values({ email: 'UPPER@example.com', name: 'x', passwordHash: 'x', role: 'admin' }),
    ).rejects.toThrow();
    await expect(
      db.insert(users).values({
        email: 'root@example.com',
        name: 'x',
        passwordHash: 'x',
        role: 'root' as 'admin',
      }),
    ).rejects.toThrow();
  });

  it('allows only one active alert per condition', async () => {
    const [station] = await db
      .insert(stations)
      .values({ code: 'test-alerts', name: 'Alertas', deviceConfig: DEFAULT_DEVICE_CONFIG })
      .returning();
    if (!station) throw new Error('station not created');

    const stationAlert = {
      stationId: station.id,
      type: 'station_offline' as const,
      severity: 'warning' as const,
      message: 'Estação sem contato',
    };
    await db.insert(alerts).values(stationAlert);
    await expect(db.insert(alerts).values(stationAlert)).rejects.toThrow();

    await db.update(alerts).set({ status: 'resolved' }).where(eq(alerts.stationId, station.id));
    await db.insert(alerts).values(stationAlert);

    const systemAlert = {
      type: 'collector_down' as const,
      severity: 'critical' as const,
      message: 'Coletor fora do ar',
    };
    await db.insert(alerts).values(systemAlert);
    await expect(db.insert(alerts).values(systemAlert)).rejects.toThrow();
  });

  it('delivers NOTIFY only after the transaction commits', async () => {
    const received: Notification[] = [];
    let markConnected: () => void = () => {};
    const connected = new Promise<void>((resolve) => {
      markConnected = resolve;
    });
    const listener = startListener({
      connectionString,
      channels: [CHANNELS.stationChanged],
      onNotification: (notification) => received.push(notification),
      onConnected: () => markConnected(),
    });

    try {
      await connected;
      await db
        .transaction(async (tx) => {
          await tx.execute(notifyStatement(CHANNELS.stationChanged, { stationId: 'rolled-back' }));
          tx.rollback();
        })
        .catch(() => {});
      await db.transaction(async (tx) => {
        await tx.execute(notifyStatement(CHANNELS.stationChanged, { stationId: 'committed' }));
      });

      await vi.waitFor(() => expect(received).toHaveLength(1));
      expect(received[0]).toEqual({
        channel: 'wx_station_changed',
        payload: { stationId: 'committed' },
      });
    } finally {
      await listener.close();
    }
  });

  it('refuses NOTIFY payloads above the Postgres limit', () => {
    expect(() => notifyStatement(CHANNELS.stationChanged, { stationId: 'x'.repeat(8000) })).toThrow(
      /exceeds/,
    );
  });
});
