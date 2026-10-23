import { ToggleGroup } from 'radix-ui';
import { cn } from '../../lib/css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Single-choice control (period presets, metric switches). Radix gives it radio semantics
 * and arrow-key navigation; one option is always selected.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as T);
      }}
      aria-label={label}
      className={cn('inline-flex rounded-md border border-hairline bg-sunken p-0.5', className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'h-8 rounded-[5px] px-3 text-[13px] font-medium whitespace-nowrap text-ink-2 transition-colors hover:text-ink',
            'data-[state=on]:bg-raised data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1px_var(--hairline-strong)]',
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
