import { useQueryClient } from '@tanstack/react-query';
import type { Role } from '@wx/shared';
import {
  CircleCheck,
  CirclePause,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Trash,
  UserPlus,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { type FormEvent, useState } from 'react';
import type { TemporaryPasswordResponse, UserSummary } from '../../../common/api';
import { ApiError, api } from '../../api/client';
import { keys, useUsers } from '../../api/queries';
import { useUser } from '../../app/session';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Dialog } from '../../components/ui/dialog';
import { Field, Input, Select } from '../../components/ui/field';
import { CopyButton, ErrorNotice, PageHeader } from '../../components/ui/misc';
import { StatusPill } from '../../components/ui/status';
import { useToast } from '../../components/ui/toast';
import { formatRelative } from '../../lib/format';
import { usePageTitle } from '../../lib/page-title';
import { useNow } from '../../lib/time';

const ROLE_LABELS: Record<Role, string> = { admin: 'Administrador', operator: 'Operador' };

function TemporaryPassword({ result }: { result: TemporaryPasswordResponse }) {
  return (
    <div className="flex flex-col gap-3 text-sm text-ink-2">
      <p>
        Envie a senha provisória para <strong className="text-ink">{result.user.email}</strong> por
        um canal seguro. No primeiro acesso, a pessoa precisará criar a própria senha.
      </p>
      <div className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-sunken px-3 py-2">
        <span
          data-testid="temporary-password"
          className="dense text-base font-medium break-all text-ink"
        >
          {result.temporaryPassword}
        </span>
        <CopyButton value={result.temporaryPassword} />
      </div>
      <p className="text-[13px] text-ink-3">Esta senha não será mostrada de novo.</p>
    </div>
  );
}

