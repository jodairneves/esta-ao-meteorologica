import { Cpu, History } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { DeviceOverview, StationDetail } from '../../common/api';
import { useConnection, useDevices, useHealth, useStation } from '../api/queries';
import { ChartPanel } from '../components/charts/chart-panel';
import { withGaps } from '../components/charts/gaps';
import { TimeSeriesChart } from '../components/charts/time-series';
import { SensorStrip } from '../components/station/sensor-strip';
import { EmptyState, ErrorNotice, PageHeader } from '../components/ui/misc';
import { Segmented } from '../components/ui/segmented';
import { BatteryMeter, StatusPill } from '../components/ui/status';
import { cn } from '../lib/css';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
  MISSING,
} from '../lib/format';
import { usePageTitle } from '../lib/page-title';
import { POWER_MODE_LOOK, signalQuality, stationStatusLook } from '../lib/status';
import { useNow } from '../lib/time';

const RANGES = [
  { value: '1', label: '24 horas' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
] as const;
type RangeDays = (typeof RANGES)[number]['value'];

function DeviceTable({
  devices,
  selected,
  onSelect,
}: {
  devices: DeviceOverview[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const now = useNow();
  return (
    <section aria-label="Dispositivos" className="panel overflow-x-auto">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="text-[13px] text-ink-2">
          <tr className="border-b border-hairline">
            {[
              'Estação',
              'Perfil de energia',
              'Bateria',
              'Wi-Fi',
              'Firmware',
              'Ligada há',
              'Memória livre',
              'Fila',
            ].map((label) => (
              <th
                key={label}
                scope="col"
                className="px-4 py-2.5 text-left font-medium whitespace-nowrap"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {devices.map(({ station, lastHealth }) => {
            const look = stationStatusLook(station.status, station.statusSeverity);
            const power = station.state.powerMode ? POWER_MODE_LOOK[station.state.powerMode] : null;
            const isSelected = station.id === selected;
            return (
              <tr
                key={station.id}
                aria-selected={isSelected}
                className={cn(
                  'border-b border-hairline last:border-0',
                  isSelected && 'bg-raised/60',
                )}
              >
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <button
                    type="button"
                    onClick={() => onSelect(station.id)}
                    className="heading block text-left text-[15px] text-ink hover:underline hover:underline-offset-4"
                  >
                    {station.name}
                  </button>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3">
                    <StatusPill look={look} />
                    <span className="text-[13px] text-ink-3">
                      {station.state.lastSeenAt
                        ? formatRelative(station.state.lastSeenAt, now)
                        : 'Nunca conectou'}
                    </span>
                  </div>
                </th>
                <td className="px-4 py-3">
                  {power ? (
                    <StatusPill look={power} />
                  ) : (
                    <span className="text-ink-3">{MISSING}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <BatteryMeter mv={station.state.batteryMv} compact />
                  <div className="text-[13px] text-ink-3">
                    {station.state.batteryMv === null
                      ? ''
                      : `${formatNumber(station.state.batteryMv / 1000, 2)} V`}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink">
                  {station.state.rssi === null ? MISSING : `${station.state.rssi} dBm`}
                  <div className="text-[13px] text-ink-3">{signalQuality(station.state.rssi)}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink">
                  {station.state.firmwareVersion ?? MISSING}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink">
                  {formatDuration(lastHealth?.uptimeS)}
                  {lastHealth?.resetReason && (
                    <div className="text-[13px] text-ink-3">
                      Último reinício: {lastHealth.resetReason}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink">
                  {lastHealth?.heapFree == null ? MISSING : formatBytes(lastHealth.heapFree)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink">
                  {lastHealth?.buffered == null ? MISSING : `${lastHealth.buffered} na fila`}
                  {lastHealth?.dropped ? (
                    <div className="text-[13px] text-warning">{lastHealth.dropped} descartadas</div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function DeviceDetail({ station, days }: { station: StationDetail; days: RangeDays }) {
  const now = useNow(60_000);
  const to = new Date(Math.ceil(now / 60_000) * 60_000).toISOString();
  const from = new Date(Date.parse(to) - Number(days) * 86_400_000).toISOString();
  const health = useHealth(station.id, from, to);
  const connection = useConnection(station.id, from, to);
  const power = station.deviceConfig.power;

  const charts = useMemo(() => {
    const points = health.data ?? [];
    const { t, columns } = withGaps(
      points.map((point) => Date.parse(point.ts)),
      {
        battery: points.map((point) => (point.batteryMv === null ? null : point.batteryMv / 1000)),
        rssi: points.map((point) => point.rssi),
      },
    );
    return {
      t,
      battery: [{ name: 'Bateria', color: '--ink-2', values: columns.battery }],
      rssi: [{ name: 'Sinal Wi-Fi', color: '--ink-2', values: columns.rssi }],
      thresholds: [
        { value: power.economy_below_mv / 1000, label: 'Economia abaixo daqui' },
        { value: power.survival_below_mv / 1000, label: 'Sobrevivência abaixo daqui' },
      ],
    };
  }, [health.data, power.economy_below_mv, power.survival_below_mv]);

  const events = [...(connection.data ?? [])].reverse();

  return (
    <div className="flex flex-col gap-6">
      <section className="panel px-5 py-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="heading text-[15px]">Sensores de {station.name}</h2>
          <Link
            to={`/estacoes/${station.code}`}
            className="text-[13px] text-ink-2 underline-offset-4 hover:text-ink hover:underline"
          >
            Abrir estação
          </Link>
        </div>
        <SensorStrip sensors={station.sensors} />
      </section>

      {health.isError && <ErrorNotice error={health.error} />}
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartPanel
          title="Tensão da bateria"
          unit="V"
          table={() => ({
            columns: ['Data e hora', 'Bateria (V)'],
            rows: charts.t.map((time, index) => [
              formatDateTime(time, station.timezone),
              formatNumber(charts.battery[0]?.values[index], 2),
            ]),
          })}
        >
          {charts.t.length ? (
            <TimeSeriesChart
              t={charts.t}
              series={charts.battery}
              unit="V"
              digits={2}
              timeZone={station.timezone}
              thresholds={charts.thresholds}
              label="Gráfico da tensão da bateria"
            />
          ) : (
            <p className="py-16 text-center text-sm text-ink-2">
              {health.isPending ? 'Carregando…' : 'Nenhum relatório de saúde neste período.'}
            </p>
          )}
        </ChartPanel>
        <ChartPanel
          title="Sinal do Wi-Fi"
          unit="dBm"
          table={() => ({
            columns: ['Data e hora', 'Sinal (dBm)'],
            rows: charts.t.map((time, index) => [
              formatDateTime(time, station.timezone),
              formatNumber(charts.rssi[0]?.values[index], 0),
            ]),
          })}
        >
          {charts.t.length ? (
            <TimeSeriesChart
              t={charts.t}
              series={charts.rssi}
              unit="dBm"
              digits={0}
              timeZone={station.timezone}
              thresholds={[{ value: -80, label: 'Sinal fraco abaixo daqui' }]}
              label="Gráfico do sinal Wi-Fi"
            />
          ) : (
            <p className="py-16 text-center text-sm text-ink-2">
              {health.isPending ? 'Carregando…' : 'Nenhum relatório de saúde neste período.'}
            </p>
          )}
        </ChartPanel>
      </div>

      <section className="panel px-5 py-4">
        <h2 className="heading text-[15px]">Linha do tempo de conexão</h2>
        {connection.isError && <ErrorNotice error={connection.error} className="mt-3" />}
        {events.length === 0 && connection.isSuccess && (
          <EmptyState
            icon={History}
            title="Sem mudanças de conexão neste período"
            className="py-8"
          />
        )}
        <ol className="mt-3 flex flex-col">
          {events.map((event) => (
            <li
              key={`${event.ts}-${event.code}`}
              className="grid grid-cols-[132px_1fr] gap-4 border-t border-hairline py-2 text-sm"
            >
              <time dateTime={event.ts} className="text-ink-3">
                {formatDateTime(event.ts, station.timezone)}
              </time>
              <span className="text-ink">{event.message}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function DevicesPage() {
  usePageTitle('Dispositivos');
  const devices = useDevices();
  const [selected, setSelected] = useState<string | null>(null);
  const [days, setDays] = useState<RangeDays>('7');
  const list = (devices.data ?? []).filter((device) => device.station.isActive);
  const current = selected ?? list[0]?.station.id ?? null;
  const station = useStation(current ?? '');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dispositivos"
        description="Energia, sinal e sensores de cada D1 mini. Escolha uma estação para ver o histórico."
      />
      {devices.isError && <ErrorNotice error={devices.error} />}
      {devices.isSuccess && list.length === 0 && (
        <section className="panel">
          <EmptyState icon={Cpu} title="Nenhum dispositivo ativo">
            Os D1 mini aparecem aqui depois que as estações forem cadastradas.
          </EmptyState>
        </section>
      )}
      {list.length > 0 && <DeviceTable devices={list} selected={current} onSelect={setSelected} />}

      {current && station.data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="heading text-xl">{station.data.name}</h2>
            <Segmented
              label="Período do histórico"
              value={days}
              options={RANGES}
              onChange={setDays}
            />
          </div>
          <DeviceDetail station={station.data} days={days} />
        </>
      )}
    </div>
  );
}
