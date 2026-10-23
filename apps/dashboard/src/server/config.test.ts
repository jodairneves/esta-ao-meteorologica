import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const base = {
  DATABASE_URL: 'postgres://u:p@db:5432/weather',
  MQTT_URL: 'mqtt://mosquitto:1883',
  APP_URL: 'https://estacao.example.com',
};

describe('dashboard configuration', () => {
  it('defaults to one broker login per station', () => {
    const config = loadConfig({
      ...base,
      MOSQUITTO_DYNSEC_PASSWORD: 'admin-password-123',
      MQTT_COLLECTOR_PASSWORD: 'collector-password',
    });
    expect(config.mqtt).toEqual({
      mode: 'per-station',
      url: 'mqtt://mosquitto:1883',
      adminUsername: 'admin',
      adminPassword: 'admin-password-123',
      collectorPassword: 'collector-password',
    });
  });

  it('uses the single login of a shared broker', () => {
    const config = loadConfig({
      ...base,
      MQTT_AUTH_MODE: 'shared',
      MQTT_USERNAME: 'iot',
      MQTT_PASSWORD: 'broker-password',
    });
    expect(config.mqtt).toEqual({
      mode: 'shared',
      url: 'mqtt://mosquitto:1883',
      username: 'iot',
      password: 'broker-password',
    });
  });

  it('asks for the variables of the chosen mode', () => {
    expect(() => loadConfig({ ...base, MQTT_AUTH_MODE: 'shared' })).toThrow(/MQTT_USERNAME/);
    expect(() => loadConfig({ ...base })).toThrow(/MOSQUITTO_DYNSEC_PASSWORD/);
    expect(() =>
      loadConfig({ ...base, MQTT_AUTH_MODE: 'other', MQTT_USERNAME: 'u', MQTT_PASSWORD: 'p' }),
    ).toThrow(/MQTT_AUTH_MODE/);
  });
});
