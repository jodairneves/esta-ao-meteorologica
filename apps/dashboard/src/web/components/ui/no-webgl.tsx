import { MonitorX } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/css';

/**
 * Takes the place of the map and the 3D views when the browser has no WebGL2: says what is
 * missing and how to turn it on, instead of breaking the screen.
 */
export function NoWebGL({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="note"
      className={cn(
        'flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center',
        className,
      )}
    >
      <MonitorX aria-hidden className="size-7 text-ink-3" strokeWidth={1.5} />
      <p className="heading text-[15px] text-ink">{title}</p>
      <p className="max-w-md text-sm text-ink-2">
        Este navegador está sem aceleração gráfica (WebGL2). Ative a aceleração de gráficos nas
        configurações do navegador e recarregue a página. {children}
      </p>
    </div>
  );
}
