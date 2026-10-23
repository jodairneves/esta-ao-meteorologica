import {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  SETTINGS_SCHEMAS,
  type SettingsKey,
  type SettingsValue,
} from '@wx/shared';
import { eq } from 'drizzle-orm';
import type { Executor } from './client';
import { settings } from './schema';

/** Inserts the default value of every settings key that is missing. Never overwrites. */
export async function ensureDefaultSettings(db: Executor): Promise<void> {
  await db
    .insert(settings)
    .values(SETTINGS_KEYS.map((key) => ({ key, value: DEFAULT_SETTINGS[key] })))
    .onConflictDoNothing();
}

/**
 * Reads a settings key. Stored values are merged over the defaults, so keys added in newer
 * versions get their default; an invalid stored value falls back to the defaults.
 */
export async function getSettings<K extends SettingsKey>(
  db: Executor,
  key: K,
): Promise<SettingsValue<K>> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key));
  const stored = row?.value && typeof row.value === 'object' ? row.value : {};
  const parsed = SETTINGS_SCHEMAS[key].safeParse({ ...DEFAULT_SETTINGS[key], ...stored });
  return (parsed.success ? parsed.data : DEFAULT_SETTINGS[key]) as SettingsValue<K>;
}
