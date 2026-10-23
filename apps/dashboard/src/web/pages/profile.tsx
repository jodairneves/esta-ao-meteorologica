import { useUser } from '../app/session';
import { PasswordForm } from '../components/password-form';
import { PageHeader } from '../components/ui/misc';
import { useToast } from '../components/ui/toast';
import { usePageTitle } from '../lib/page-title';

export default function ProfilePage() {
  usePageTitle('Meu perfil');
  const user = useUser();
  const toast = useToast();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="Meu perfil" />
      <section className="panel px-5 py-5">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[140px_1fr]">
          <dt className="text-ink-3">Nome</dt>
          <dd className="text-ink">{user.name}</dd>
          <dt className="text-ink-3">E-mail</dt>
          <dd className="text-ink">{user.email}</dd>
          <dt className="text-ink-3">Perfil</dt>
          <dd className="text-ink">
            {user.role === 'admin'
              ? 'Administrador: acesso completo, inclusive cadastros e configurações'
              : 'Operador: acompanha estações, gráficos, alertas e logs'}
          </dd>
        </dl>
      </section>
      <section className="panel px-5 py-5">
        <h2 className="heading mb-1 text-base">Trocar senha</h2>
        <p className="mb-5 text-sm text-ink-2">
          Ao trocar a senha, os outros aparelhos conectados com a sua conta são desconectados.
        </p>
        <PasswordForm currentLabel="Senha atual" onDone={() => toast('success', 'Senha trocada')} />
      </section>
    </div>
  );
}
