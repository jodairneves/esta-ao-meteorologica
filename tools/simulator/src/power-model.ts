import type { DeviceConfig, PowerMode } from '@wx/shared';
import type { PowerProfile } from './demo-stations';
import { clamp } from './rng';

/** Average current drawn in each profile (design §4.3). */
const LOAD_MA: Record<PowerMode, number> = { normal: 28, economy: 16, survival: 0.5 };
const CHARGER_EFFICIENCY = 0.85;
const BROWNOUT_MV = 3300;
const RESTART_MV = 3550;
/** Consecutive measurements needed to switch profiles (hysteresis). */
const SWITCH_AFTER = 3;

// Resting voltage of a Li-ion cell by state of charge (%).
const SOC_TO_MV: ReadonlyArray<readonly [soc: number, mv: number]> = [
  [0, 3300],
  [5, 3500],
  [10, 3610],
  [20, 3670],
  [30, 3710],
  [40, 3750],
  [50, 3790],
  [60, 3850],
  [70, 3920],
  [80, 4000],
  [90, 4100],
  [100, 4200],
];

export function socToMv(soc: number): number {
  for (let i = 1; i < SOC_TO_MV.length; i++) {
    const lower = SOC_TO_MV[i - 1];
    const upper = SOC_TO_MV[i];
    if (!lower || !upper) break;
    if (soc <= upper[0]) {
      const ratio = (soc - lower[0]) / (upper[0] - lower[0]);
      return lower[1] + ratio * (upper[1] - lower[1]);
    }
  }
  return 4200;
}

export interface PowerStep {
  batteryMv: number;
  mode: PowerMode;
  modeChanged: { from: PowerMode; to: PowerMode } | null;
  /** Below the brownout voltage the station is off: no readings at all. */
  dead: boolean;
  /** The station just came back after a brownout (RTC memory lost: new run). */
  revived: boolean;
}

/** Battery, solar charging and the automatic power profiles of the firmware. */
export class PowerModel {
  private soc: number;
  private mode: PowerMode;
  private dead = false;
  private pending: { mode: PowerMode; count: number } | null = null;

  constructor(
    private readonly profile: PowerProfile,
    private readonly longitude: number,
    private readonly thresholds: () => DeviceConfig['power'],
  ) {
    this.soc = profile.initialSocPct;
    this.mode = this.bootMode(socToMv(this.soc));
  }

  get currentMode(): PowerMode {
    return this.mode;
  }

  step(endMs: number, durationS: number, cloudy: boolean): PowerStep {
    const solarHour = (((endMs / 3_600_000 + this.longitude / 15) % 24) + 24) % 24;
    const sun = Math.max(0, Math.sin((Math.PI * (solarHour - 6)) / 12));
    const chargeMa = this.profile.solarPeakMa * sun * (cloudy ? 0.25 : 1) * CHARGER_EFFICIENCY;
    const loadMa = this.dead ? 0.05 : LOAD_MA[this.mode];
    const deltaMah = ((chargeMa - loadMa) * durationS) / 3600;
    this.soc = clamp(this.soc + (deltaMah / this.profile.capacityMah) * 100, 0, 100);
    const batteryMv = Math.round(socToMv(this.soc) + (chargeMa > loadMa ? 40 : 0));

    if (this.dead) {
      if (batteryMv < RESTART_MV) return this.result(batteryMv, null, { dead: true });
      this.dead = false;
      this.pending = null;
      this.mode = this.bootMode(batteryMv);
      return this.result(batteryMv, null, { revived: true });
    }
    if (batteryMv <= BROWNOUT_MV) {
      this.dead = true;
      return this.result(batteryMv, null, { dead: true });
    }

    const target = this.targetMode(batteryMv);
    if (target === this.mode) {
      this.pending = null;
      return this.result(batteryMv, null);
    }
    this.pending =
      this.pending?.mode === target
        ? { mode: target, count: this.pending.count + 1 }
        : { mode: target, count: 1 };
    if (this.pending.count < SWITCH_AFTER) return this.result(batteryMv, null);

    const change = { from: this.mode, to: target };
    this.mode = target;
    this.pending = null;
    return this.result(batteryMv, change);
  }

  private result(
    batteryMv: number,
    modeChanged: PowerStep['modeChanged'],
    flags: { dead?: boolean; revived?: boolean } = {},
  ): PowerStep {
    return {
      batteryMv,
      mode: this.mode,
      modeChanged,
      dead: flags.dead ?? false,
      revived: flags.revived ?? false,
    };
  }

  /** At boot the firmware picks the profile straight from the thresholds (design §4.3). */
  private bootMode(mv: number): PowerMode {
    const p = this.thresholds();
    if (p.mode !== 'auto') return p.mode;
    if (mv < p.survival_below_mv) return 'survival';
    if (mv < p.economy_below_mv) return 'economy';
    return 'normal';
  }

  private targetMode(mv: number): PowerMode {
    const p = this.thresholds();
    if (p.mode !== 'auto') return p.mode;
    switch (this.mode) {
      case 'normal':
        if (mv < p.survival_below_mv) return 'survival';
        return mv < p.economy_below_mv ? 'economy' : 'normal';
      case 'economy':
        if (mv < p.survival_below_mv) return 'survival';
        return mv >= p.recover_above_mv ? 'normal' : 'economy';
      case 'survival':
        return mv >= p.recover_above_mv ? 'normal' : 'survival';
    }
  }
}
