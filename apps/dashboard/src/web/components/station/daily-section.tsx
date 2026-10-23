import { Download } from 'lucide-react';
import type { DailyRow } from '../../../common/api';
import { useDaily } from '../../api/queries';
import { formatDay, formatNumber, localDayOf, msToKmh } from '../../lib/format';
import { ChartPanel } from '../charts/chart-panel';
import { CalendarHeatmap } from '../charts/heatmap';
import { Button } from '../ui/button';
import { ErrorNotice } from '../ui/misc';

const kmh = (ms: number | null) => (ms === null ? null : msToKmh(ms));

const COLUMNS: { label: string; value: (row: DailyRow) => number | null; digits: number }[] = [
  { label: 'Mínima (°C)', value: (row) => row.tempMin, digits: 1 },
  { label: 'Máxima (°C)', value: (row) => row.tempMax, digits: 1 },
  { label: 'Média (°C)', value: (row) => row.tempAvg, digits: 1 },
  { label: 'Umidade (%)', value: (row) => row.humidityAvg, digits: 0 },
  { label: 'Pressão (hPa)', value: (row) => row.pressureMslAvg, digits: 1 },
  { label: 'Chuva (mm)', value: (row) => row.rainMm, digits: 1 },
  { label: 'Vento médio (km/h)', value: (row) => kmh(row.windAvg), digits: 0 },
  { label: 'Rajada máx. (km/h)', value: (row) => kmh(row.gustMax), digits: 0 },
];

/** Semicolon-separated with a BOM: opens with accents and decimal commas in Excel pt-BR. */
function downloadCsv(rows: DailyRow[], fileName: string) {
  const bom = String.fromCharCode(0xfeff);
  const header = ['Dia', ...COLUMNS.map((column) => column.label), 'Leituras'].join(';');
  const lines = rows.map((row) =>
    [
      row.day,
      ...COLUMNS.map((column) => {
        const value = column.value(row);
        return value === null ? '' : formatNumber(value, column.digits).replace(/\./g, '');
      }),
      row.readings,
    ].join(';'),
  );
  const blob = new Blob([bom, [header, ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Daily summary of the period: the table people copy into spreadsheets. */
export function DailyTable({
  code,
  from,
  to,
  caption,
}: {
  code: string;
  from: string;
  to: string;
  caption: string;
}) {
  const daily = useDaily(code, from, to);
  const rows = [...(daily.data ?? [])].reverse();

  return (
    <section className="panel flex flex-col px-4 pt-3.5 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="heading text-[15px]">Resumo diário</h3>
          <p className="text-[13px] text-ink-3">{caption}</p>
        </div>
        <Button
          size="sm"
          icon={Download}
          disabled={!rows.length}
          onClick={() => downloadCsv(daily.data ?? [], `${code}_resumo-diario.csv`)}
        >
          Baixar CSV
        </Button>
      </div>
      {daily.isError && <ErrorNotice error={daily.error} className="mt-3" />}
      <div className="mt-3 max-h-[420px] overflow-auto rounded-md border border-hairline">
        <table className="dense w-full text-[13px]">
          <thead className="sticky top-0 bg-raised text-ink-2">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                Dia
              </th>
              {COLUMNS.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className="px-3 py-2 text-right font-medium whitespace-nowrap"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.day} className="border-t border-hairline">
                <th
                  scope="row"
                  className="px-3 py-1.5 text-left font-normal whitespace-nowrap text-ink"
                >
                  {formatDay(row.day)}
                </th>
                {COLUMNS.map((column) => (
                  <td
                    key={column.label}
                    className="px-3 py-1.5 text-right whitespace-nowrap text-ink"
                  >
                    {formatNumber(column.value(row), column.digits)}
                  </td>
                ))}
              </tr>
            ))}
            {daily.isSuccess && rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-6 text-center text-ink-2">
                  Nenhum dia com leituras neste período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Daily rain over the last twelve months as a calendar. */
export function RainCalendar({
  code,
  from,
  to,
  timeZone,
}: {
  code: string;
  from: string;
  to: string;
  timeZone: string;
}) {
  const daily = useDaily(code, from, to);
  const rows = daily.data ?? [];
  const total = rows.reduce((sum, row) => sum + (row.rainMm ?? 0), 0);
  const rainyDays = rows.filter((row) => (row.rainMm ?? 0) >= 1).length;
  // The whole year is drawn even when the station is newer: empty days read as "no data".
  const first = localDayOf(from, timeZone);
  const last = localDayOf(to, timeZone);

  return (
    <ChartPanel
      title="Calendário de chuva"
      unit="mm por dia"
      table={() => ({
        columns: ['Dia', 'Chuva (mm)'],
        rows: [...rows].reverse().map((row) => [formatDay(row.day), formatNumber(row.rainMm, 1)]),
      })}
      actions={
        rows.length > 0 && (
          <p className="mr-2 text-[13px] text-ink-2">
            {formatNumber(total, 0)} mm em 12 meses, {rainyDays} {rainyDays === 1 ? 'dia' : 'dias'}{' '}
            com chuva
          </p>
        )
      }
    >
      {daily.isError && <ErrorNotice error={daily.error} />}
      {daily.data ? (
        <CalendarHeatmap
          // Dry days are left blank: the ramp starts at the first tenth of a millimetre.
          rows={rows.map((row) => ({ day: row.day, value: row.rainMm ? row.rainMm : null }))}
          ramp="--ramp-rain"
          unit="mm"
          digits={1}
          from={first}
          to={last}
          label="Calendário com a chuva de cada dia nos últimos 12 meses"
        />
      ) : (
        <div className="h-[190px] animate-pulse rounded-md bg-sunken" />
      )}
    </ChartPanel>
  );
}
