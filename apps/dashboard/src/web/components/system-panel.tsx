import { CircleCheck, OctagonAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSystemStatus } from '../api/queries';
import { formatBytes, formatCompact, formatDateTime, formatRelative } from '../lib/format';
import type { StatusLook } from '../lib/status';
import { useNow } from '../lib/time';
import { ErrorNotice } from './ui/misc';
import { StatusPill } from './ui/status';

const OK = (label: string): StatusLook => ({ label, icon: CircleCheck, tone: 'good' });
const DOWN = (label: string): StatusLook => ({ label, icon: OctagonAlert, tone: 'critical' });

function Row({ name, status, detail }: { name: string; status?: StatusLook; detail: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-ink">{name}</p>
        <p className="text-[13px] text-ink-3">{detail}</p>
      </div>
      {status && <StatusPill look={status} className="shrink-0" />}
    </div>
  );
}

/** Health of the server side: collector, broker, database and live connections. */
export function SystemPanel() {
  const status = useSystemStatus();
  const now = useNow();
  const data = status.data;

  return (
    <section className="panel px-4 pt-3.5 pb-2">
      <h2 className="heading text-[15px]">Sistema</h2>
      {status.isError && <ErrorNotice error={status.error} className="mt-3 mb-2" />}
      {data && (
        <div className="mt-1 divide-y divide-hairline">
          <Row
            name="Coletor de dados"
            status={data.collector?.online ? OK('Funcionando') : DOWN('Parado')}
            detail={
              data.collector
                ? data.collector.online
                  ? `Versão ${data.collector.version}, em execução desde ${formatDateTime(data.collector.startedAt)}`
                  : `Último sinal ${formatRelative(data.collector.lastBeatAt, now)}`
                : 'Ainda não iniciou'
            }
          />
          <Row
            name="Broker MQTT"
            status={data.broker.connected ? OK('Conectado') : DOWN('Sem conexão')}
            detail={
              data.broker.connected
                ? `${data.broker.clients ?? 0} ${data.broker.clients === 1 ? 'cliente conectado' : 'clientes conectados'}`
                : 'O painel não consegue falar com o Mosquitto'
            }
          />
          <Row
            name="Banco de dados"
            detail={`${formatBytes(data.database.sizeBytes)}, cerca de ${formatCompact(data.database.readingsEstimate)} leituras`}
          />
          <Row
            name="Painel"
            detail={`Versão ${data.dashboard.version}, ${data.dashboard.sseClients} ${data.dashboard.sseClients === 1 ? 'tela acompanhando' : 'telas acompanhando'} ao vivo`}
          />
        </div>
      )}
    </section>
  );
}
