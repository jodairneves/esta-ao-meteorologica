import { cn } from '../lib/css';

/** Three-cup anemometer seen from above: the product mark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('shrink-0', className)} fill="none">
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M16 16 L16 5.5" />
        <path d="M16 16 L25.1 21.25" />
        <path d="M16 16 L6.9 21.25" />
      </g>
      <g fill="currentColor">
        <path d="M16 2.5a3.5 3.5 0 0 1 3.5 3.5h-7A3.5 3.5 0 0 1 16 2.5Z" />
        <path d="M27.7 22.75a3.5 3.5 0 0 1-4.78 1.28l3.5-6.06a3.5 3.5 0 0 1 1.28 4.78Z" />
        <path d="M4.3 22.75a3.5 3.5 0 0 1 1.28-4.78l3.5 6.06a3.5 3.5 0 0 1-4.78-1.28Z" />
        <circle cx={16} cy={16} r={2.5} />
      </g>
    </svg>
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn('heading leading-tight', className)}>
      Estação
      <br />
      Meteorológica
    </span>
  );
}
