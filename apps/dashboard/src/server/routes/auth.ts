import { eq, users } from '@wx/db';
import type { FastifyInstance } from 'fastify';
import { changePasswordBodySchema, loginBodySchema, type SessionUser } from '../../common/api';
import {
  hashPassword,
  passwordProblem,
  verifyAgainstDummy,
  verifyPassword,
} from '../auth/passwords';
import { createSession, revokeSession, revokeUserSessions } from '../auth/sessions';
import type { AppDeps } from '../context';
import { badRequest, HttpError, parseInput } from '../http';
import { clearSessionCookie, currentUser, setSessionCookie } from '../plugins/auth';
import { audit } from '../services/audit';

const MAX_FAILED_LOGINS = 10;
const LOCK_MS = 15 * 60_000;

const invalidCredentials = () =>
  new HttpError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos');

function toSessionUser(row: typeof users.$inferSelect): SessionUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
  };
}

const emailOf = (body: unknown) =>
  typeof body === 'object' && body !== null && 'email' in body
    ? String((body as { email: unknown }).email)
        .toLowerCase()
        .slice(0, 200)
    : '';

export async function authRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { db, config } = deps;
  const policy = { ttlMs: config.session.ttlMs, rememberMs: config.session.rememberMs };
  const secure = config.session.secureCookie;

  app.post(
    '/auth/login',
    {
      config: {
        auth: 'public',
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (request) => `${request.ip}|${emailOf(request.body)}`,
        },
      },
    },
    async (request, reply) => {
      const body = parseInput(loginBodySchema, request.body);
      const [user] = await db.select().from(users).where(eq(users.email, body.email));
      const now = new Date();

      if (!user?.isActive) {
        await verifyAgainstDummy(body.password);
        await audit(db, {
          userId: null,
          category: 'auth',
          level: 'warn',
          code: 'LOGIN_FAILED',
          message: `Tentativa de login com e-mail não cadastrado ou inativo: ${body.email}`,
          details: { ip: request.ip },
        });
        throw invalidCredentials();
      }
      if (user.lockedUntil && user.lockedUntil > now) {
        throw new HttpError(
          429,
          'ACCOUNT_LOCKED',
          'Muitas tentativas sem sucesso. Tente novamente em alguns minutos.',
        );
      }
      if (!(await verifyPassword(user.passwordHash, body.password))) {
        const failed = user.failedLogins + 1;
        const lock = failed >= MAX_FAILED_LOGINS;
        await db
          .update(users)
          .set({
            failedLogins: lock ? 0 : failed,
            lockedUntil: lock ? new Date(now.getTime() + LOCK_MS) : user.lockedUntil,
          })
          .where(eq(users.id, user.id));
        await audit(db, {
          userId: user.id,
          category: 'auth',
          level: 'warn',
          code: lock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
          message: lock
            ? `Conta ${user.email} bloqueada por 15 minutos após ${MAX_FAILED_LOGINS} senhas incorretas`
            : `Senha incorreta para ${user.email}`,
          details: { ip: request.ip },
        });
        throw invalidCredentials();
      }

      await db
        .update(users)
        .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now })
        .where(eq(users.id, user.id));
      const session = await createSession(
        db,
        {
          userId: user.id,
          remember: body.remember,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
        policy,
      );
      setSessionCookie(reply, session.token, {
        secure,
        remember: body.remember,
        expiresAt: session.expiresAt,
      });
      await audit(db, {
        userId: user.id,
        category: 'auth',
        code: 'LOGIN',
        message: `${user.email} entrou no sistema`,
        details: { ip: request.ip },
      });
      return { user: toSessionUser(user) };
    },
  );

  app.post('/auth/logout', { config: { auth: 'public' } }, async (request, reply) => {
    if (request.sessionId) await revokeSession(db, request.sessionId);
    clearSessionCookie(reply, secure);
    return reply.code(204).send();
  });

  app.get('/auth/me', { config: { allowPendingPassword: true } }, async (request) => ({
    user: currentUser(request),
  }));

  app.post('/auth/password', { config: { allowPendingPassword: true } }, async (request) => {
    const body = parseInput(changePasswordBodySchema, request.body);
    const user = currentUser(request);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    if (!row || !(await verifyPassword(row.passwordHash, body.currentPassword))) {
      throw new HttpError(400, 'WRONG_PASSWORD', 'Senha atual incorreta');
    }
    if (body.newPassword === body.currentPassword) {
      throw badRequest('A nova senha precisa ser diferente da atual');
    }
    const problem = passwordProblem(body.newPassword, user.email);
    if (problem) throw badRequest(problem);

    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(body.newPassword),
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    // Other devices signed in with the old password are signed out.
    await revokeUserSessions(db, user.id, request.sessionId ?? undefined);
    await audit(db, {
      userId: user.id,
      category: 'auth',
      code: 'PASSWORD_CHANGED',
      message: `${user.email} trocou a senha`,
    });
    return { user: { ...user, mustChangePassword: false } };
  });
}
