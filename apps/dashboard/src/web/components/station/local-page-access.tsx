import { Check, Copy, ExternalLink, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useState } from 'react';
import type { LocalPageAccess as Access, StationDetail } from '../../../common/api';
import { api } from '../../api/client';
import { useIsAdmin } from '../../app/session';
import { Button } from '../ui/button';
import { useToast } from '../ui/toast';

const HIDDEN = '••••-••••-••••';
const SMALL_BUTTON =
  'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-2 hover:bg-panel hover:text-ink disabled:opacity-50';

/**
 * Way into the configuration page the station serves on its local network: the link and, for
 * admins, the login. The password is fetched only when asked for, since each lookup is audited.
 */
export function LocalPageAccess({ station }: { station: StationDetail }) {
  const isAdmin = useIsAdmin();
  const toast = useToast();
  const [access, setAccess] = useState<Access | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const ip = station.state.ipAddress;
  if (!ip || !isAdmin) return null;

  const fetchAccess = async (generate = false): Promise<Access | null> => {
    setBusy(true);
    try {
      const path = `/stations/${station.id}/local-access`;
      const result = generate ? await api.post<Access>(path) : await api.get<Access>(path);
      setAccess(result);
      return result;
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Não foi possível buscar a senha.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const show = async () => {
    if (access ?? (await fetchAccess())) setVisible(true);
  };

  const copy = async () => {
    const password = (access ?? (await fetchAccess()))?.password;
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-3 border-t border-hairline pt-3 text-[13px]">
      <a
        href={`http://${ip}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline"
      >
        Abrir a página da estação
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
      <p className="mt-0.5 text-ink-3">Abre só com o aparelho na mesma rede da estação.</p>

      {access?.password === null ? (
        <div className="mt-2">
          <p className="text-ink-2">Esta estação ainda não tem senha para a página.</p>
          <Button
            size="sm"
            icon={KeyRound}
            loading={busy}
            className="mt-1.5"
            onClick={() => fetchAccess(true).then((result) => result && setVisible(true))}
          >
            Gerar senha
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
          <span className="text-ink-2">
            Usuário{' '}
            <strong className="dense font-medium text-ink">{access?.username ?? 'admin'}</strong>,
            senha
          </span>
          <span className="dense font-medium text-ink" aria-live="polite">
            {visible && access?.password ? access.password : HIDDEN}
          </span>
          {visible ? (
            <button type="button" className={SMALL_BUTTON} onClick={() => setVisible(false)}>
              <EyeOff aria-hidden className="size-4" />
              Ocultar
            </button>
          ) : (
            <button type="button" className={SMALL_BUTTON} disabled={busy} onClick={show}>
              <Eye aria-hidden className="size-4" />
              Ver
            </button>
          )}
          <button type="button" className={SMALL_BUTTON} disabled={busy} onClick={copy}>
            {copied ? (
              <Check aria-hidden className="size-4 text-good" />
            ) : (
              <Copy aria-hidden className="size-4" />
            )}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      )}
    </div>
  );
}
