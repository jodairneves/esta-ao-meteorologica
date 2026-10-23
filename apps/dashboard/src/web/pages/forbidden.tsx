import { Lock } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '../components/ui/misc';
import { usePageTitle } from '../lib/page-title';

/** Admin screens opened by an operator (link shared, old bookmark). */
export function ForbiddenPage() {
  usePageTitle('Acesso restrito');
  return (
    <EmptyState
      icon={Lock}
      title="Acesso restrito a administradores"
      className="mt-16"
      action={
        <Link to="/" className="text-sm font-medium text-ink underline underline-offset-4">
          Ir para a visão geral
        </Link>
      }
    >
      Seu perfil é de operador: você acompanha estações, gráficos, alertas e logs, mas cadastros e
      configurações ficam com os administradores.
    </EmptyState>
  );
}
