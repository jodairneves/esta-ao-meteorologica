import type { DeviceConfig, PowerConfigMode, RainEdge } from '@wx/shared';
import { CircleCheck, Clock, Save } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { StationDetail } from '../../../common/api';
import { ApiError } from '../../api/client';
import { formatNumber } from '../../lib/format';
import { Button } from '../ui/button';
import { Field, Input, Select } from '../ui/field';
import { StatusPill } from '../ui/status';

type NumberKey = 'interval_s' | 'health_s' | 'economy_batch_s' | 'survival_sleep_s';
type PowerKey = 'economy_below_mv' | 'survival_below_mv' | 'recover_above_mv' | 'bat_full_scale_mv';

const TIMING: { key: NumberKey; label: string; hint: string }[] = [
  { key: 'interval_s', label: 'Intervalo entre leituras (s)', hint: '10 a 3600. Padrão: 60.' },
  {
    key: 'health_s',
    label: 'Relatório de saúde a cada (s)',
    hint: 'Bateria, sinal e memória. Padrão: 300.',
  },
  {
    key: 'economy_batch_s',
    label: 'Envio em lote na Economia (s)',
    hint: 'Junta as leituras e envia de uma vez.',
  },
  {
    key: 'survival_sleep_s',
    label: 'Sono na Sobrevivência (s)',
    hint: '300 a 10800. Padrão: 1800.',
  },
];

const POWER: { key: PowerKey; label: string; hint: string }[] = [
  { key: 'economy_below_mv', label: 'Entra em Economia abaixo de (mV)', hint: 'Padrão: 3650.' },
  {
    key: 'survival_below_mv',
    label: 'Entra em Sobrevivência abaixo de (mV)',
    hint: 'Padrão: 3450.',
  },
  { key: 'recover_above_mv', label: 'Volta ao Normal acima de (mV)', hint: 'Padrão: 3800.' },
  {
    key: 'bat_full_scale_mv',
    label: 'Fundo de escala do divisor (mV)',
    hint: 'Tensão que o ADC lê como máximo.',
  },
];

/** Desired configuration of the D1 mini, delivered as a retained MQTT message. */
export function DeviceConfigForm({
  station,
  onSave,
}: {
  station: StationDetail;
  onSave: (config: DeviceConfig) => Promise<void>;
}) {
  const config = station.deviceConfig;
  const [values, setValues] = useState(() => ({
    interval_s: String(config.interval_s),
    health_s: String(config.health_s),
    economy_batch_s: String(config.economy_batch_s),
    survival_sleep_s: String(config.survival_sleep_s),
    economy_below_mv: String(config.power.economy_below_mv),
    survival_below_mv: String(config.power.survival_below_mv),
    recover_above_mv: String(config.power.recover_above_mv),
    bat_full_scale_mv: String(config.power.bat_full_scale_mv),
  }));
  const [mode, setMode] = useState<PowerConfigMode>(config.power.mode);
  const [rainEdge, setRainEdge] = useState<RainEdge>(config.rain_edge);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const applied = station.configAppliedRev === station.deviceConfigRev;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const number = (key: keyof typeof values) => Number.parseInt(values[key], 10);
    setSaving(true);
    setError(null);
    try {
      await onSave({
        interval_s: number('interval_s'),
        health_s: number('health_s'),
        economy_batch_s: number('economy_batch_s'),
        survival_sleep_s: number('survival_sleep_s'),
        rain_edge: rainEdge,
        power: {
          mode,
          economy_below_mv: number('economy_below_mv'),
          survival_below_mv: number('survival_below_mv'),
          recover_above_mv: number('recover_above_mv'),
          bat_full_scale_mv: number('bat_full_scale_mv'),
        },
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === 'VALIDATION'
          ? 'Confira os valores: os limites precisam seguir Sobrevivência < Economia < Normal, e o lote não pode ser menor que o intervalo.'
          : caught instanceof Error
            ? caught.message
            : 'Não foi possível salvar.',
      );
    } finally {
      setSaving(false);
    }
  };

  const numberField = (field: { key: keyof typeof values; label: string; hint: string }) => (
    <Field key={field.key} label={field.label} hint={field.hint}>
      {(props) => (
        <Input
          {...props}
          type="number"
          inputMode="numeric"
          value={values[field.key]}
          onChange={(event) =>
            setValues((current) => ({ ...current, [field.key]: event.target.value }))
          }
        />
      )}
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusPill
          look={
            applied
              ? { label: 'Aplicada pela estação', icon: CircleCheck, tone: 'good' }
              : { label: 'Aguardando a estação', icon: Clock, tone: 'warning' }
          }
        />
        <span className="text-[13px] text-ink-3">
          Revisão {station.deviceConfigRev}
          {station.configAppliedRev !== null &&
            !applied &&
            `; a estação está na ${station.configAppliedRev}`}
          . A estação recebe a configuração na próxima conexão.
        </span>
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="heading mb-2 text-sm">Tempos</legend>
        {TIMING.map(numberField)}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="heading mb-2 text-sm">Energia</legend>
        <Field label="Perfil de energia" hint="Automático troca de perfil pela tensão da bateria.">
          {(props) => (
            <Select
              {...props}
              value={mode}
              onChange={(event) => setMode(event.target.value as PowerConfigMode)}
            >
              <option value="auto">Automático pela bateria</option>
              <option value="normal">Sempre Normal</option>
              <option value="economy">Sempre Economia</option>
            </Select>
          )}
        </Field>
        <div className="hidden sm:block" />
        {POWER.map(numberField)}
        <p className="text-[13px] text-ink-3 sm:col-span-2">
          Bateria de lítio: {formatNumber(Number(values.survival_below_mv) / 1000, 2)} V é quase
          vazia e 4,20 V é cheia.
        </p>
      </fieldset>

      <fieldset>
        <legend className="heading mb-2 text-sm">Pluviômetro</legend>
        <Field
          label="Contagem da báscula"
          hint="Mude só se a chuva contada não bater com o volume medido num recipiente."
        >
          {(props) => (
            <Select
              {...props}
              value={rainEdge}
              onChange={(event) => setRainEdge(event.target.value as RainEdge)}
            >
              <option value="change">Cada mudança de estado</option>
              <option value="falling">Só na borda de descida</option>
            </Select>
          )}
        </Field>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" icon={Save} loading={saving} className="self-start">
        Enviar configuração
      </Button>
    </form>
  );
}
