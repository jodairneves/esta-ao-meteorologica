import { useQueryClient } from '@tanstack/react-query';
import type { MonitoringSettings, RetentionSettings } from '@wx/shared';
import { Save } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { SettingsDto } from '../../../common/api';
import { ApiError, api } from '../../api/client';
import { keys, useSettings } from '../../api/queries';
import { Button } from '../../components/ui/button';
import { Checkbox, Field, Input } from '../../components/ui/field';
import { ErrorNotice, PageHeader } from '../../components/ui/misc';
import { useToast } from '../../components/ui/toast';
import { usePageTitle } from '../../lib/page-title';

interface MonitoringField {
  key: keyof MonitoringSettings;
  label: string;
  hint: string;
  unit: string;
}

/** Thresholds grouped by the alert they drive. */
const MONITORING: { title: string; fields: MonitoringField[] }[] = [
  {
    title: 'Estação sem contato',
    fields: [
      {
        key: 'offlineAfterIntervals',
        label: 'Alerta depois de',
        hint: 'Intervalos de leitura sem notícia da estação.',
        unit: 'intervalos',
      },
      {
        key: 'offlineMinSeconds',
        label: 'Mas nunca antes de',
        hint: 'Evita alarmes em estações que leem muito rápido.',
        unit: 'segundos',
      },
      {
        key: 'offlineCriticalAfterSeconds',
        label: 'Vira crítico após',
        hint: 'Tempo sem contato até o alerta passar de atenção para crítico.',
        unit: 'segundos',
      },
    ],
  },
  {
    title: 'Sensor sem dados',
    fields: [
      {
        key: 'sensorStaleAfterIntervals',
        label: 'Alerta depois de',
        hint: 'Leituras seguidas sem valor de um sensor.',
        unit: 'intervalos',
      },
      {
        key: 'sensorStaleMinSeconds',
        label: 'Mas nunca antes de',
        hint: 'Tempo mínimo para o alerta de sensor.',
        unit: 'segundos',
      },
    ],
  },
  {
    title: 'Bateria',
    fields: [
      {
        key: 'batteryLowMv',
        label: 'Baixa abaixo de',
        hint: 'Gera alerta de atenção.',
        unit: 'mV',
      },
      {
        key: 'batteryCriticalMv',
        label: 'Crítica abaixo de',
        hint: 'Gera alerta crítico.',
        unit: 'mV',
      },
    ],
  },
];

const RETENTION: {
  key: Exclude<keyof RetentionSettings, 'readingsDays'>;
  label: string;
  hint: string;
}[] = [
  { key: 'logsDays', label: 'Logs do sistema', hint: 'Registros de funcionamento.' },
  { key: 'auditDays', label: 'Auditoria', hint: 'Quem fez o quê: logins, cadastros e alterações.' },
  { key: 'healthDays', label: 'Saúde dos dispositivos', hint: 'Bateria, sinal e memória.' },
];

