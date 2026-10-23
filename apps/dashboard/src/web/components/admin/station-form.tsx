import {
  CLIMATE_SENSOR_LABELS,
  CLIMATE_SENSORS,
  type ClimateSensor,
  suggestStationCode,
} from '@wx/shared';
import { LocateFixed, Mountain, Save } from 'lucide-react';
import { type FormEvent, lazy, Suspense, useState } from 'react';
import type { StationDetail } from '../../../common/api';
import { ApiError } from '../../api/client';
import { formatNumber } from '../../lib/format';
import { Button } from '../ui/button';
import { ErrorBoundary } from '../ui/error-boundary';
import { Field, Input, Select } from '../ui/field';

const LocationPicker = lazy(() => import('../map/location-picker'));

const BRAZIL_ZONES: [string, string][] = [
  ['America/Sao_Paulo', 'Brasília (SP, RJ, MG, Sul, GO, DF, BA, Nordeste)'],
  ['America/Cuiaba', 'Mato Grosso (Cuiabá)'],
  ['America/Campo_Grande', 'Mato Grosso do Sul (Campo Grande)'],
  ['America/Manaus', 'Amazonas (Manaus)'],
  ['America/Porto_Velho', 'Rondônia (Porto Velho)'],
  ['America/Boa_Vista', 'Roraima (Boa Vista)'],
  ['America/Rio_Branco', 'Acre (Rio Branco)'],
  ['America/Belem', 'Pará e Amapá (Belém)'],
  ['America/Fortaleza', 'Ceará, Piauí, Maranhão, RN e PB (Fortaleza)'],
  ['America/Recife', 'Pernambuco (Recife)'],
  ['America/Noronha', 'Fernando de Noronha'],
];

export interface StationFormValues {
  name: string;
  code: string;
  description: string;
  latitude: string;
  longitude: string;
  elevationM: string;
  timezone: string;
  climateSensor: ClimateSensor;
}

export function initialStationValues(station?: StationDetail): StationFormValues {
  const text = (value: number | null | undefined) =>
    value === null || value === undefined ? '' : String(value);
  return {
    name: station?.name ?? '',
    code: station?.code ?? '',
    description: station?.description ?? '',
    latitude: text(station?.latitude),
    longitude: text(station?.longitude),
    elevationM: text(station?.elevationM),
    timezone: station?.timezone ?? 'America/Sao_Paulo',
    climateSensor: station?.climateSensor ?? 'bme280',
  };
}

/** Accepts "−22,7253" as well as "-22.7253"; empty means "not informed". */
export function parseDecimal(value: string): number | null | 'invalid' {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.').replace('−', '-');
  if (normalized === '') return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 'invalid';
}

export interface StationFormBody {
  name: string;
  code?: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  elevationM: number | null;
  timezone: string;
  climateSensor: ClimateSensor;
}

