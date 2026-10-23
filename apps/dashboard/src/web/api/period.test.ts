import { afterEach, describe, expect, it, vi } from 'vitest';
import { periodFromSearch, periodRange, periodToSearch, rainBucket } from './period';

afterEach(() => {
  vi.useRealTimers();
});

describe('period', () => {
  it('ends presets at the next whole minute, so query keys hold for a minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T12:00:30Z'));
    expect(periodRange({ preset: '24h' })).toEqual({
      from: '2026-10-22T12:01:00.000Z',
      to: '2026-10-23T12:01:00.000Z',
    });
  });

  it('turns a custom period into whole local days, end day included', () => {
    const range = periodRange({ preset: 'custom', from: '2026-10-01', to: '2026-10-03' });
    const from = new Date(range.from);
    const to = new Date(range.to);
    expect([from.getDate(), from.getHours()]).toEqual([1, 0]);
    expect([to.getDate(), to.getHours()]).toEqual([4, 0]);
  });

  it('reads and writes the URL, falling back to 24 hours', () => {
    expect(periodFromSearch(new URLSearchParams('periodo=7d'))).toEqual({ preset: '7d' });
    expect(periodFromSearch(new URLSearchParams('periodo=xyz'))).toEqual({ preset: '24h' });
    expect(
      periodFromSearch(new URLSearchParams('periodo=custom&de=2026-10-05&ate=2026-10-01')),
    ).toEqual({ preset: '24h' });
    const custom = { preset: 'custom', from: '2026-10-01', to: '2026-10-05' } as const;
    expect(periodFromSearch(new URLSearchParams(periodToSearch(custom)))).toEqual(custom);
  });

  it('totals rain per hour up to about a week, per day beyond', () => {
    expect(rainBucket({ preset: '7d' })).toBe('1h');
    expect(rainBucket({ preset: '30d' })).toBe('1d');
  });
});
