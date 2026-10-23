import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '../api/queries';
import { BrandMark } from '../app/brand';
import { loginPath } from '../app/session';
import { PasswordForm } from '../components/password-form';
import { usePageTitle } from '../lib/page-title';

/** Mandatory first change of a temporary password (new users and password resets). */
export default function ChangePasswordPage() {
  usePageTitle('Trocar senha');
  const session = useSession();
  const location = useLocation();
  // Once the new password is saved the session no longer needs this page: go to the start.
  const [changed, setChanged] = useState(false);

  if (session.isPending) return null;
  if (!session.data) return <Navigate to={loginPath(location.pathname, location.search)} replace />;
  if (!session.data.mustChangePassword) {
    return <Navigate to={changed ? '/' : '/perfil'} replace />;
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <BrandMark className="mb-6 size-10 text-ink" />
        <h1 className="heading text-xl">Crie sua senha</h1>
        <p className="mt-1 mb-6 text-sm text-ink-2">
          Olá, {session.data.name.split(' ')[0]}. Você entrou com uma senha provisória; troque-a
          para continuar.
        </p>
        <div className="panel px-5 py-6">
          <PasswordForm currentLabel="Senha provisória" onDone={() => setChanged(true)} />
        </div>
      </div>
    </div>
  );
}