function SettingsForms({ settings }: { settings: SettingsDto }) {
  const client = useQueryClient();
  const toast = useToast();
  const [monitoring, setMonitoring] = useState(() =>
    Object.fromEntries(
      Object.entries(settings.monitoring).map(([key, value]) => [key, String(value)]),
    ),
  );
  const [retention, setRetention] = useState(() => ({
    logsDays: String(settings.retention.logsDays),
    auditDays: String(settings.retention.auditDays),
    healthDays: String(settings.retention.healthDays),
    readingsDays: String(settings.retention.readingsDays ?? 3650),
  }));
  const [keepReadings, setKeepReadings] = useState(settings.retention.readingsDays === null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState<'monitoring' | 'retention' | null>(null);

  const save = async (section: 'monitoring' | 'retention', body: Partial<SettingsDto>) => {
    setSaving(section);
    setErrors({});
    try {
      const updated = await api.put<SettingsDto>('/settings', body);
      client.setQueryData(keys.settings, updated);
      toast('success', 'Configurações salvas');
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = caught.fieldErrors;
        setErrors({
          [section]:
            caught.code === 'VALIDATION'
              ? 'Confira os valores: algum está fora do intervalo permitido (a bateria crítica precisa ficar abaixo da baixa).'
              : caught.message,
          ...Object.fromEntries(
            Object.entries(fields).map(([key, messages]) => [key, messages[0]]),
          ),
        });
      }
    } finally {
      setSaving(null);
    }
  };

  const submitMonitoring = (event: FormEvent) => {
    event.preventDefault();
    const body = Object.fromEntries(
      Object.entries(monitoring).map(([key, value]) => [key, Number(value)]),
    );
    save('monitoring', { monitoring: body as unknown as MonitoringSettings });
  };

  const submitRetention = (event: FormEvent) => {
    event.preventDefault();
    save('retention', {
      retention: {
        logsDays: Number(retention.logsDays),
        auditDays: Number(retention.auditDays),
        healthDays: Number(retention.healthDays),
        readingsDays: keepReadings ? null : Number(retention.readingsDays),
      },
    });
  };

  return (
    <>
      <form onSubmit={submitMonitoring} noValidate className="panel flex flex-col gap-5 px-5 py-5">
        <div>
          <h2 className="heading text-base">Monitoramento</h2>
          <p className="mt-1 text-sm text-ink-2">
            Quando o sistema deve abrir alertas. As mudanças passam a valer em até um minuto.
          </p>
        </div>
        {MONITORING.map((group) => (
          <fieldset key={group.title} className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-medium text-ink">{group.title}</legend>
            {group.fields.map((field) => (
              <Field key={field.key} label={`${field.label} (${field.unit})`} hint={field.hint}>
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    inputMode="numeric"
                    value={monitoring[field.key] ?? ''}
                    onChange={(event) =>
                      setMonitoring((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                  />
                )}
              </Field>
            ))}
          </fieldset>
        ))}
        {errors.monitoring && (
          <p role="alert" className="text-sm text-critical">
            {errors.monitoring}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          icon={Save}
          loading={saving === 'monitoring'}
          className="self-start"
        >
          Salvar monitoramento
        </Button>
      </form>

      <form onSubmit={submitRetention} noValidate className="panel flex flex-col gap-5 px-5 py-5">
        <div>
          <h2 className="heading text-base">Retenção de dados</h2>
          <p className="mt-1 text-sm text-ink-2">
            Por quantos dias guardar cada tipo de registro. O coletor faz a limpeza a cada 6 horas.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {RETENTION.map((field) => (
            <Field key={field.key} label={`${field.label} (dias)`} hint={field.hint}>
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  inputMode="numeric"
                  value={retention[field.key]}
                  onChange={(event) =>
                    setRetention((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              )}
            </Field>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Checkbox
            label="Guardar as leituras meteorológicas para sempre (recomendado)"
            checked={keepReadings}
            onChange={(event) => setKeepReadings(event.target.checked)}
          />
          {!keepReadings && (
            <Field
              label="Apagar leituras com mais de (dias)"
              hint="Mínimo de 30 dias. Leituras apagadas não voltam; os gráficos anuais ficam incompletos."
              className="max-w-xs"
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  inputMode="numeric"
                  value={retention.readingsDays}
                  onChange={(event) =>
                    setRetention((current) => ({ ...current, readingsDays: event.target.value }))
                  }
                />
              )}
            </Field>
          )}
        </div>
        {errors.retention && (
          <p role="alert" className="text-sm text-critical">
            {errors.retention}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          icon={Save}
          loading={saving === 'retention'}
          className="self-start"
        >
          Salvar retenção
        </Button>
      </form>
    </>
  );
}

export default function SettingsPage() {
  usePageTitle('Configurações');
  const settings = useSettings();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Limiares de alerta e por quanto tempo o sistema guarda os dados."
      />
      {settings.isError && <ErrorNotice error={settings.error} />}
      {settings.data ? (
        <SettingsForms settings={settings.data} />
      ) : (
        <div className="panel h-96 animate-pulse" />
      )}
    </div>
  );
}
