import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Command, CommandStatus } from '@wx/shared';
import {
  CircleCheck,
  CircleX,
  Clock,
  HeartPulse,
  Lightbulb,
  type LucideIcon,
  Power,
  Send,
  TimerOff,
} from 'lucide-react';
import { useState } from 'react';
import type { CommandDto, StationDetail } from '../../../common/api';
import { api } from '../../api/client';
import { keys, useCommands } from '../../api/queries';
import { formatDateTime } from '../../lib/format';
import type { StatusLook } from '../../lib/status';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { StatusPill } from '../ui/status';
import { useToast } from '../ui/toast';

const COMMANDS: { command: Command; label: string; description: string; icon: LucideIcon }[] = [
  {
    command: 'identify',
    label: 'Piscar o LED',
    description: 'Ajuda a achar a estação certa em campo.',
    icon: Lightbulb,
  },
  {
    command: 'flush',
    label: 'Enviar a fila agora',
    description: 'Manda as leituras guardadas sem esperar o lote.',
    icon: Send,
  },
  {
    command: 'health',
    label: 'Pedir relatório de saúde',
    description: 'Bateria, sinal e memória neste momento.',
    icon: HeartPulse,
  },
  {
    command: 'reboot',
    label: 'Reiniciar',
    description: 'Reinicia o D1 mini; volta em menos de um minuto.',
    icon: Power,
  },
];

const COMMAND_LABELS = Object.fromEntries(
  COMMANDS.map((item) => [item.command, item.label]),
) as Record<Command, string>;

const STATUS_LOOK: Record<CommandStatus, StatusLook> = {
  sent: { label: 'Enviado', icon: Clock, tone: 'neutral' },
  acked: { label: 'Executado', icon: CircleCheck, tone: 'good' },
  failed: { label: 'Falhou', icon: CircleX, tone: 'critical' },
  expired: { label: 'Expirou', icon: TimerOff, tone: 'warning' },
};

/** Remote commands; a sleeping station runs them when it wakes (until they expire). */
export function CommandsPanel({ station }: { station: StationDetail }) {
  const commands = useCommands(station.id);
  const client = useQueryClient();
  const toast = useToast();
  const [confirmReboot, setConfirmReboot] = useState(false);

  const send = useMutation({
    mutationFn: (command: Command) =>
      api.post<CommandDto>(`/stations/${station.id}/commands`, { command }),
    onSuccess: (created) => {
      client.invalidateQueries({ queryKey: keys.commands(station.id) });
      toast('success', `Comando “${COMMAND_LABELS[created.command]}” enviado`);
      setConfirmReboot(false);
    },
    onError: (error) => toast('error', error.message),
  });

  return (
    <div className="flex flex-col gap-5">
      {station.status === 'sleeping' && (
        <p className="text-sm text-ink-2">
          A estação está dormindo: os comandos ficam guardados no broker e são executados quando ela
          acordar (valem por 60 minutos).
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {COMMANDS.map((item) => (
          <div
            key={item.command}
            className="flex items-start justify-between gap-3 rounded-md border border-hairline px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-ink">{item.label}</p>
              <p className="text-[13px] text-ink-3">{item.description}</p>
            </div>
            <Button
              size="sm"
              icon={item.icon}
              loading={send.isPending && send.variables === item.command}
              onClick={() =>
                item.command === 'reboot' ? setConfirmReboot(true) : send.mutate(item.command)
              }
            >
              Enviar
            </Button>
          </div>
        ))}
      </div>

      <div>
        <h3 className="heading mb-2 text-sm">Histórico</h3>
        {commands.data?.length ? (
          <ul className="divide-y divide-hairline rounded-md border border-hairline">
            {commands.data.map((command) => (
              <li
                key={command.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm"
              >
                <span className="text-ink">{COMMAND_LABELS[command.command]}</span>
                <span className="text-[13px] text-ink-3">
                  {formatDateTime(command.createdAt)}
                  {command.createdBy && ` por ${command.createdBy}`}
                </span>
                <StatusPill look={STATUS_LOOK[command.status]} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">Nenhum comando enviado ainda.</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmReboot}
        onOpenChange={setConfirmReboot}
        title={`Reiniciar ${station.name}?`}
        confirmLabel="Reiniciar"
        loading={send.isPending}
        onConfirm={() => send.mutate('reboot')}
      >
        <p>
          A estação fica fora do ar por menos de um minuto. Leituras que ainda estão só na memória
          do D1 mini se perdem; se quiser guardá-las, envie antes o comando “Enviar a fila agora”.
        </p>
      </ConfirmDialog>
    </div>
  );
}
