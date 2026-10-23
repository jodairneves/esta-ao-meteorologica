import { TriangleAlert } from 'lucide-react';
import type { StationCredentials } from '../../../common/api';
import { CopyButton } from '../ui/misc';

function Row({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-hairline py-2 first:border-0">
      <div className="min-w-0">
        <p className="text-[13px] text-ink-3">{label}</p>
        <p className={secret ? 'dense font-medium break-all text-ink' : 'break-all text-ink'}>
          {value}
        </p>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

/** MQTT credentials of a station: shown once, right after they are generated. */
export function CredentialsCard({ credentials }: { credentials: StationCredentials }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="flex gap-2 rounded-md border border-warning/50 px-3 py-2.5 text-sm text-ink">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        Anote a senha agora: ela não será mostrada de novo. Se perder, gere uma nova (a estação
        precisará ser configurada outra vez).
      </p>
      <div className="rounded-md border border-hairline bg-sunken px-3 py-1">
        <Row label="Servidor MQTT" value={credentials.host} />
        <Row label="Porta" value={String(credentials.port)} />
        <Row label="Conexão segura (TLS)" value={credentials.tls ? 'Sim' : 'Não'} />
        <Row label="Usuário" value={credentials.username} />
        <Row label="Senha" value={credentials.password} secret />
        <Row label="Identificador do cliente" value={credentials.clientId} />
      </div>
      <div className="text-sm text-ink-2">
        <h3 className="heading mb-1.5 text-sm text-ink">Como configurar o D1 mini</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Abra o portal da estação: ele abre sozinho no primeiro uso, ou dê dois toques no botão
            RESET do D1 mini em até 3 segundos.
          </li>
          <li>Conecte o celular à rede Wi-Fi da estação (a senha está no guia de montagem).</li>
          <li>
            Escolha o Wi-Fi do local e preencha servidor, porta, TLS, o código da estação (
            {credentials.username}) e a senha acima.
          </li>
          <li>Salve. A estação se conecta e aparece como online no painel em alguns segundos.</li>
        </ol>
      </div>
    </div>
  );
}
