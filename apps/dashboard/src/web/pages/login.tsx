import { useQueryClient } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { SessionUser } from '../../common/api';
import { ApiError, api } from '../api/client';
import { keys } from '../api/queries';
import { BrandMark } from '../app/brand';
import { RedirectIfSignedIn } from '../app/session';
import { Button } from '../components/ui/button';
import { Checkbox, Field, Input } from '../components/ui/field';
import { PasswordInput } from '../components/ui/password-input';
import { usePageTitle } from '../lib/page-title';

function LoginForm() {
  usePageTitle('Entrar');
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const { user } = await api.post<{ user: SessionUser }>('/auth/login', {
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        remember: form.get('remember') === 'on',
      });
      // The session guard takes over: it opens the requested page or the password change.
      client.setQueryData(keys.session, user);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldErrors(caught.fieldErrors);
        if (caught.code !== 'VALIDATION') setError(caught.message);
      } else {
        setError('Não foi possível entrar. Tente de novo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark className="size-10 text-ink" />
          <div>
            <h1 className="heading text-xl leading-tight">Estação Meteorológica</h1>
            <p className="text-sm text-ink-2">Monitoramento das estações em campo</p>
          </div>
        </div>

        <form onSubmit={submit} noValidate className="panel flex flex-col gap-4 px-5 py-6">
          <Field label="E-mail" error={fieldErrors.email}>
            {(props) => (
              <Input
                {...props}
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
              />
            )}
          </Field>
          <Field label="Senha" error={fieldErrors.password}>
            {(props) => (
              <PasswordInput {...props} name="password" autoComplete="current-password" required />
            )}
          </Field>
          <Checkbox name="remember" label="Manter conectado neste aparelho" />
          {error && (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            icon={LogIn}
            loading={submitting}
            className="mt-1 w-full"
          >
            Entrar
          </Button>
        </form>
        <p className="mt-4 text-center text-[13px] text-ink-3">
          Esqueceu a senha? Peça a um administrador para redefini-la.
        </p>
      </div>
    </div>
  );
}

/** Signed-in visitors skip the form and go where they were heading. */
export default function LoginPage() {
  return (
    <RedirectIfSignedIn>
      <LoginForm />
    </RedirectIfSignedIn>
  );
}
