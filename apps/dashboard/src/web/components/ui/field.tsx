import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId } from 'react';
import { cn } from '../../lib/css';

const CONTROL =
  'w-full rounded-md border border-hairline bg-sunken px-3 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-hairline-strong aria-[invalid=true]:border-critical disabled:opacity-60';

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | string[];
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const message = Array.isArray(error) ? error[0] : error;
  const describedBy = message ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(message), 'aria-describedby': describedBy })}
      {message ? (
        <p id={`${id}-error`} className="text-[13px] text-critical">
          {message}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-[13px] text-ink-3">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'h-9', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, 'h-9 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label
      className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-ink', className)}
    >
      <input type="checkbox" className="size-4 accent-[var(--ink)]" {...props} />
      {label}
    </label>
  );
}
