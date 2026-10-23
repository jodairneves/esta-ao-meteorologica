import type { ComponentType } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouteError } from './route-error';
import { RequireAdmin, RequireSession } from './session';
import { AppShell } from './shell';

/** Pages are split into their own chunks; the router keeps the old page until one loads. */
const page = (load: () => Promise<{ default: ComponentType }>) => () =>
  load().then((module) => ({ Component: module.default }));

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      { path: '/login', lazy: page(() => import('../pages/login')) },
      {
        path: '/trocar-senha',
        lazy: page(() => import('../pages/change-password')),
      },
      {
        element: (
          <RequireSession>
            <AppShell />
          </RequireSession>
        ),
        children: [
          { index: true, lazy: page(() => import('../pages/overview')) },
          { path: 'estacoes/:code', lazy: page(() => import('../pages/station')) },
          { path: 'comparar', lazy: page(() => import('../pages/compare')) },
          { path: 'dispositivos', lazy: page(() => import('../pages/devices')) },
          { path: 'alertas', lazy: page(() => import('../pages/alerts')) },
          { path: 'logs', lazy: page(() => import('../pages/logs')) },
          { path: 'perfil', lazy: page(() => import('../pages/profile')) },
          {
            path: 'admin',
            element: <RequireAdmin />,
            children: [
              { path: 'estacoes', lazy: page(() => import('../pages/admin/stations')) },
              { path: 'estacoes/nova', lazy: page(() => import('../pages/admin/station-new')) },
              { path: 'estacoes/:code', lazy: page(() => import('../pages/admin/station-edit')) },
              { path: 'usuarios', lazy: page(() => import('../pages/admin/users')) },
              { path: 'configuracoes', lazy: page(() => import('../pages/admin/settings')) },
            ],
          },
          { path: '*', lazy: page(() => import('../pages/not-found')) },
        ],
      },
    ],
  },
]);
