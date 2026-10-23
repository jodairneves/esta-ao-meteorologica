import './styles.css';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { ApiError } from './api/client';
import { keys } from './api/queries';
import { router } from './app/router';
import { ToastProvider } from './components/ui/toast';
import { ThemeProvider } from './lib/theme';

/**
 * An expired session (401) or a pending password change (403) seen by any request sends the
 * user back through the session guard instead of leaving the screen half broken.
 */
function onApiError(error: unknown) {
  if (!(error instanceof ApiError)) return;
  if (error.status === 401) {
    queryClient.setQueryData(keys.session, null);
  } else if (error.code === 'PASSWORD_CHANGE_REQUIRED') {
    queryClient.invalidateQueries({ queryKey: keys.session });
  }
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
