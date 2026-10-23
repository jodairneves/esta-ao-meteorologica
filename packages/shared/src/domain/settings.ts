import { z } from 'zod';

// System settings stored in the `settings` table, one row per key (design §5.2).

export const monitoringSettingsSchema = z
  .object({
    /** Station is overdue after this many reading intervals without contact… */
    offlineAfterIntervals: z.int().min(1).max(100),
    /** …but never sooner than this. */
    offlineMinSeconds: z.int().min(60).max(86_400),
    /** An overdue station becomes critical after this long. */
    offlineCriticalAfterSeconds: z
      .int()
      .min(60)
      .max(7 * 86_400),
    sensorStaleAfterIntervals: z.int().min(1).max(100),
    sensorStaleMinSeconds: z.int().min(60).max(86_400),
    batteryLowMv: z.int().min(2500).max(4500),
    batteryCriticalMv: z.int().min(2500).max(4500),
  })
  .refine((s) => s.batteryCriticalMv < s.batteryLowMv, {
    message: 'batteryCriticalMv must be lower than batteryLowMv',
    path: ['batteryCriticalMv'],
  });
export type MonitoringSettings = z.infer<typeof monitoringSettingsSchema>;

export const retentionSettingsSchema = z.object({
  logsDays: z.int().min(1).max(3650),
  auditDays: z.int().min(1).max(3650),
  healthDays: z.int().min(1).max(3650),
  /** null keeps readings forever. */
  readingsDays: z.int().min(30).max(36_500).nullable(),
});
export type RetentionSettings = z.infer<typeof retentionSettingsSchema>;

export const SETTINGS_SCHEMAS = {
  monitoring: monitoringSettingsSchema,
  retention: retentionSettingsSchema,
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;
export const SETTINGS_KEYS = Object.keys(SETTINGS_SCHEMAS) as SettingsKey[];

export const DEFAULT_SETTINGS: { [K in SettingsKey]: SettingsValue<K> } = {
  monitoring: {
    offlineAfterIntervals: 3,
    offlineMinSeconds: 180,
    offlineCriticalAfterSeconds: 3600,
    sensorStaleAfterIntervals: 3,
    sensorStaleMinSeconds: 300,
    batteryLowMv: 3650,
    batteryCriticalMv: 3450,
  },
  retention: {
    logsDays: 90,
    auditDays: 365,
    healthDays: 180,
    readingsDays: null,
  },
};
