import { count, type Database, users } from '@wx/db';
import type { DashboardConfig } from '../config';
import type { Logger } from '../logger';
import { audit } from '../services/audit';
import { hashPassword } from './passwords';

/**
 * Creates the first administrator from ADMIN_EMAIL/ADMIN_PASSWORD while there are no users.
 * Once anyone exists the variables are ignored, so they can stay in the environment.
 */
export async function ensureFirstAdmin(
  db: Database,
  config: DashboardConfig,
  logger: Logger,
): Promise<void> {
  const [row] = await db.select({ total: count() }).from(users);
  if ((row?.total ?? 0) > 0) return;

  if (!config.firstAdmin) {
    logger.warn('no users yet and ADMIN_EMAIL/ADMIN_PASSWORD are not set: nobody can sign in');
    return;
  }

  const { email, password, name } = config.firstAdmin;
  const [admin] = await db
    .insert(users)
    .values({ email, name, role: 'admin', passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (!admin) return;

  logger.info({ email }, 'first administrator created');
  await audit(db, {
    userId: admin.id,
    code: 'USER_CREATED',
    message: `Administrador inicial criado (${email})`,
  });
}
