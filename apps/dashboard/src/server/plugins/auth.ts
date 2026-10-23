import type { Database } from '@wx/db';
import type { FastifyInstance, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import type { SessionUser } from '../../common/api';
import { resolveSession, SESSION_COOKIE, type SessionPolicy } from '../auth/sessions';
import { HttpError } from '../http';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Who may call the route. Default: any signed-in user. */
    auth?: 'public' | 'user' | 'admin';
    /** Reachable while the user still has to replace a temporary password. */
    allowPendingPassword?: boolean;
  }
  interface FastifyRequest {
    user: SessionUser | null;
    sessionId: string | null;
  }
}

export interface AuthPluginOptions {
  db: Database;
  policy: SessionPolicy;
  secureCookie: boolean;
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  options: { secure: boolean; remember: boolean; expiresAt: Date },
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'strict',
    path: '/',
    // Without "remember", a browser-session cookie; the server-side window still applies.
    ...(options.remember ? { expires: options.expiresAt } : {}),
  });
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: 'strict', path: '/' });
}

/** Resolves the session cookie on /api routes and enforces each route's `auth` level. */
export const authPlugin = fp<AuthPluginOptions>(async (app: FastifyInstance, options) => {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/api/')) return;
    const config = request.routeOptions.config;
    const level = config.auth ?? 'user';

    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      const resolved = await resolveSession(options.db, token, options.policy);
      if (resolved) {
        request.user = resolved.user;
        request.sessionId = resolved.sessionId;
      }
    }
    if (level === 'public') return;

    if (!request.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Faça login para continuar');
    if (request.user.mustChangePassword && !config.allowPendingPassword) {
      throw new HttpError(
        403,
        'PASSWORD_CHANGE_REQUIRED',
        'Troque a senha provisória para continuar',
      );
    }
    if (level === 'admin' && request.user.role !== 'admin') {
      throw new HttpError(403, 'FORBIDDEN', 'Acesso restrito a administradores');
    }
  });
});

/** The signed-in user; only call from routes that are not public. */
export function currentUser(request: { user: SessionUser | null }): SessionUser {
  if (!request.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Faça login para continuar');
  return request.user;
}
