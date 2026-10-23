import type { PressureTrend } from '@wx/shared';
import { liIonPercent } from '@wx/shared';
import { type LucideIcon, MoveDownRight, MoveRight, MoveUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LatestResponse, StationDetail } from '../../../common/api';
import { cn } from '../../lib/css';
import { formatNumber, formatTime, MISSING, msToKmh, withUnit } from '../../lib/format';
import { POWER_MODE_LOOK, signalQuality } from '../../lib/status';
import { BatteryMeter, StatusPill } from '../ui/status';

const TREND: Record<PressureTrend, { label: string; icon: LucideIcon }> = {
  steady: { label: 'Estável', icon: MoveRight },
  rising_slowly: { label: 'Subindo devagar', icon: MoveUpRight },
  rising: { label: 'Subindo', icon: MoveUpRight },
  rising_quickly: { label: 'Subindo rápido', icon: MoveUpRight },
  rising_very_rapidly: { label: 'Subindo muito rápido', icon: MoveUpRight },
  falling_slowly: { label: 'Caindo devagar', icon: MoveDownRight },
  falling: { label: 'Caindo', icon: MoveDownRight },
  falling_quickly: { label: 'Caindo rápido', icon: MoveDownRight },
  falling_very_rapidly: { label: 'Caindo muito rápido', icon: MoveDownRight },
};

