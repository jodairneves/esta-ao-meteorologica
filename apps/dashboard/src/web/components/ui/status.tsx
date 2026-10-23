import { liIonPercent } from '@wx/shared';
import { cn } from '../../lib/css';
import { type StatusLook, TONE_TEXT, type Tone } from '../../lib/status';

/** Status is never colour alone: icon + text, coloured by tone. */
export function StatusPill({ look, className }: { look: StatusLook; className?: string }) {
  const Icon = look.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[13px] font-medium',
        TONE_TEXT[look.tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className={look.tone === 'neutral' ? 'text-ink-2' : undefined}>{look.label}</span>
    </span>
  );
}

const METER_FILL: Record<Tone, string> = {
  good: 'bg-good',
  warning: 'bg-warning',
  serious: 'bg-serious',
  critical: 'bg-critical',
  neutral: 'bg-ink-3',
};

export function batteryTone(pct: number | null): Tone {
  if (pct === null) return 'neutral';
  if (pct < 15) return 'critical';
  if (pct < 35) return 'warning';
  return 'good';
}

/** Battery meter: the fill carries the state, the value is always written next to it. */
export function BatteryMeter({ mv, compact = false }: { mv: number | null; compact?: boolean }) {
  const pct = mv === null ? null : liIonPercent(mv);
  const tone = batteryTone(pct);
  return (
    <span className="inline-flex items-center gap-2">
      {/* biome-ignore lint/a11y/useSemanticElements: <meter> cannot take the tone colours across browsers */}
      <span
        role="meter"
        aria-label="Bateria"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        className={cn(
          'relative h-2 overflow-hidden rounded-full bg-hairline',
          compact ? 'w-10' : 'w-16',
        )}
      >
        <span
          className={cn('absolute inset-y-0 left-0 rounded-full', METER_FILL[tone])}
          style={{ width: `${pct ?? 0}%` }}
        />
      </span>
      <span className="text-[13px] text-ink tabular-nums">{pct === null ? '—' : `${pct}%`}</span>
    </span>
  );
}
