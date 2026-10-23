import type { DeviceConfig } from '../contract/schemas';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Device configuration given to new stations (design §3.7). Thresholds assume a Li-ion cell. */
export const DEFAULT_DEVICE_CONFIG: DeviceConfig = {
  interval_s: 60,
  health_s: 300,
  economy_batch_s: 600,
  survival_sleep_s: 1800,
  rain_edge: 'change',
  power: {
    mode: 'auto',
    economy_below_mv: 3650,
    survival_below_mv: 3450,
    recover_above_mv: 3800,
    bat_full_scale_mv: 4200,
  },
};
