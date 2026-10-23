import { useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { SessionUser } from '../../common/api';
import { ApiError, api } from '../api/client';
import { keys } from '../api/queries';
import { Button } from './ui/button';
import { Field } from './ui/field';
import { PasswordInput } from './ui/password-input';

/** Change own password: used for the mandatory first change and on the profile screen. */
export function PasswordForm({
  currentLabel,
  onDone,
}: {
  currentLabel: string;
  onDone: () => void;
}) {
  const client = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    const confirmation = String(form.get('confirmation') ?? '');
    if (newPassword !== confirmation) {
      setErrors({ confirmation: 'A confirmação é diferente da nova senha' });
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      const { user } = await api.post<{ user: SessionUser }>('/auth/password', {
        currentPassword,
        newPassword,
      });
      formElement.reset();
      // Before the session update, so screens reacting to it already know the change is done.
      onDone();
      client.setQueryData(keys.session, user);
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = caught.fieldErrors;
        setErrors({
          currentPassword:
            caught.code === 'WRONG_PASSWORD' ? caught.message : fields.currentPassword?.[0],
          newPassword:
            fields.newPassword?.[0] ?? (caught.code === 'BAD_REQUEST' ? caught.message : undefined),
          form: ['WRONG_PASSWORD', 'BAD_REQUEST', 'VALIDATION'].includes(caught.code)
            ? undefined
            : caught.message,
        });
      } else {
        setErrors({ form: 'Não foi possível trocar a senha. Tente de novo.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label={currentLabel} error={errors.currentPassword}>
        {(props) => (
          <PasswordInput
            {...props}
            name="currentPassword"
            autoComplete="current-password"
            required
          />
        )}
      </Field>
      <Field
        label="Nova senha"
        hint="Pelo menos 10 caracteres. Uma frase curta é mais fácil de lembrar e difícil de adivinhar."
        error={errors.newPassword}
      >
        {(props) => (
          <PasswordInput {...props} name="newPassword" autoComplete="new-password" required />
        )}
      </Field>
      <Field label="Repita a nova senha" error={errors.confirmation}>
        {(props) => (
          <PasswordInput {...props} name="confirmation" autoComplete="new-password" required />
        )}
      </Field>
      {errors.form && (
        <p role="alert" className="text-sm text-critical">
          {errors.form}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        icon={KeyRound}
        loading={submitting}
        className="self-start"
      >
        Trocar senha
      </Button>
    </form>
  );
}
