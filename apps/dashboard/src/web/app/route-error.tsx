import { RefreshCw } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '../components/ui/button';

/**
 * Last line of defence: a page that failed to render or to load (usually a new deploy that
 * replaced the chunk files) offers a reload instead of a blank screen.
 */
export function RouteError() {
  const error = useRouteError();
  const chunkFailed =
    error instanceof TypeError &&
    /dynamically imported module|Importing a module script/i.test(error.message);
  const message = chunkFailed
    ? 'O sistema foi atualizado. Recarregue a página para continuar.'
    : isRouteErrorResponse(error)
      ? `Erro ${error.status}: ${error.statusText}`
      : 'Algo deu errado ao mostrar esta tela. Recarregue a página; se o problema continuar, avise o administrador.';

  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="panel max-w-md px-6 py-8 text-center">
        <h1 className="heading text-xl">Não foi possível abrir esta tela</h1>
        <p className="mt-2 text-sm text-ink-2">{message}</p>
        {import.meta.env.DEV && error instanceof Error && (
          <pre className="dense mt-4 overflow-auto rounded-md bg-sunken p-3 text-left text-xs text-ink-3">
            {error.stack}
          </pre>
        )}
        <Button
          variant="primary"
          icon={RefreshCw}
          className="mt-6"
          onClick={() => window.location.reload()}
        >
          Recarregar
        </Button>
      </div>
    </div>
  );
}
