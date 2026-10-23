import { Calculator, Save } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { StationDetail, UpdateStationBody } from '../../../common/api';
import { ApiError } from '../../api/client';
import { formatNumber } from '../../lib/format';
import { Button } from '../ui/button';
import { Field, Input } from '../ui/field';
import { parseDecimal } from './station-form';

const FIELDS = [
  {
    key: 'rainMmPerTip',
    label: 'Chuva por basculada (mm)',
    hint: 'Volume de cada virada da báscula do pluviômetro.',
  },
  {
    key: 'windMsPerHz',
    label: 'Vento por pulso (m/s por Hz)',
    hint: 'Converte a frequência dos pulsos em velocidade.',
  },
  {
    key: 'tempOffsetC',
    label: 'Correção de temperatura (°C)',
    hint: 'Somada a cada leitura do BME280.',
  },
  {
    key: 'humOffsetPct',
    label: 'Correção de umidade (%)',
    hint: 'Somada a cada leitura do BME280.',
  },
  {
    key: 'presOffsetHpa',
    label: 'Correção de pressão (hPa)',
    hint: 'Compare com uma estação oficial próxima.',
  },
] as const;

type CalibrationKey = (typeof FIELDS)[number]['key'];

/**
 * Cup anemometer: the cups travel 2πr per turn, the wind moves `factor` times faster than the
 * cups, and the reed switch closes `pulses` times per turn.
 */
function AnemometerCalculator({ onUse }: { onUse: (value: number) => void }) {
  // Starts from the reference anemometer (MakerWorld): 80 mm radius, 3 magnets.
  const [radius, setRadius] = useState('80');
  const [pulses, setPulses] = useState('3');
  const [factor, setFactor] = useState('2,5');
  const r = parseDecimal(radius);
  const p = parseDecimal(pulses);
  const f = parseDecimal(factor);
  const result =
    typeof r === 'number' &&
    typeof p === 'number' &&
    typeof f === 'number' &&
    r > 0 &&
    p > 0 &&
    f > 0
      ? (2 * Math.PI * (r / 1000) * f) / p
      : null;

  return (
    <div className="rounded-md border border-hairline bg-sunken px-4 py-3">
      <h3 className="heading flex items-center gap-2 text-sm">
        <Calculator aria-hidden className="size-4 text-ink-2" />
        Calculadora do anemômetro
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Raio até o centro do copo (mm)">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={radius}
              onChange={(event) => setRadius(event.target.value)}
            />
          )}
        </Field>
        <Field label="Pulsos por volta">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={pulses}
              onChange={(event) => setPulses(event.target.value)}
            />
          )}
        </Field>
        <Field label="Fator do anemômetro" hint="Entre 2 e 3 para conchas comuns.">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={factor}
              onChange={(event) => setFactor(event.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-2">
          Resultado:{' '}
          <span className="readout text-base text-ink">{formatNumber(result, 3)} m/s por Hz</span>
        </p>
        <Button
          size="sm"
          disabled={result === null}
          onClick={() => result !== null && onUse(Number(result.toFixed(4)))}
        >
          Usar este valor
        </Button>
      </div>
    </div>
  );
}

export function CalibrationForm({
  station,
  onSave,
}: {
  station: StationDetail;
  onSave: (body: UpdateStationBody) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<CalibrationKey, string>>(() => ({
    rainMmPerTip: String(station.rainMmPerTip),
    windMsPerHz: String(station.windMsPerHz),
    tempOffsetC: String(station.tempOffsetC),
    humOffsetPct: String(station.humOffsetPct),
    presOffsetHpa: String(station.presOffsetHpa),
  }));
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body: Record<string, number> = {};
    const problems: Record<string, string> = {};
    for (const field of FIELDS) {
      const value = parseDecimal(values[field.key]);
      if (typeof value !== 'number') problems[field.key] = 'Informe um número';
      else body[field.key] = value;
    }
    if (Object.keys(problems).length) {
      setErrors(problems);
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await onSave(body);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors({
          ...Object.fromEntries(
            Object.entries(caught.fieldErrors).map(([key, messages]) => [key, messages[0]]),
          ),
          form: caught.code === 'VALIDATION' ? undefined : caught.message,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <p className="text-sm text-ink-2">
        A calibração vale para as leituras recebidas a partir de agora; o histórico não é
        recalculado.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <Field key={field.key} label={field.label} hint={field.hint} error={errors[field.key]}>
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                value={values[field.key]}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.key]: event.target.value }))
                }
              />
            )}
          </Field>
        ))}
      </div>
      <AnemometerCalculator
        onUse={(value) => setValues((current) => ({ ...current, windMsPerHz: String(value) }))}
      />
      {errors.form && (
        <p role="alert" className="text-sm text-critical">
          {errors.form}
        </p>
      )}
      <Button type="submit" variant="primary" icon={Save} loading={saving} className="self-start">
        Salvar calibração
      </Button>
    </form>
  );
}
