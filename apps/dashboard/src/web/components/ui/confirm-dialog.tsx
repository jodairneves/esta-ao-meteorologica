import { type ReactNode, useState } from 'react';
import { Button } from './button';
import { Dialog } from './dialog';
import { Input } from './field';

/**
 * Confirmation for actions that are hard to undo. The confirm button names the action, and
 * `typeToConfirm` asks for a word (the station code) before destructive ones.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  danger = false,
  typeToConfirm,
  loading = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  typeToConfirm?: string;
  loading?: boolean;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const blocked = typeToConfirm !== undefined && typed.trim() !== typeToConfirm;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped('');
        onOpenChange(next);
      }}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={blocked}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-ink-2">
        {children}
        {typeToConfirm !== undefined && (
          <label className="flex flex-col gap-1.5">
            <span>
              Digite <strong className="text-ink">{typeToConfirm}</strong> para confirmar
            </span>
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
            />
          </label>
        )}
      </div>
    </Dialog>
  );
}