/** Identification and location of a station (new and edit share it). */
export function StationForm({
  initial,
  isNew,
  submitLabel,
  onSubmit,
}: {
  initial: StationFormValues;
  isNew: boolean;
  submitLabel: string;
  onSubmit: (body: StationFormBody) => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitting, setSubmitting] = useState(false);
  const [elevationState, setElevationState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const set = (key: keyof StationFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const latitude = parseDecimal(values.latitude);
  const longitude = parseDecimal(values.longitude);
  const located = typeof latitude === 'number' && typeof longitude === 'number';

  const lookupElevation = async () => {
    if (!located) return;
    setElevationState('loading');
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`,
      );
      const data = (await response.json()) as { elevation?: number[] };
      const elevation = data.elevation?.[0];
      if (!response.ok || elevation === undefined) throw new Error('sem altitude');
      set('elevationM')(String(Math.round(elevation)));
      setElevationState('idle');
    } catch {
      setElevationState('failed');
    }
  };

  const fillMyLocation = () => {
    navigator.geolocation?.getCurrentPosition((position) => {
      setValues((current) => ({
        ...current,
        latitude: position.coords.latitude.toFixed(5),
        longitude: position.coords.longitude.toFixed(5),
      }));
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const elevation = parseDecimal(values.elevationM);
    const problems: Record<string, string | undefined> = {};
    if (latitude === 'invalid') problems.latitude = 'Use um número, ex.: -22,7253';
    if (longitude === 'invalid') problems.longitude = 'Use um número, ex.: -47,6492';
    if (elevation === 'invalid') problems.elevationM = 'Use um número em metros';
    if ((latitude === null) !== (longitude === null))
      problems.longitude = 'Informe latitude e longitude juntas';
    if (Object.values(problems).some(Boolean)) {
      setErrors(problems);
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      await onSubmit({
        name: values.name.trim(),
        ...(isNew && values.code.trim() ? { code: values.code.trim() } : {}),
        description: values.description.trim() || null,
        latitude: latitude as number | null,
        longitude: longitude as number | null,
        elevationM: elevation as number | null,
        timezone: values.timezone,
        climateSensor: values.climateSensor,
      });
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = caught.fieldErrors;
        setErrors({
          ...Object.fromEntries(
            Object.entries(fields).map(([key, messages]) => [key, messages[0]]),
          ),
          code:
            fields.code?.[0] ?? (caught.code === 'STATION_CODE_TAKEN' ? caught.message : undefined),
          form:
            caught.code === 'VALIDATION' || caught.code === 'STATION_CODE_TAKEN'
              ? undefined
              : caught.message,
        });
      } else {
        setErrors({ form: 'Não foi possível salvar. Tente de novo.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" error={errors.name}>
          {(props) => (
            <Input
              {...props}
              value={values.name}
              onChange={(event) => set('name')(event.target.value)}
              required
              maxLength={80}
            />
          )}
        </Field>
        {isNew ? (
          <Field
            label="Código (usado no MQTT)"
            hint={`Opcional. Se ficar vazio: ${suggestStationCode(values.name || 'estacao')}. Não pode ser mudado depois.`}
            error={errors.code}
          >
            {(props) => (
              <Input
                {...props}
                value={values.code}
                onChange={(event) => set('code')(event.target.value.toLowerCase())}
                placeholder={suggestStationCode(values.name || 'estacao')}
                maxLength={32}
              />
            )}
          </Field>
        ) : (
          <Field
            label="Código (usado no MQTT)"
            hint="O código não muda: ele identifica a estação no broker."
          >
            {(props) => <Input {...props} value={values.code} disabled />}
          </Field>
        )}
      </div>
      <Field
        label="Versão da estação"
        hint={
          values.climateSensor === 'htu21d'
            ? 'Sem pressão: o painel não mostra pressão, tendência nem altitude barométrica desta estação.'
            : 'Completa: temperatura, umidade e pressão (com tendência e altitude barométrica).'
        }
        error={errors.climateSensor}
      >
        {(props) => (
          <Select
            {...props}
            value={values.climateSensor}
            onChange={(event) => set('climateSensor')(event.target.value)}
          >
            {CLIMATE_SENSORS.map((sensor) => (
              <option key={sensor} value={sensor}>
                {CLIMATE_SENSOR_LABELS[sensor]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label="Descrição"
        hint="Opcional: onde fica, quem cuida, observações."
        error={errors.description}
      >
        {(props) => (
          <textarea
            {...props}
            value={values.description}
            onChange={(event) => set('description')(event.target.value)}
            maxLength={500}
            rows={2}
            className="w-full rounded-md border border-hairline bg-sunken px-3 py-2 text-sm text-ink placeholder:text-ink-3 hover:border-hairline-strong"
          />
        )}
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="heading mb-1 text-sm">Localização</legend>
        <p className="text-[13px] text-ink-3">
          Clique no mapa ou arraste o marcador. A localização acende o mapa da visão geral e o céu
          da cena 3D.
        </p>
        <ErrorBoundary
          fallback={
            <p className="rounded-md border border-hairline px-4 py-6 text-center text-sm text-ink-2">
              Não foi possível mostrar o mapa. Digite a latitude e a longitude nos campos abaixo.
            </p>
          }
        >
          <Suspense fallback={<div className="h-72 animate-pulse rounded-md bg-sunken" />}>
            <LocationPicker
              latitude={typeof latitude === 'number' ? latitude : null}
              longitude={typeof longitude === 'number' ? longitude : null}
              onChange={(lat, lon) =>
                setValues((current) => ({
                  ...current,
                  latitude: String(lat),
                  longitude: String(lon),
                }))
              }
            />
          </Suspense>
        </ErrorBoundary>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Latitude" error={errors.latitude}>
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                value={values.latitude}
                onChange={(event) => set('latitude')(event.target.value)}
                placeholder="-22,7253"
              />
            )}
          </Field>
          <Field label="Longitude" error={errors.longitude}>
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                value={values.longitude}
                onChange={(event) => set('longitude')(event.target.value)}
                placeholder="-47,6492"
              />
            )}
          </Field>
          <Field
            label="Altitude (m)"
            hint={
              elevationState === 'failed'
                ? 'Não foi possível consultar a altitude agora.'
                : 'Usada para a pressão ao nível do mar.'
            }
            error={errors.elevationM}
          >
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                value={values.elevationM}
                onChange={(event) => set('elevationM')(event.target.value)}
                placeholder="547"
              />
            )}
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" icon={LocateFixed} onClick={fillMyLocation}>
            Usar minha localização
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Mountain}
            disabled={!located}
            loading={elevationState === 'loading'}
            onClick={lookupElevation}
          >
            Buscar altitude pelo mapa
          </Button>
          {located && (
            <span className="self-center text-[13px] text-ink-3">
              {formatNumber(latitude as number, 4)}, {formatNumber(longitude as number, 4)}
            </span>
          )}
        </div>
      </fieldset>

      <Field
        label="Fuso horário"
        hint="Define o que é “hoje” nos totais de chuva e nos gráficos diários."
        error={errors.timezone}
      >
        {(props) => (
          <Select
            {...props}
            value={values.timezone}
            onChange={(event) => set('timezone')(event.target.value)}
          >
            {BRAZIL_ZONES.map(([zone, label]) => (
              <option key={zone} value={zone}>
                {label}
              </option>
            ))}
            {!BRAZIL_ZONES.some(([zone]) => zone === values.timezone) && (
              <option value={values.timezone}>{values.timezone}</option>
            )}
          </Select>
        )}
      </Field>

      {errors.form && (
        <p role="alert" className="text-sm text-critical">
          {errors.form}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        icon={Save}
        loading={submitting}
        className="self-start"
      >
        {submitLabel}
      </Button>
    </form>
  );
}
