import { Info, TriangleAlert } from 'lucide-react';
import type { StationCredentials } from '../../../common/api';
import { CopyButton } from '../ui/misc';

function Row({
  label,
  value,
  secret = false,
  copy = true,
}: {
  label: string;
  value: string;
  secret?: boolean;
  /** Off for explanations, which are not values to paste anywhere. */
  copy?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-hairline py-2 first:border-0">
      <div className="min-w-0">
        <p className="text-[13px] text-ink-3">{label}</p>
        <p className={secret ? 'dense font-medium break-all text-ink' : 'break-all text-ink'}>
          {value}
        </p>
      </div>
      {copy && <CopyButton value={value} />}
    </div>
  );
}

/**
 * What the D1 mini needs to reach the broker, right after the station is registered or gets a new
 * password. A password of its own is shown only this once; with a shared broker the station uses
 * the broker's login, whose password the dashboard does not keep (design §3.10).
 */
export function CredentialsCard({
  code,
  credentials,
}: {
  code: string;
  credentials: StationCredentials;
}) {
  const shared = credentials.login === 'shared';
  return (
    <div className="flex flex-col gap-4">
      {shared ? (
        <p className="flex gap-2 rounded-md border border-hairline px-3 py-2.5 text-sm text-ink">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
          Este painel usa um broker compartilhado: todas as estações entram com o usuário e a senha
          do próprio broker. A senha não fica guardada no painel.
        </p>
      ) : (
        <p className="flex gap-2 rounded-md border border-warning/50 px-3 py-2.5 text-sm text-ink">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          Anote a senha agora: ela não será mostrada de novo. Se perder, gere uma nova (a estação
          precisará ser configurada outra vez).
        </p>
      )}
      <div className="rounded-md border border-hairline bg-sunken px-3 py-1">
        <Row label="Servidor MQTT" value={credentials.host} />
        <Row label="Porta" value={String(credentials.port)} />
        <Row label="Conexão segura (TLS)" value={credentials.tls ? 'Sim' : 'Não'} copy={false} />
        <Row label="Código da estação" value={code} />
        {shared ? (
          <>
            <Row label="Usuário MQTT" value={credentials.username} />
            <Row label="Senha MQTT" value="A do broker" copy={false} />
          </>
        ) : (
          <>
            <Row label="Usuário MQTT" value="Em branco (vale o código da estação)" copy={false} />
            <Row label="Senha MQTT" value={credentials.password ?? ''} secret />
          </>
        )}
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
          <li>Escolha o Wi-Fi do local e preencha os campos com os dados acima.</li>
          <li>Salve. A estação se conecta e aparece como online no painel em alguns segundos.</li>
        </ol>
      </div>
    </div>
  );
}
