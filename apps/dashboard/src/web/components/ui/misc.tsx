import { Check, Copy, type LucideIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '../../lib/css';

/** Empty screens are an invitation to act: say what is missing and what to do. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <Icon aria-hidden className="size-8 text-ink-3" strokeWidth={1.5} />
      <h3 className="heading text-base">{title}</h3>
      {children && <div className="max-w-md text-sm text-ink-2">{children}</div>}
      {action}
    </div>
  );
}

export function CopyButton({ value, label = 'Copiar' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-2 hover:bg-panel hover:text-ink"
    >
      {copied ? (
        <Check aria-hidden className="size-4 text-good" />
      ) : (
        <Copy aria-hidden className="size-4" />
      )}
      {copied ? 'Copiado' : label}
    </button>
  );
}

/** Page title row: title on the left, actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="heading text-[26px] leading-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function ErrorNotice({ error, className }: { error: unknown; className?: string }) {
  const message = error instanceof Error ? error.message : 'Não foi possível carregar os dados.';
  return (
    <p
      role="alert"
      className={cn('rounded-md border border-critical/40 px-4 py-3 text-sm text-ink', className)}
    >
      {message}
    </p>
  );
}
