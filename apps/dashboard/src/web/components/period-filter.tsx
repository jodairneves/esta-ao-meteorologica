import { type FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  localDay,
  PERIOD_LABELS,
  PERIOD_PRESETS,
  type Period,
  type PeriodPreset,
  periodFromSearch,
  periodToSearch,
} from '../api/period';
import { Button } from './ui/button';
import { Input } from './ui/field';
import { Segmented } from './ui/segmented';

/** Period kept in the URL, so a chart view can be shared or bookmarked. */
export function usePeriod(): [Period, (period: Period) => void] {
  const [search, setSearch] = useSearchParams();
  const period = periodFromSearch(search);
  const setPeriod = (next: Period) =>
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        for (const key of ['periodo', 'de', 'ate']) params.delete(key);
        for (const [key, value] of Object.entries(periodToSearch(next))) params.set(key, value);
        return params;
      },
      { replace: true, preventScrollReset: true },
    );
  return [period, setPeriod];
}

const OPTIONS = [...PERIOD_PRESETS, 'custom' as const].map((value) => ({
  value,
  label: PERIOD_LABELS[value],
}));

/** One row of period controls that scopes every chart below it. */
export function PeriodFilter({
  period,
  onChange,
}: {
  period: Period;
  onChange: (period: Period) => void;
}) {
  const today = localDay(new Date());
  const [draft, setDraft] = useState(() =>
    period.preset === 'custom'
      ? { from: period.from, to: period.to }
      : { from: localDay(new Date(Date.now() - 6 * 86_400_000)), to: today },
  );

  const choose = (value: PeriodPreset | 'custom') => {
    onChange(value === 'custom' ? { preset: 'custom', ...draft } : { preset: value });
  };

  const apply = (event: FormEvent) => {
    event.preventDefault();
    if (draft.from && draft.to && draft.from <= draft.to) onChange({ preset: 'custom', ...draft });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="max-w-full overflow-x-auto">
        <Segmented label="Período" value={period.preset} options={OPTIONS} onChange={choose} />
      </div>
      {period.preset === 'custom' && (
        <form onSubmit={apply} className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="periodo-de">
            Início
          </label>
          <Input
            id="periodo-de"
            type="date"
            value={draft.from}
            max={draft.to || today}
            onChange={(event) => setDraft((value) => ({ ...value, from: event.target.value }))}
            className="w-auto"
          />
          <span className="text-sm text-ink-3">até</span>
          <label className="sr-only" htmlFor="periodo-ate">
            Fim
          </label>
          <Input
            id="periodo-ate"
            type="date"
            value={draft.to}
            min={draft.from}
            max={today}
            onChange={(event) => setDraft((value) => ({ ...value, to: event.target.value }))}
            className="w-auto"
          />
          <Button
            type="submit"
            size="md"
            disabled={!draft.from || !draft.to || draft.from > draft.to}
          >
            Aplicar
          </Button>
        </form>
      )}
    </div>
  );
}