function UserDialog({
  user,
  open,
  onOpenChange,
  onCreated,
}: {
  user: UserSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: TemporaryPasswordResponse) => void;
}) {
  const client = useQueryClient();
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '');
    const role = String(form.get('role') ?? 'operator') as Role;
    setSaving(true);
    setErrors({});
    try {
      if (user) {
        await api.patch<UserSummary>(`/users/${user.id}`, { name, role });
        toast('success', 'Usuário salvo');
      } else {
        const result = await api.post<TemporaryPasswordResponse>('/users', {
          name,
          role,
          email: String(form.get('email') ?? ''),
        });
        onCreated(result);
      }
      client.invalidateQueries({ queryKey: keys.users });
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors({
          ...Object.fromEntries(
            Object.entries(caught.fieldErrors).map(([key, messages]) => [key, messages[0]]),
          ),
          email: caught.code === 'EMAIL_TAKEN' ? caught.message : caught.fieldErrors.email?.[0],
          form: ['VALIDATION', 'EMAIL_TAKEN'].includes(caught.code) ? undefined : caught.message,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setErrors({});
        onOpenChange(next);
      }}
      title={user ? `Editar ${user.name}` : 'Novo usuário'}
      description={
        user ? undefined : 'O sistema gera uma senha provisória, trocada no primeiro acesso.'
      }
      size="sm"
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Nome" error={errors.name}>
          {(props) => <Input {...props} name="name" defaultValue={user?.name} required autoFocus />}
        </Field>
        {!user && (
          <Field label="E-mail" error={errors.email}>
            {(props) => <Input {...props} name="email" type="email" autoComplete="off" required />}
          </Field>
        )}
        <Field
          label="Perfil"
          hint="Operadores acompanham tudo, mas não cadastram nem configuram."
          error={errors.role}
        >
          {(props) => (
            <Select {...props} name="role" defaultValue={user?.role ?? 'operator'}>
              <option value="operator">Operador</option>
              <option value="admin">Administrador</option>
            </Select>
          )}
        </Field>
        {errors.form && (
          <p role="alert" className="text-sm text-critical">
            {errors.form}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {user ? 'Salvar' : 'Criar usuário'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type Pending =
  | { kind: 'toggle'; user: UserSummary }
  | { kind: 'reset'; user: UserSummary }
  | { kind: 'delete'; user: UserSummary }
  | null;

export default function UsersPage() {
  usePageTitle('Usuários');
  const users = useUsers();
  const me = useUser();
  const now = useNow();
  const client = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState<TemporaryPasswordResponse | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'toggle') {
        await api.patch(`/users/${pending.user.id}`, { isActive: !pending.user.isActive });
        toast('success', pending.user.isActive ? 'Usuário desativado' : 'Usuário reativado');
      } else if (pending.kind === 'reset') {
        setPassword(
          await api.post<TemporaryPasswordResponse>(`/users/${pending.user.id}/reset-password`),
        );
      } else {
        await api.del(`/users/${pending.user.id}`);
        toast('success', 'Usuário excluído');
      }
      client.invalidateQueries({ queryKey: keys.users });
      setPending(null);
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  };

  const item =
    'flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-ink outline-none data-[highlighted]:bg-panel data-[disabled]:pointer-events-none data-[disabled]:opacity-40';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usuários"
        description="Administradores têm acesso completo; operadores acompanham sem alterar cadastros."
        actions={
          <Button
            variant="primary"
            icon={UserPlus}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Novo usuário
          </Button>
        }
      />
      {users.isError && <ErrorNotice error={users.error} />}
      {users.data && (
        <section className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-[13px] text-ink-2">
              <tr className="border-b border-hairline">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Nome
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Perfil
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Situação
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Último acesso
                </th>
                <th scope="col" className="px-4 py-2.5">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => {
                const self = user.id === me.id;
                return (
                  <tr key={user.id} className="border-b border-hairline last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <span className="block font-medium text-ink">
                        {user.name}
                        {self && (
                          <span className="ml-2 text-[13px] font-normal text-ink-3">(você)</span>
                        )}
                      </span>
                      <span className="text-[13px] text-ink-3">{user.email}</span>
                    </th>
                    <td className="px-4 py-3 text-ink">{ROLE_LABELS[user.role]}</td>
                    <td className="px-4 py-3">
                      <StatusPill
                        look={
                          !user.isActive
                            ? { label: 'Desativado', icon: CirclePause, tone: 'neutral' }
                            : user.mustChangePassword
                              ? {
                                  label: 'Aguardando primeiro acesso',
                                  icon: KeyRound,
                                  tone: 'neutral',
                                }
                              : { label: 'Ativo', icon: CircleCheck, tone: 'good' }
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {user.lastLoginAt ? formatRelative(user.lastLoginAt, now) : 'Nunca entrou'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger
                          aria-label={`Ações para ${user.name}`}
                          className="inline-flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-raised hover:text-ink"
                        >
                          <MoreHorizontal aria-hidden className="size-4" />
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            align="end"
                            sideOffset={4}
                            className="panel z-50 min-w-52 bg-raised p-1"
                          >
                            <DropdownMenu.Item
                              className={item}
                              onSelect={() => {
                                setEditing(user);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil aria-hidden className="size-4 text-ink-2" />
                              Editar nome e perfil
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              className={item}
                              onSelect={() => setPending({ kind: 'reset', user })}
                            >
                              <KeyRound aria-hidden className="size-4 text-ink-2" />
                              Redefinir senha
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              className={item}
                              disabled={self}
                              onSelect={() => setPending({ kind: 'toggle', user })}
                            >
                              <CirclePause aria-hidden className="size-4 text-ink-2" />
                              {user.isActive ? 'Desativar' : 'Reativar'}
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
                            <DropdownMenu.Item
                              className={item}
                              disabled={self}
                              onSelect={() => setPending({ kind: 'delete', user })}
                            >
                              <Trash aria-hidden className="size-4 text-critical" />
                              Excluir
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <UserDialog
        user={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={setPassword}
      />

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.kind === 'delete'
            ? `Excluir ${pending.user.name}?`
            : pending?.kind === 'reset'
              ? `Redefinir a senha de ${pending.user.name}?`
              : pending?.user.isActive
                ? `Desativar ${pending.user.name}?`
                : `Reativar ${pending?.user.name ?? ''}?`
        }
        confirmLabel={
          pending?.kind === 'delete'
            ? 'Excluir'
            : pending?.kind === 'reset'
              ? 'Redefinir senha'
              : pending?.user.isActive
                ? 'Desativar'
                : 'Reativar'
        }
        danger={pending?.kind === 'delete'}
        loading={busy}
        onConfirm={run}
      >
        <p>
          {pending?.kind === 'delete'
            ? 'O usuário perde o acesso na hora. O histórico de auditoria é mantido.'
            : pending?.kind === 'reset'
              ? 'A senha atual deixa de funcionar e a pessoa é desconectada de todos os aparelhos.'
              : pending?.user.isActive
                ? 'A pessoa é desconectada e não consegue mais entrar até ser reativada.'
                : 'A pessoa volta a conseguir entrar com a senha que já tinha.'}
        </p>
      </ConfirmDialog>

      <Dialog
        open={password !== null}
        onOpenChange={(open) => !open && setPassword(null)}
        title="Senha provisória"
        size="sm"
        footer={
          <Button variant="primary" onClick={() => setPassword(null)}>
            Anotei, fechar
          </Button>
        }
      >
        {password && <TemporaryPassword result={password} />}
      </Dialog>
    </div>
  );
}
