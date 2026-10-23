import type { Page } from '@playwright/test';

export const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? 'admin@estacao.local',
  password: process.env.ADMIN_PASSWORD ?? 'troque-esta-senha',
};

export const SIGNED_OUT = { cookies: [], origins: [] };

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Short random suffix so repeated runs never collide. */
export const unique = (): string => Math.random().toString(36).slice(2, 8);
