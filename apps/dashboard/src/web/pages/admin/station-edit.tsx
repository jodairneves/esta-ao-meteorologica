import { useQueryClient } from '@tanstack/react-query';
import type { DeviceConfig } from '@wx/shared';
import { ArrowLeft, ExternalLink, KeyRound, MapPinOff, Pause, Play, Trash } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { StationCredentials, StationDetail, UpdateStationBody } from '../../../common/api';
import { api } from '../../api/client';
import { keys, useStation } from '../../api/queries';
import { CalibrationForm } from '../../components/admin/calibration-form';
import { CommandsPanel } from '../../components/admin/commands-panel';
import { CredentialsCard } from '../../components/admin/credentials-card';
import { DeviceConfigForm } from '../../components/admin/device-config-form';
import { initialStationValues, StationForm } from '../../components/admin/station-form';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Dialog } from '../../components/ui/dialog';
import { EmptyState, ErrorNotice, PageHeader } from '../../components/ui/misc';
import { StatusPill } from '../../components/ui/status';
import { Tabs } from '../../components/ui/tabs';
import { useToast } from '../../components/ui/toast';
import { formatDateTime } from '../../lib/format';
import { usePageTitle } from '../../lib/page-title';
import { stationStatusLook } from '../../lib/status';

const TAB_VALUES = [
  'dados',
  'calibracao',
  'configuracao',
  'credenciais',
  'comandos',
  'remover',
] as const;
type Tab = (typeof TAB_VALUES)[number];

