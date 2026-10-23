import { createContext, type ReactNode, useContext } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { SessionUser } from '../../common/api';
import { useSession } from '../api/queries';
import { ErrorNotice } from '../components/ui/misc';
import { ForbiddenPage } from '../pages/forbidden';
import { BrandMark } from './brand';

const UserContext = createContext<SessionUser | null>(null);

/** The signed-in user; only valid below `RequireSession`. */
export function useUser(): SessionUser {
  const user = useContext(UserContext);
  if (!user) throw new Error('useUser fora de RequireSession');
  return user;
}

export const useIsAdmin = () => useUser().role === 'admin';

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <BrandMark className="size-10 animate-pulse text-ink-3" />
    </div>
  );
}

/** Where to return after logging in: the page the user was trying to open. */
export function loginPath(pathname: string, search: string): string {
  const next = `${pathname}${search}`;
  return next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
}

/** Gate for the signed-in area: login first, then the mandatory password change. */
export function RequireSession({ children }: { children?: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <Splash />;
  if (session.isError) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <ErrorNotice error={session.error} />
      </div>
    );
  }
  const user = session.data;
  if (!user) return <Navigate to={loginPath(location.pathname, location.search)} replace />;
  if (user.mustChangePassword) return <Navigate to="/trocar-senha" replace />;
  return <UserContext value={user}>{children ?? <Outlet />}</UserContext>;
}

/** Admin-only screens; operators see a plain "restricted" page instead of a redirect. */
export function RequireAdmin() {
  return useIsAdmin() ? <Outlet /> : <ForbiddenPage />;
}

/** Signed-in users skip the login page. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <Splash />;
  if (session.data) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next?.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }
  return children;
}
