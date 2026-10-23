import { createHash, randomBytes } from 'node:crypto';
import { and, type Database, eq, gt, lt, ne, sessions, users } from '@wx/db';
import type { SessionUser } from '../../common/api';

export const SESSION_COOKIE = 'wx_session';

/** Sliding expiration is only written back after this long, to avoid a write per request. */
const TOUCH_AFTER_MS = 5 * 60_000;

export interface SessionPolicy {
  ttlMs: number;
  rememberMs: number;
}

export interface ResolvedSession {
  sessionId: string;
  remember: boolean;
  expiresAt: Date;
  user: SessionUser;
}

/** The database only stores the SHA-256 of the token: a leaked table cannot be replayed. */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const windowMs = (remember: boolean, policy: SessionPolicy) =>
  remember ? policy.rememberMs : policy.ttlMs;

export async function createSession(
  db: Database,
  input: { userId: string; remember: boolean; ip: string | null; userAgent: string | null },
  policy: SessionPolicy,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + windowMs(input.remember, policy));
  await db.insert(sessions).values({
    id: hashToken(token),
    userId: input.userId,
    remember: input.remember,
    expiresAt,
    ip: input.ip,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

/** Valid session of an active user, extending its sliding expiration. */
export async function resolveSession(
  db: Database,
  token: string,
  policy: SessionPolicy,
): Promise<ResolvedSession | null> {
  const id = hashToken(token);
  const now = new Date();
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now), eq(users.isActive, true)));
  if (!row) return null;

  let expiresAt = row.session.expiresAt;
  if (now.getTime() - row.session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
    expiresAt = new Date(now.getTime() + windowMs(row.session.remember, policy));
    await db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, id));
  }

  return {
    sessionId: id,
    remember: row.session.remember,
    expiresAt,
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      role: row.user.role,
      mustChangePassword: row.user.mustChangePassword,
    },
  };
}

export async function revokeSession(db: Database, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Ends every session of a user, optionally keeping the one making the request. */
export async function revokeUserSessions(
  db: Database,
  userId: string,
  keepSessionId?: string,
): Promise<void> {
  await db
    .delete(sessions)
    .where(
      and(eq(sessions.userId, userId), keepSessionId ? ne(sessions.id, keepSessionId) : undefined),
    );
}

export async function deleteExpiredSessions(db: Database): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return deleted.length;
}