function CredentialsTab({ station, onRotated }: { station: StationDetail; onRotated: () => void }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [credentials, setCredentials] = useState<StationCredentials | null>(null);

  const rotate = async () => {
    setRotating(true);
    try {
      setCredentials(await api.post<StationCredentials>(`/stations/${station.id}/credentials`));
      setConfirming(false);
      onRotated();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Não foi possível gerar a senha.');
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4 text-sm text-ink-2">
      <p>
        Usuário MQTT: <strong className="dense font-medium text-ink">{station.code}</strong>. A
        senha não fica guardada em lugar nenhum que se possa consultar
        {station.mqttCredentialsSetAt && (
          <>; a atual foi gerada em {formatDateTime(station.mqttCredentialsSetAt)}</>
        )}
        .
      </p>
      <p>
        Gere uma nova senha se a anterior foi perdida ou exposta. A estação se desconecta na hora e
        só volta depois de receber a nova senha pelo portal de configuração.
      </p>
      <Button icon={KeyRound} className="self-start" onClick={() => setConfirming(true)}>
        Gerar nova senha
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Gerar nova senha MQTT?"
        confirmLabel="Gerar nova senha"
        danger
        loading={rotating}
        onConfirm={rotate}
      >
        <p>
          {station.name} perde a conexão com o broker até que a nova senha seja digitada no portal
          do D1 mini. Leituras continuam guardadas na memória da estação enquanto houver espaço
          (cerca de 2 horas).
        </p>
      </ConfirmDialog>

      <Dialog
        open={credentials !== null}
        onOpenChange={(open) => !open && setCredentials(null)}
        title="Nova senha gerada"
        description="Use estes dados no portal de configuração do D1 mini."
        footer={
          <Button variant="primary" onClick={() => setCredentials(null)}>
            Anotei, fechar
          </Button>
        }
      >
        {credentials && <CredentialsCard credentials={credentials} />}
      </Dialog>
    </div>
  );
}

function RemoveTab({
  station,
  onChange,
}: {
  station: StationDetail;
  onChange: (body: UpdateStationBody) => Promise<void>;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await onChange({ isActive: !station.isActive });
      toast('success', station.isActive ? 'Estação desativada' : 'Estação reativada');
      setConfirmToggle(false);
    } catch (error) {
      toast(
        'error',
        error instanceof Error ? error.message : 'Não foi possível alterar a estação.',
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/stations/${station.id}`, { confirmCode: station.code });
      client.removeQueries({ queryKey: ['station'] });
      await client.invalidateQueries({ queryKey: keys.stations });
      toast('success', `${station.name} excluída`);
      navigate('/admin/estacoes', { replace: true });
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Não foi possível excluir.');
      setDeleting(false);
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="rounded-md border border-hairline px-4 py-4">
        <h3 className="heading text-sm">
          {station.isActive ? 'Desativar a estação' : 'Reativar a estação'}
        </h3>
        <p className="mt-1 text-sm text-ink-2">
          {station.isActive
            ? 'A estação some da visão geral, o broker recusa a conexão dela e os alertas param. Todo o histórico é mantido.'
            : 'A estação volta a poder se conectar e reaparece na visão geral.'}
        </p>
        <Button
          className="mt-3"
          icon={station.isActive ? Pause : Play}
          onClick={() => setConfirmToggle(true)}
        >
          {station.isActive ? 'Desativar' : 'Reativar'}
        </Button>
      </section>
      <section className="rounded-md border border-critical/50 px-4 py-4">
        <h3 className="heading text-sm">Excluir a estação</h3>
        <p className="mt-1 text-sm text-ink-2">
          Apaga a estação, todas as leituras, o histórico de saúde e o usuário MQTT. Não dá para
          desfazer. Se quiser só parar de receber dados, desative.
        </p>
        <Button
          className="mt-3"
          variant="danger"
          icon={Trash}
          onClick={() => setConfirmDelete(true)}
        >
          Excluir estação
        </Button>
      </section>

      <ConfirmDialog
        open={confirmToggle}
        onOpenChange={setConfirmToggle}
        title={station.isActive ? `Desativar ${station.name}?` : `Reativar ${station.name}?`}
        confirmLabel={station.isActive ? 'Desativar' : 'Reativar'}
        loading={busy}
        onConfirm={toggle}
      >
        <p>
          {station.isActive
            ? 'O D1 mini não conseguirá mais enviar leituras até a estação ser reativada.'
            : 'O D1 mini volta a ser aceito pelo broker com a mesma senha.'}
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Excluir ${station.name}?`}
        confirmLabel="Excluir para sempre"
        danger
        typeToConfirm={station.code}
        loading={deleting}
        onConfirm={remove}
      >
        <p>
          Todas as leituras desta estação serão apagadas do banco de dados. Exporte o CSV antes, se
          precisar.
        </p>
      </ConfirmDialog>
    </div>
  );
}

export default function EditStationPage() {
  const { code = '' } = useParams();
  const station = useStation(code);
  const client = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const tab: Tab = TAB_VALUES.includes(search.get('aba') as Tab)
    ? (search.get('aba') as Tab)
    : 'dados';
  usePageTitle(station.data ? `Editar ${station.data.name}` : 'Editar estação');

  const saved = (detail: StationDetail, message: string) => {
    client.setQueryData(keys.station(code), detail);
    client.invalidateQueries({ queryKey: ['station'] });
    client.invalidateQueries({ queryKey: keys.stations });
    toast('success', message);
  };

  if (station.isError) {
    return (
      <EmptyState icon={MapPinOff} title="Estação não encontrada" className="mt-16">
        <ErrorNotice error={station.error} />
      </EmptyState>
    );
  }
  if (!station.data) return <div className="panel h-96 animate-pulse" />;
  const data = station.data;

  const update = async (body: UpdateStationBody, message = 'Estação salva') => {
    saved(await api.patch<StationDetail>(`/stations/${data.id}`, body), message);
  };

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link
        to="/admin/estacoes"
        className="inline-flex items-center gap-1.5 self-start text-[13px] text-ink-2 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Cadastro de estações
      </Link>
      <PageHeader
        title={data.name}
        actions={
          <Link
            to={`/estacoes/${data.code}`}
            className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-ink-2 hover:bg-raised hover:text-ink"
          >
            <ExternalLink aria-hidden className="size-4" />
            Ver painel da estação
          </Link>
        }
      >
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4">
          <StatusPill look={stationStatusLook(data.status, data.statusSeverity)} />
          <span className="dense text-[13px] text-ink-3">Código {data.code}</span>
        </div>
      </PageHeader>

      <section className="panel px-5 pt-3 pb-6">
        <Tabs
          label="Seções da estação"
          value={tab}
          onValueChange={(value) => setSearch({ aba: value }, { replace: true })}
          items={[
            {
              value: 'dados',
              label: 'Dados e local',
              content: (
                <StationForm
                  initial={initialStationValues(data)}
                  isNew={false}
                  submitLabel="Salvar"
                  onSubmit={async (body) => {
                    const { code: _code, ...rest } = body;
                    await update(rest);
                  }}
                />
              ),
            },
            {
              value: 'calibracao',
              label: 'Calibração',
              content: (
                <CalibrationForm
                  station={data}
                  onSave={(body) => update(body, 'Calibração salva')}
                />
              ),
            },
            {
              value: 'configuracao',
              label: 'Configuração remota',
              content: (
                <DeviceConfigForm
                  station={data}
                  onSave={async (config: DeviceConfig) =>
                    saved(
                      await api.put<StationDetail>(`/stations/${data.id}/device-config`, config),
                      'Configuração enviada à estação',
                    )
                  }
                />
              ),
            },
            {
              value: 'credenciais',
              label: 'Credenciais MQTT',
              content: (
                <CredentialsTab
                  station={data}
                  onRotated={() => client.invalidateQueries({ queryKey: ['station'] })}
                />
              ),
            },
            { value: 'comandos', label: 'Comandos', content: <CommandsPanel station={data} /> },
            {
              value: 'remover',
              label: 'Desativar ou excluir',
              content: <RemoveTab station={data} onChange={(body) => update(body)} />,
            },
          ]}
        />
      </section>
    </div>
  );
}
