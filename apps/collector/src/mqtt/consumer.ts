import mqtt, { type IPublishPacket, type MqttClient } from 'mqtt';
import type { Logger } from '../logger';

export interface ConsumedMessage {
  topic: string;
  payload: Buffer;
  /** True when the broker replays a retained message because we (re)subscribed. */
  retain: boolean;
  receivedAt: Date;
}

/** What to do with a message whose handler threw. */
export type FailureDecision = 'retry' | 'pause' | 'drop';

export interface ConsumerOptions {
  url: string;
  username: string;
  password: string;
  clientId: string;
  topics: readonly string[];
  handle: (message: ConsumedMessage) => Promise<void>;
  /** `attempt` starts at 1. */
  onFailure: (
    error: unknown,
    message: ConsumedMessage,
    attempt: number,
  ) => Promise<FailureDecision>;
  /** Resolves when consumption may resume after a pause (or when the signal aborts). */
  waitUntilReady: (signal: AbortSignal) => Promise<void>;
  onConnectionChange?: (connected: boolean) => void;
  onPauseChange?: (paused: boolean) => void;
  logger: Logger;
}

type State = 'idle' | 'running' | 'paused' | 'stopped';

/**
 * MQTT consumer with a persistent session (clean = false) and QoS 1, where a message is only
 * acknowledged (PUBACK) after its handler succeeds. mqtt.js hands messages over one at a time.
 *
 * When the handler cannot run (database down) the consumer disconnects without acknowledging:
 * the broker keeps the unacknowledged message and queues new ones for our session, and
 * redelivers everything after we reconnect. Handlers must therefore be idempotent.
 */
export class MqttConsumer {
  private client: MqttClient | null = null;
  private state: State = 'idle';
  private inflight: Promise<void> | null = null;
  private readonly abort = new AbortController();

  constructor(private readonly options: ConsumerOptions) {}

  start(): void {
    if (this.state !== 'idle') return;
    this.state = 'running';
    this.connect();
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped') return;
    this.state = 'stopped';
    this.abort.abort();
    await this.inflight?.catch(() => {});
    const client = this.client;
    this.client = null;
    // Graceful disconnect without unsubscribing: the broker keeps queueing for our session.
    await client?.endAsync().catch(() => {});
    this.options.onConnectionChange?.(false);
  }

  private connect(): void {
    const { logger } = this.options;
    const client = mqtt.connect(this.options.url, {
      clientId: this.options.clientId,
      username: this.options.username,
      password: this.options.password,
      clean: false,
      keepalive: 30,
      reconnectPeriod: 2000,
      // mqtt.js gives up after a refused login. In a fresh deployment the dashboard creates
      // our login only after it starts, so keep trying.
      reconnectOnConnackError: true,
      connectTimeout: 10_000,
      // We subscribe on every connect ourselves (idempotent).
      resubscribe: false,
    });
    this.client = client;

    client.handleMessage = (packet, done) => {
      this.inflight = this.process(client, packet, done);
    };

    client.on('connect', (connack) => {
      logger.info({ sessionPresent: connack.sessionPresent }, 'mqtt connected');
      this.options.onConnectionChange?.(true);
      client.subscribe([...this.options.topics], { qos: 1 }, (error, granted) => {
        if (error) {
          logger.error({ err: error }, 'mqtt subscribe failed');
          return;
        }
        const refused = (granted ?? []).filter((grant) => grant.qos >= 128);
        if (refused.length > 0)
          logger.error({ refused }, 'mqtt subscription refused by the broker');
      });
    });
    client.on('close', () => {
      if (client === this.client) this.options.onConnectionChange?.(false);
    });
    client.on('error', (error) => logger.warn({ err: error }, 'mqtt error'));
  }

  private async process(
    client: MqttClient,
    packet: IPublishPacket,
    done: (error?: Error) => void,
  ): Promise<void> {
    const message: ConsumedMessage = {
      topic: packet.topic,
      payload: Buffer.isBuffer(packet.payload) ? packet.payload : Buffer.from(packet.payload),
      retain: packet.retain,
      receivedAt: new Date(),
    };
    const isCurrent = () => client === this.client && this.state === 'running';

    for (let attempt = 1; isCurrent(); attempt++) {
      try {
        await this.options.handle(message);
        if (isCurrent()) done();
        return;
      } catch (error) {
        const decision = await this.options.onFailure(error, message, attempt);
        if (decision === 'retry') continue;
        if (decision === 'drop') {
          if (isCurrent()) done();
          return;
        }
        // Not awaited: stop() waits for the in-flight message, not for the database.
        void this.pause();
        return;
      }
    }
    // Superseded (paused or stopped): leave unacknowledged so the broker redelivers it.
  }

  private async pause(): Promise<void> {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.options.onPauseChange?.(true);
    const client = this.client;
    this.client = null;
    await client?.endAsync(true).catch(() => {});
    this.options.onConnectionChange?.(false);

    await this.options.waitUntilReady(this.abort.signal);
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.options.onPauseChange?.(false);
    this.connect();
  }
}
