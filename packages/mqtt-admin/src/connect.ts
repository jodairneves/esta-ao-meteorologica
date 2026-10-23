import { randomBytes } from 'node:crypto';
import mqtt, { type MqttClient } from 'mqtt';

export interface AdminConnectionOptions {
  url: string;
  username: string;
  password: string;
  clientId?: string;
  /** 0 disables automatic reconnection (one-shot scripts). */
  reconnectPeriodMs?: number;
}

/** Connects with a clean session; resolves after CONNACK, rejects on refusal. */
export function connectAdmin(options: AdminConnectionOptions): Promise<MqttClient> {
  return mqtt.connectAsync(options.url, {
    username: options.username,
    password: options.password,
    clientId: options.clientId ?? `wx-admin-${randomBytes(4).toString('hex')}`,
    clean: true,
    reconnectPeriod: options.reconnectPeriodMs ?? 1000,
    connectTimeout: 10_000,
  });
}
