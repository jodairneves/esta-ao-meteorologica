import { MapPinOff } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '../components/ui/misc';
import { usePageTitle } from '../lib/page-title';

export default function NotFoundPage() {
  usePageTitle('Página não encontrada');
  return (
    <EmptyState
      icon={MapPinOff}
      title="Página não encontrada"
      className="mt-16"
      action={
        <Link to="/" className="text-sm font-medium text-ink underline underline-offset-4">
          Ir para a visão geral
        </Link>
      }
    >
      O endereço pode ter mudado ou a estação foi excluída.
    </EmptyState>
  );
}
