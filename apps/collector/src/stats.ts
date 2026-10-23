import type { StationPublishedKind } from '@wx/shared';

/** Counters reported in the heartbeat and shown on the dashboard's system page. */
export class CollectorStats {
  readonly startedAt = new Date();
  mqttConnected = false;
  paused = false;
  received: Record<StationPublishedKind, number> = { telemetry: 0, status: 0, health: 0, event: 0 };
  readingsStored = 0;
  duplicates = 0;
  rejected = 0;
  dbOutages = 0;
  lastMessageAt: Date | null = null;

  recordReceived(kind: StationPublishedKind, at: Date): void {
    this.received[kind]++;
    this.lastMessageAt = at;
  }

  toJSON(): Record<string, unknown> {
    return {
      startedAt: this.startedAt.toISOString(),
      mqttConnected: this.mqttConnected,
      paused: this.paused,
      received: { ...this.received },
      readingsStored: this.readingsStored,
      duplicates: this.duplicates,
      rejected: this.rejected,
      dbOutages: this.dbOutages,
      lastMessageAt: this.lastMessageAt?.toISOString() ?? null,
    };
  }
}