function Instrument({
  name,
  color,
  value,
  unit,
  stale,
  children,
}: {
  name: string;
  /** Quantity hue: a short key next to the name (the number itself stays in ink). */
  color?: string;
  value: string;
  unit: string;
  stale: boolean;
  children?: ReactNode;
}) {
  const missing = value === MISSING;
  return (
    <section className="min-w-0 border-t border-hairline pt-3">
      <h3 className="flex items-center gap-2 text-[13px] text-ink-2">
        {color && (
          <span
            aria-hidden
            className="h-0.5 w-3.5 rounded-full"
            style={{ background: `var(${color})` }}
          />
        )}
        {name}
      </h3>
      <p className={cn('readout mt-1.5 text-[34px]', stale ? 'text-ink-2' : 'text-ink')}>
        {value}
        {!missing && (
          <span className="ml-1.5 text-base font-normal tracking-normal text-ink-3">{unit}</span>
        )}
      </p>
      {children && <dl className="mt-2 flex flex-col gap-0.5 text-[13px]">{children}</dl>}
    </section>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-ink-3">{term}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

/** Live instrument panel: every measured and derived value, grouped by quantity. */
export function LiveReadouts({
  station,
  latest,
  stale,
}: {
  station: StationDetail;
  latest: LatestResponse | undefined;
  stale: boolean;
}) {
  const reading = latest?.reading ?? null;
  const derived = latest?.derived;
  const today = latest?.today;
  const rain = latest?.rain;
  const timeZone = station.timezone;
  const trend = derived?.pressureTrend ? TREND[derived.pressureTrend] : null;
  const TrendIcon = trend?.icon;
  const mslAvailable = reading?.pressureMslHpa != null;
  const power = station.state.powerMode ? POWER_MODE_LOOK[station.state.powerMode] : null;
  const batteryMv = station.state.batteryMv;
  const rssi = station.state.rssi;
  const kmh = (ms: number | null | undefined) =>
    ms === null || ms === undefined ? null : msToKmh(ms);
  const at = (iso: string | null | undefined) => (iso ? ` às ${formatTime(iso, timeZone)}` : '');

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
      <Instrument
        name="Temperatura"
        color="--q-temp"
        value={formatNumber(reading?.temperatureC, 1)}
        unit="°C"
        stale={stale}
      >
        <Detail term="Sensação">{withUnit(derived?.feelsLikeC, '°C', 0)}</Detail>
        <Detail term="Mínima hoje">
          {withUnit(today?.tempMinC, '°C', 1)}
          {today?.tempMinC != null && at(today.tempMinAt)}
        </Detail>
        <Detail term="Máxima hoje">
          {withUnit(today?.tempMaxC, '°C', 1)}
          {today?.tempMaxC != null && at(today.tempMaxAt)}
        </Detail>
      </Instrument>

      <Instrument
        name="Umidade relativa"
        color="--q-hum"
        value={formatNumber(reading?.humidityPct, 0)}
        unit="%"
        stale={stale}
      >
        <Detail term="Ponto de orvalho">{withUnit(reading?.dewPointC, '°C', 1)}</Detail>
      </Instrument>

      <Instrument
        name={mslAvailable ? 'Pressão ao nível do mar' : 'Pressão da estação'}
        color="--q-pres"
        value={formatNumber(mslAvailable ? reading?.pressureMslHpa : reading?.pressureHpa, 1)}
        unit="hPa"
        stale={stale}
      >
        <Detail term="Tendência em 3 h">
          {trend && TrendIcon ? (
            <span className="inline-flex items-center gap-1">
              <TrendIcon aria-hidden className="size-3.5 text-ink-2" />
              {trend.label}
              {derived?.pressureChange3hHpa != null &&
                ` (${derived.pressureChange3hHpa > 0 ? '+' : ''}${formatNumber(derived.pressureChange3hHpa, 1)} hPa)`}
            </span>
          ) : (
            MISSING
          )}
        </Detail>
        {mslAvailable && (
          <Detail term="Na estação">{withUnit(reading?.pressureHpa, 'hPa', 1)}</Detail>
        )}
        <Detail term="Altitude barométrica">{withUnit(reading?.altitudeM, 'm', 0)}</Detail>
      </Instrument>

      <Instrument
        name="Vento médio"
        color="--q-wind"
        value={formatNumber(kmh(reading?.windSpeedMs), 0)}
        unit="km/h"
        stale={stale}
      >
        <Detail term="Rajada">{withUnit(kmh(reading?.windGustMs), 'km/h', 0)}</Detail>
        <Detail term="Rajada máxima hoje">{withUnit(kmh(today?.gustMaxMs), 'km/h', 0)}</Detail>
        <Detail term="Escala Beaufort">
          {derived?.beaufort
            ? `Força ${derived.beaufort.force}, ${derived.beaufort.label.toLowerCase()}`
            : MISSING}
        </Detail>
      </Instrument>

      <Instrument
        name="Chuva hoje"
        color="--q-rain"
        value={formatNumber(rain?.todayMm, 1)}
        unit="mm"
        stale={stale}
      >
        <Detail term="Última hora">{withUnit(rain?.lastHourMm, 'mm', 1)}</Detail>
        <Detail term="Intensidade agora">{withUnit(derived?.rainRateMmH, 'mm/h', 1)}</Detail>
        <Detail term="No mês">{withUnit(rain?.monthMm, 'mm', 1)}</Detail>
        <Detail term="No ano">{withUnit(rain?.yearMm, 'mm', 0)}</Detail>
      </Instrument>

      <section className="min-w-0 border-t border-hairline pt-3">
        <h3 className="text-[13px] text-ink-2">Energia e sinal</h3>
        <div className="mt-2.5 flex items-center gap-3">
          <BatteryMeter mv={batteryMv} />
          <span className="text-[13px] text-ink-2">
            {batteryMv === null ? '' : withUnit(batteryMv / 1000, 'V', 2)}
          </span>
        </div>
        <dl className="mt-2.5 flex flex-col gap-0.5 text-[13px]">
          <Detail term="Perfil">
            {power ? <StatusPill look={power} className="align-middle" /> : MISSING}
          </Detail>
          <Detail term="Wi-Fi">
            {rssi === null ? MISSING : `${rssi} dBm, ${signalQuality(rssi).toLowerCase()}`}
          </Detail>
          <Detail term="Firmware">{station.state.firmwareVersion ?? MISSING}</Detail>
        </dl>
        {batteryMv !== null && liIonPercent(batteryMv) < 15 && (
          <p className="mt-2 text-[13px] text-critical">
            Bateria quase no fim: confira o painel solar e as ligações.
          </p>
        )}
      </section>
    </div>
  );
}
