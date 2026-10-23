import { ChartLine, Table2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '../../lib/css';

export interface LegendItem {
  name: string;
  color: string;
  /** Lines get a line key; bars and bands a small block (the legend mirrors the mark). */
  mark?: 'line' | 'block';
}

export interface TableView {
  columns: string[];
  rows: (string | number)[][];
}

const TABLE_ROW_LIMIT = 1000;

/**
 * Chart container: title with unit, legend (only for two or more series), and the table view
 * every chart must have (the accessible twin; also the "relief" for low-contrast hues).
 * While refetching, the previous render stays at reduced opacity instead of a skeleton.
 */
export function ChartPanel({
  title,
  unit,
  legend,
  table,
  refreshing = false,
  actions,
  children,
  className,
}: {
  title: string;
  unit?: string;
  legend?: LegendItem[];
  table?: () => TableView;
  refreshing?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const view = showTable && table ? table() : null;

  return (
    <figure className={cn('panel flex min-w-0 flex-col px-4 pt-3.5 pb-3', className)}>
      <figcaption className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="heading text-[15px]">
            {title}
            {unit && <span className="ml-1.5 font-normal text-ink-3">{unit}</span>}
          </h3>
          {legend && legend.length > 1 && (
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {legend.map((item) => (
                <li key={item.name} className="flex items-center gap-1.5 text-[13px] text-ink-2">
                  <span
                    aria-hidden
                    className={cn(
                      item.mark === 'block'
                        ? 'h-2.5 w-3 rounded-[2px] opacity-40'
                        : 'h-0.5 w-3.5 rounded-full',
                    )}
                    style={{ background: `var(${item.color})` }}
                  />
                  {item.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center gap-1">
          {actions}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((value) => !value)}
              aria-pressed={showTable}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-ink-2 hover:bg-raised hover:text-ink"
            >
              {showTable ? (
                <ChartLine aria-hidden className="size-4" />
              ) : (
                <Table2 aria-hidden className="size-4" />
              )}
              {showTable ? 'Ver gráfico' : 'Ver tabela'}
            </button>
          )}
        </div>
      </figcaption>

      <div className={cn('mt-2 transition-opacity', refreshing && 'opacity-60')}>
        {view ? (
          <div className="max-h-80 overflow-auto rounded-md border border-hairline">
            <table className="dense w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-raised text-ink-2">
                <tr>
                  {view.columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="px-3 py-2 font-medium whitespace-nowrap"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.rows.slice(0, TABLE_ROW_LIMIT).map((row, index) => (
                  <tr
                    // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional; two readings can share the same minute label
                    key={index}
                    className="border-t border-hairline"
                  >
                    {row.map((cell, cellIndex) => (
                      <td
                        // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                        key={cellIndex}
                        className={cn(
                          'px-3 py-1.5 whitespace-nowrap',
                          cellIndex > 0 && 'text-right',
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {view.rows.length > TABLE_ROW_LIMIT && (
              <p className="border-t border-hairline px-3 py-2 text-[13px] text-ink-3">
                Mostrando {TABLE_ROW_LIMIT} de {view.rows.length} linhas. Exporte o CSV para ver
                tudo.
              </p>
            )}
          </div>
        ) : (
          children
        )}
      </div>
    </figure>
  );
}
