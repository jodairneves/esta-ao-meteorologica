import { randomBytes } from 'node:crypto';
import { COLLECTOR_TOPIC_FILTERS, stationClientId, stationTopic } from '@wx/shared';
import mqtt, { type MqttClient } from 'mqtt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapBroker } from './bootstrap';
import { deleteClient, ensureClient } from './clients';
import { connectAdmin } from './connect';
import { DynsecClient } from './dynsec';
import { generatePassword } from './password';
import { ROLE_NAMES } from './roles';
import {
  provisionStation,
  removeStation,
  rotateStationPassword,
  setStationEnabled,
} from './stations';

const suffix = randomBytes(3).toString('hex');
const CODE = `itest-${suffix}`;
const OTHER_CODE = `itest-${suffix}-b`;
// A separate client with the collector role: the real collector's persistent session is never touched.
const OBSERVER = `itest-observer-${suffix}`;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: cp .env.example .env && pnpm infra:up`);
  return value;
}

/** Connects once (no retries); rejects if the broker refuses the connection. */
function connectAs(username: string, password: string, clientId: string): Promise<MqttClient> {
  return mqtt.connectAsync(env('MQTT_URL'), {
    username,
    password,
    clientId,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 5000,
  });
}

function nextMessage(
  client: MqttClient,
  match: (topic: string) => boolean,
  timeoutMs = 3000,
): Promise<{ topic: string; payload: string }> {
  return new Promise((resolve, reject) => {
    const onMessage = (topic: string, payload: Buffer) => {
      if (!match(topic)) return;
      clearTimeout(timer);
      client.off('message', onMessage);
      resolve({ topic, payload: payload.toString() });
    };
    const timer = setTimeout(() => {
      client.off('message', onMessage);
      reject(new Error('no message received'));
    }, timeoutMs);
    client.on('message', onMessage);
  });
}

async function receivesNothing(
  client: MqttClient,
  match: (topic: string) => boolean,
  ms = 700,
): Promise<boolean> {
  try {
    await nextMessage(client, match, ms);
    return false;
  } catch {
    return true;
  }
}

async function withStation<T>(password: string, run: (station: MqttClient) => Promise<T>) {
  const station = await connectAs(CODE, password, stationClientId(CODE));
  try {
    return await run(station);
  } finally {
    await station.endAsync(true);
  }
}

describe('Mosquitto Dynamic Security', () => {
  let admin: MqttClient;
  let dynsec: DynsecClient;
  let observer: MqttClient;
  let stationPassword = generatePassword();
  const observerPassword = generatePassword();

  beforeAll(async () => {
    admin = await connectAdmin({
      url: env('MQTT_URL'),
      username: process.env.MQTT_ADMIN_USERNAME ?? 'admin',
      password: env('MOSQUITTO_DYNSEC_PASSWORD'),
      reconnectPeriodMs: 0,
    });
    dynsec = new DynsecClient(admin);
    await bootstrapBroker(dynsec, { collectorPassword: env('MQTT_COLLECTOR_PASSWORD') });
    await provisionStation(dynsec, CODE, stationPassword);
    await provisionStation(dynsec, OTHER_CODE, generatePassword());
    await ensureClient(dynsec, {
      username: OBSERVER,
      password: observerPassword,
      roles: [ROLE_NAMES.collector],
    });
    observer = await connectAs(OBSERVER, observerPassword, `${OBSERVER}-c`);
    await observer.subscribeAsync([...COLLECTOR_TOPIC_FILTERS], { qos: 1 });
  });

  afterAll(async () => {
    await observer?.endAsync(true);
    if (dynsec) {
      await removeStation(dynsec, admin, CODE).catch(() => {});
      await removeStation(dynsec, admin, OTHER_CODE).catch(() => {});
      await deleteClient(dynsec, OBSERVER).catch(() => {});
      dynsec.dispose();
    }
    await admin?.endAsync();
  });

  it('bootstrap is idempotent', async () => {
    const report = await bootstrapBroker(dynsec, {
      collectorPassword: env('MQTT_COLLECTOR_PASSWORD'),
    });
    expect(Object.values(report.roles)).toEqual(['unchanged', 'unchanged', 'unchanged']);
    expect(report.adminRolesAdded).toEqual([]);
  });

  it('delivers what a station publishes on its own topics to the collector role', async () => {
    await withStation(stationPassword, async (station) => {
      for (const kind of ['telemetry', 'status', 'health', 'event'] as const) {
        const received = nextMessage(observer, (topic) => topic === stationTopic(CODE, kind));
        await station.publishAsync(stationTopic(CODE, kind), `{"v":1,"kind":"${kind}"}`, {
          qos: 1,
        });
        expect((await received).payload).toContain(kind);
      }
    });
  });

  it('drops messages a station publishes on behalf of another station', async () => {
    await withStation(stationPassword, async (station) => {
      const spoofedTopic = stationTopic(OTHER_CODE, 'telemetry');
      const silent = receivesNothing(observer, (topic) => topic === spoofedTopic);
      await station.publishAsync(spoofedTopic, '{"v":1}', { qos: 1 });
      expect(await silent).toBe(true);
    });
  });

  it('lets a station subscribe only to its own config and commands', async () => {
    // mqtt.js rejects the whole call when any filter is refused (SUBACK 0x80), so try one by one.
    const canSubscribe = (station: MqttClient, filter: string) =>
      station.subscribeAsync(filter, { qos: 1 }).then(
        () => true,
        () => false,
      );

    await withStation(stationPassword, async (station) => {
      expect(await canSubscribe(station, stationTopic(CODE, 'config'))).toBe(true);
      expect(await canSubscribe(station, stationTopic(CODE, 'cmd'))).toBe(true);
      expect(await canSubscribe(station, stationTopic(OTHER_CODE, 'cmd'))).toBe(false);
      expect(await canSubscribe(station, stationTopic(OTHER_CODE, 'telemetry'))).toBe(false);
      expect(await canSubscribe(station, 'weather/v1/#')).toBe(false);
    });
  });

  it('delivers retained config and commands from the dashboard to the station', async () => {
    await admin.publishAsync(stationTopic(CODE, 'config'), '{"v":1,"rev":7}', {
      qos: 1,
      retain: true,
    });
    await withStation(stationPassword, async (station) => {
      const config = nextMessage(station, (topic) => topic === stationTopic(CODE, 'config'));
      await station.subscribeAsync([stationTopic(CODE, 'config'), stationTopic(CODE, 'cmd')], {
        qos: 1,
      });
      expect((await config).payload).toContain('"rev":7');

      const command = nextMessage(station, (topic) => topic === stationTopic(CODE, 'cmd'));
      await admin.publishAsync(stationTopic(CODE, 'cmd'), '{"v":1,"cmd":"identify"}', { qos: 1 });
      expect((await command).payload).toContain('identify');
    });
  });

  it('requires the station client id and the right password', async () => {
    await expect(connectAs(CODE, stationPassword, 'someone-else')).rejects.toThrow();
    await expect(connectAs(CODE, 'wrong-password', stationClientId(CODE))).rejects.toThrow();
  });

  it('invalidates the old password after a rotation', async () => {
    const newPassword = generatePassword();
    await rotateStationPassword(dynsec, CODE, newPassword);
    await expect(connectAs(CODE, stationPassword, stationClientId(CODE))).rejects.toThrow();
    stationPassword = newPassword;
    await withStation(stationPassword, async (station) => {
      expect(station.connected).toBe(true);
    });
  });

  it('disconnects and blocks a disabled station until it is enabled again', async () => {
    const station = await connectAs(CODE, stationPassword, stationClientId(CODE));
    const closed = new Promise<void>((resolve) => station.once('close', () => resolve()));
    await setStationEnabled(dynsec, CODE, false);
    await closed;
    await station.endAsync(true);
    await expect(connectAs(CODE, stationPassword, stationClientId(CODE))).rejects.toThrow();

    await setStationEnabled(dynsec, CODE, true);
    await withStation(stationPassword, async (reconnected) => {
      expect(reconnected.connected).toBe(true);
    });
  });

  it('removes the client and clears retained topics when a station is deleted', async () => {
    await admin.publishAsync(stationTopic(CODE, 'config'), '{"v":1,"rev":8}', {
      qos: 1,
      retain: true,
    });
    await removeStation(dynsec, admin, CODE);

    expect(await dynsec.getClient(CODE)).toBeNull();
    await expect(connectAs(CODE, stationPassword, stationClientId(CODE))).rejects.toThrow();

    const configTopic = stationTopic(CODE, 'config');
    const silent = receivesNothing(admin, (topic) => topic === configTopic);
    await admin.subscribeAsync(configTopic, { qos: 1 });
    expect(await silent).toBe(true);
  });
});
