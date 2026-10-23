import { type Database, eq, stations } from '@wx/db';
import { type Calibration, stationLabel } from '@wx/shared';

/** What the collector needs to know about a station to process its messages. */
export interface CachedStation {
  id: string;
  code: string;
  name: string;
  /** "Estação <name>", for the Portuguese messages in logs and alerts. */
  label: string;
  isActive: boolean;
  timezone: string;
  elevationM: number | null;
  calibration: Calibration;
  intervalS: number;
  economyBatchS: number;
  survivalSleepS: number;
}

type StationRow = typeof stations.$inferSelect;

export function toCachedStation(row: StationRow): CachedStation {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    label: stationLabel(row.name),
    isActive: row.isActive,
    timezone: row.timezone,
    elevationM: row.elevationM,
    calibration: {
      rainMmPerTip: row.rainMmPerTip,
      windMsPerHz: row.windMsPerHz,
      tempOffsetC: row.tempOffsetC,
      humOffsetPct: row.humOffsetPct,
      presOffsetHpa: row.presOffsetHpa,
    },
    intervalS: row.deviceConfig.interval_s,
    economyBatchS: row.deviceConfig.economy_batch_s,
    survivalSleepS: row.deviceConfig.survival_sleep_s,
  };
}

/** Codes that are not registered are re-checked in the database at most once per minute. */
const UNKNOWN_CODE_TTL_MS = 60_000;

/**
 * In-memory station registry, refreshed on `wx_station_changed` and fully reloaded whenever
 * the LISTEN connection (re)connects, since notifications can be missed while disconnected.
 */
export class StationCache {
  private readonly byCode = new Map<string, CachedStation>();
  private readonly codeById = new Map<string, string>();
  private readonly unknownCodes = new Map<string, number>();

  constructor(private readonly db: Database) {}

  async loadAll(): Promise<void> {
    const rows = await this.db.select().from(stations);
    this.byCode.clear();
    this.codeById.clear();
    this.unknownCodes.clear();
    for (const row of rows) this.put(toCachedStation(row));
  }

  async refresh(stationId: string): Promise<void> {
    const [row] = await this.db.select().from(stations).where(eq(stations.id, stationId));
    const previousCode = this.codeById.get(stationId);
    if (previousCode) {
      this.byCode.delete(previousCode);
      this.codeById.delete(stationId);
    }
    if (row) this.put(toCachedStation(row));
  }

  async get(code: string, now = Date.now()): Promise<CachedStation | null> {
    const cached = this.byCode.get(code);
    if (cached) return cached;

    const checkedAt = this.unknownCodes.get(code);
    if (checkedAt !== undefined && now - checkedAt < UNKNOWN_CODE_TTL_MS) return null;

    // Not cached: the station may have been created while the listener was reconnecting.
    const [row] = await this.db.select().from(stations).where(eq(stations.code, code));
    if (!row) {
      this.unknownCodes.set(code, now);
      return null;
    }
    const station = toCachedStation(row);
    this.put(station);
    return station;
  }

  get size(): number {
    return this.byCode.size;
  }

  private put(station: CachedStation): void {
    this.byCode.set(station.code, station);
    this.codeById.set(station.id, station.code);
    this.unknownCodes.delete(station.code);
  }
}
