import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import type { LocalPageAccess, StationDetail } from '../../../common/api';
import { api } from '../../api/client';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { CopyButton } from '../ui/misc';
import { useToast } from '../ui/toast';

/**
 * Password of the configuration page the station serves on its local network: generated here,
 * looked up on the station page (Ver/Copiar).
 */
export function LocalPasswordPanel({
  station,
  onRotated,
}: {
  station: StationDetail;
  onRotated: () => void;
}) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [access, setAccess] = useState<LocalPageAccess | null>(null);

  const rotate = async () => {
    setRotating(true);
    try {
      setAccess(await api.post<LocalPageAccess>(`/stations/${station.id}/local-access`));
      setConfirming(false);
      onRotated();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Não foi possível gerar a senha.');
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="mt-8 flex max-w-2xl flex-col gap-4 border-t border-hairline pt-6 text-sm text-ink-2">
      <h3 className="heading text-base text-ink">Página da estação na rede local</h3>
      <p>
        Com o computador ou o celular na mesma rede da estação, a página dela permite trocar o
        servidor e o Wi-Fi sem ir até o D1 mini. O endereço e a senha (usuário{' '}
        <strong className="dense font-medium text-ink">admin</strong>) ficam na tela da estação, em
        "Energia e sinal".
      </p>
      <p>
        Gere uma nova senha se a atual foi exposta. Ela chega à estação junto com a configuração
        remota; até lá, a anterior continua valendo.
      </p>
      <Button icon={KeyRound} className="self-start" onClick={() => setConfirming(true)}>
        Gerar nova senha da página
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Gerar nova senha da página?"
        confirmLabel="Gerar nova senha"
        loading={rotating}
        onConfirm={rotate}
      >
        <p>A senha atual deixa de valer assim que {station.name} receber a configuração nova.</p>
      </ConfirmDialog>

      {access?.password && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-sunken px-3 py-2">
          <div className="min-w-0">
            <p className="text-[13px] text-ink-3">Nova senha da página</p>
            <p className="dense font-medium break-all text-ink">{access.password}</p>
          </div>
          <CopyButton value={access.password} />
        </div>
      )}
    </div>
  );
}
