import { ROLES, type Role } from '@wx/shared';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  inet,
  integer,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, oneOf, timestamptz, updatedAt } from './helpers';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').$type<Role>().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: timestamptz('locked_until'),
    lastLoginAt: timestamptz('last_login_at'),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('users_role_check', oneOf(t.role, ROLES)),
    check('users_email_lowercase_check', sql`${t.email} = lower(${t.email})`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the session token; the token itself only exists in the cookie. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
    expiresAt: timestamptz('expires_at').notNull(),
    /** "Keep me signed in": the sliding window is days instead of hours. */
    remember: boolean('remember').notNull().default(false),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);
