import { and, asc, count, type Database, eq, ne, users } from '@wx/db';
import type { z } from 'zod';
import type {
  createUserBodySchema,
  SessionUser,
  TemporaryPasswordResponse,
  UserSummary,
  updateUserBodySchema,
} from '../../common/api';
import { hashPassword, temporaryPassword } from '../auth/passwords';
import { revokeUserSessions } from '../auth/sessions';
import { conflict, forbidden, notFound } from '../http';
import { audit } from './audit';
import { iso } from './station-views';

type UserRow = typeof users.$inferSelect;

function toSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    lastLoginAt: iso(row.lastLoginAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listUsers(db: Database): Promise<UserSummary[]> {
  const rows = await db.select().from(users).orderBy(asc(users.name));
  return rows.map(toSummary);
}

async function getUser(db: Database, id: string): Promise<UserRow> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  if (!row) throw notFound('Usuário não encontrado');
  return row;
}

/** True when `userId` is the only active administrator. */
async function isLastActiveAdmin(db: Database, userId: string): Promise<boolean> {
  const [others] = await db
    .select({ total: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.isActive, true), ne(users.id, userId)));
  return (others?.total ?? 0) === 0;
}

export async function createUser(
  db: Database,
  input: z.output<typeof createUserBodySchema>,
  actor: SessionUser,
): Promise<TemporaryPasswordResponse> {
  const password = temporaryPassword();
  const [row] = await db
    .insert(users)
    .values({
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      createdBy: actor.id,
    })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (!row) throw conflict('Já existe um usuário com este e-mail', 'EMAIL_TAKEN');

  await audit(db, {
    userId: actor.id,
    code: 'USER_CREATED',
    message: `Usuário ${row.email} criado como ${row.role === 'admin' ? 'administrador' : 'operador'}`,
    details: { userId: row.id },
  });
  return { user: toSummary(row), temporaryPassword: password };
}

export async function updateUser(
  db: Database,
  id: string,
  input: z.output<typeof updateUserBodySchema>,
  actor: SessionUser,
): Promise<UserSummary> {
  const current = await getUser(db, id);
  const demoting = input.role === 'operator' && current.role === 'admin';
  const deactivating = input.isActive === false && current.isActive;

  if (id === actor.id && (demoting || deactivating)) {
    throw forbidden('Você não pode remover o próprio acesso de administrador');
  }
  if (current.role === 'admin' && (demoting || deactivating) && (await isLastActiveAdmin(db, id))) {
    throw conflict('É preciso manter pelo menos um administrador ativo', 'LAST_ADMIN');
  }

  const [row] = await db
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  if (!row) throw notFound('Usuário não encontrado');
  if (deactivating) await revokeUserSessions(db, id);

  await audit(db, {
    userId: actor.id,
    code: 'USER_UPDATED',
    message: `Usuário ${row.email} atualizado`,
    details: { userId: id, changes: input },
  });
  return toSummary(row);
}

export async function resetPassword(
  db: Database,
  id: string,
  actor: SessionUser,
): Promise<TemporaryPasswordResponse> {
  await getUser(db, id);
  const password = temporaryPassword();
  const [row] = await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      failedLogins: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();
  if (!row) throw notFound('Usuário não encontrado');
  await revokeUserSessions(db, id);

  await audit(db, {
    userId: actor.id,
    code: 'PASSWORD_RESET',
    message: `Senha provisória gerada para ${row.email}`,
    details: { userId: id },
  });
  return { user: toSummary(row), temporaryPassword: password };
}

export async function deleteUser(db: Database, id: string, actor: SessionUser): Promise<void> {
  if (id === actor.id) throw forbidden('Você não pode excluir o próprio usuário');
  const current = await getUser(db, id);
  if (current.role === 'admin' && current.isActive && (await isLastActiveAdmin(db, id))) {
    throw conflict('É preciso manter pelo menos um administrador ativo', 'LAST_ADMIN');
  }
  await db.delete(users).where(eq(users.id, id));
  await audit(db, {
    userId: actor.id,
    level: 'warn',
    code: 'USER_DELETED',
    message: `Usuário ${current.email} excluído`,
    details: { userId: id, email: current.email },
  });
}
