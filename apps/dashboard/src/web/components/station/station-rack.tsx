import { measuresPressure } from '@wx/shared';
import { OctagonAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { StationSummary } from '../../../common/api';
import { cn } from '../../lib/css';
import { formatNumber, formatRelative, MISSING, msToKmh } from '../../lib/format';
import { stationStatusLook } from '../../lib/status';
import { useNow } from '../../lib/time';
import { Sparkline } from '../charts/sparkline';
import { BatteryMeter, StatusPill } from '../ui/status';

const COLUMNS =
  'lg:grid-cols-[minmax(220px,1.5fr)_minmax(150px,1.2fr)_repeat(4,minmax(86px,1fr))_minmax(104px,auto)]';

/** Last contact in words: sleeping stations announce the next one instead. */
export function contactText(station: StationSummary, now: number): string {
  const { state } = station;
  if (station.status === 'sleeping' && state.nextContactAt) {
    return `Próximo contato ${formatRelative(state.nextContactAt, now)}`;
  }
  if (!state.lastSeenAt) return 'Nunca enviou dados';
  return `Último contato ${formatRelative(state.lastSeenAt, now)}`;
}

function Readout({
  label,
  value,
  unit,
  detail,
  stale,
  children,
}: {
  label: string;
  value: string;
  unit: string;
  detail?: ReactNode;
  stale: boolean;
  children?: ReactNode;
}) {
  const missing = value === MISSING;
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-ink-3 lg:sr-only">{label}</div>
      <div className="flex items-end gap-3">
        <p
          className={cn('readout text-[22px] whitespace-nowrap', stale ? 'text-ink-2' : 'text-ink')}
        >
          {value}
          {!missing && (
            <span className="ml-1 text-[13px] font-normal tracking-normal text-ink-3">{unit}</span>
          )}
        </p>
        {children}
      </div>
      {detail && <div className="mt-1 truncate text-[13px] text-ink-3">{detail}</div>}
    </div>
  );
}

function AlertCount({ station }: { station: StationSummary }) {
  const { critical, warning } = station.activeAlerts;
  if (!critical && !warning) return null;
  const Icon = critical ? OctagonAlert : TriangleAlert;
  const total = critical + warning;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[13px]',
        critical ? 'text-critical' : 'text-warning',
      )}
    >
      <Icon aria-hidden className="size-4" />
      <span className="text-ink-2">
        {total} {total === 1 ? 'alerta' : 'alertas'}
      </span>
    </span>
  );
}

function StationRow({ station, now }: { station: StationSummary; now: number }) {
  const look = stationStatusLook(station.status, station.statusSeverity);
  const latest = station.latest;
  const stale = station.status !== 'online' && station.status !== 'sleeping';
  const pressure = latest?.pressureMslHpa ?? latest?.pressureHpa ?? null;
  const wind = latest?.windSpeedMs;
  const gust = latest?.windGustMs;

  return (
    <li
      className={cn(
        'relative grid grid-cols-2 gap-x-4 gap-y-4 px-4 py-4 sm:grid-cols-3 lg:items-center lg:gap-y-0',
        COLUMNS,
      )}
    >
      <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-1">
        <Link
          to={`/estacoes/${station.code}`}
          className="heading block truncate text-[17px] text-ink after:absolute after:inset-0 hover:underline hover:underline-offset-4"
        >
          {station.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusPill look={look} />
          <AlertCount station={station} />
        </div>
        <p className="mt-0.5 text-[13px] text-ink-3">{contactText(station, now)}</p>
      </div>

      <Readout
        label="Temperatura"
        value={formatNumber(latest?.temperatureC, 1)}
        unit="°C"
        stale={stale}
        detail={
          latest?.dewPointC != null ? `Orvalho ${formatNumber(latest.dewPointC, 1)} °C` : undefined
        }
      >
        <span className="mb-0.5 hidden sm:block">
          <Sparkline values={station.sparkline} color="--q-temp" width={72} height={26} />
        </span>
      </Readout>
      <Readout
        label="Umidade"
        value={formatNumber(latest?.humidityPct, 0)}
        unit="%"
        stale={stale}
      />
      <Readout
        label="Vento"
        value={wind == null ? MISSING : formatNumber(msToKmh(wind), 0)}
        unit="km/h"
        stale={stale}
        detail={gust != null ? `Rajada ${formatNumber(msToKmh(gust), 0)} km/h` : undefined}
      />
      <Readout
        label="Chuva hoje"
        value={formatNumber(station.rainTodayMm, 1)}
        unit="mm"
        stale={stale}
      />
      <Readout
        label="Pressão"
        value={formatNumber(pressure, 1)}
        unit="hPa"
        stale={stale}
        detail={measuresPressure(station.climateSensor) ? undefined : 'Versão sem barômetro'}
      />
      <div className="min-w-0">
        <div className="text-[13px] text-ink-3 lg:sr-only">Bateria</div>
        <BatteryMeter mv={station.state.batteryMv} />
      </div>
    </li>
  );
}

/**
 * The station "rack": one instrument row per station, the same columns in every row so values
 * compare down the page. On small screens each row folds into a labelled grid.
 */
export function StationRack({ stations }: { stations: StationSummary[] }) {
  const now = useNow();
  return (
    <section aria-label="Estações" className="panel overflow-hidden">
      <div
        aria-hidden
        className={cn(
          'hidden border-b border-hairline px-4 py-2.5 text-[13px] text-ink-3 lg:grid lg:gap-x-4',
          COLUMNS,
        )}
      >
        <span>Estação</span>
        <span>Temperatura</span>
        <span>Umidade</span>
        <span>Vento</span>
        <span>Chuva hoje</span>
        <span>Pressão</span>
        <span>Bateria</span>
      </div>
      <ul className="divide-y divide-hairline">
        {stations.map((station) => (
          <StationRow key={station.id} station={station} now={now} />
        ))}
      </ul>
    </section>
  );
}
