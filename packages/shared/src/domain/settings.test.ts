import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEYS, SETTINGS_SCHEMAS } from './settings';

describe('system settings', () => {
  it.each(SETTINGS_KEYS)('default "%s" settings are valid', (key) => {
    expect(SETTINGS_SCHEMAS[key].safeParse(DEFAULT_SETTINGS[key]).success).toBe(true);
  });

  it('rejects battery thresholds out of order', () => {
    const monitoring = { ...DEFAULT_SETTINGS.monitoring, batteryCriticalMv: 3700 };
    expect(SETTINGS_SCHEMAS.monitoring.safeParse(monitoring).success).toBe(false);
  });
});
