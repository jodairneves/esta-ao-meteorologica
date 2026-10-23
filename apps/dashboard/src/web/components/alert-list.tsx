import { Check } from 'lucide-react';
import { Link } from 'react-router';
import type { AlertDto } from '../../common/api';
import { useAcknowledgeAlert } from '../api/queries';
import { cn } from '../lib/css';
import { formatDateTime, formatRelative } from '../lib/format';
import { ALERT_TYPE_LABELS, SEVERITY_LOOK } from '../lib/status';
import { useNow } from '../lib/time';
import { Button } from './ui/button';
import { StatusPill } from './ui/status';
import { useToast } from './ui/toast';

/** Alerts as rows: severity (icon + text), what, where, since when, and acknowledgement. */
export function AlertList({ alerts, compact = false }: { alerts: AlertDto[]; compact?: boolean }) {
  const now = useNow();
  const acknowledge = useAcknowledgeAlert();
  const toast = useToast();

  return (
    <ul className="divide-y divide-hairline">
      {alerts.map((alert) => {
        const resolved = alert.status === 'resolved';
        return (
          <li key={alert.id} className={cn('flex gap-3', compact ? 'py-3' : 'px-4 py-3.5')}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusPill
                  look={
                    resolved
                      ? { ...SEVERITY_LOOK[alert.severity], tone: 'neutral' }
                      : SEVERITY_LOOK[alert.severity]
                  }
                />
                <span className="text-sm font-medium text-ink">
                  {ALERT_TYPE_LABELS[alert.type]}
                </span>
                {alert.stationCode && (
                  <Link
                    to={`/estacoes/${alert.stationCode}`}
                    className="text-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline"
                  >
                    {alert.stationName}
                  </Link>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-2">{alert.message}</p>
              <p className="mt-1 text-[13px] text-ink-3">
                <time dateTime={alert.startedAt} title={formatDateTime(alert.startedAt)}>
                  Começou {formatRelative(alert.startedAt, now)}
                </time>
                {resolved && alert.resolvedAt && (
                  <>, resolvido {formatRelative(alert.resolvedAt, now)}</>
                )}
                {alert.acknowledgedAt && (
                  <>, reconhecido por {alert.acknowledgedBy ?? 'usuário removido'}</>
                )}
              </p>
            </div>
            {!resolved && !alert.acknowledgedAt && (
              <Button
                size="sm"
                variant="ghost"
                icon={Check}
                className="self-start"
                loading={acknowledge.isPending && acknowledge.variables === alert.id}
                onClick={() =>
                  acknowledge.mutate(alert.id, {
                    onSuccess: () => toast('success', 'Alerta reconhecido'),
                    onError: (error) => toast('error', error.message),
                  })
                }
              >
                Reconhecer
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
