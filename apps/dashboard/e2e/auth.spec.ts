import { expect, test } from '@playwright/test';
import { ADMIN, SIGNED_OUT, signIn } from './helpers';

test.use({ storageState: SIGNED_OUT });

test('a signed-out visitor is sent to the login page', async ({ page }) => {
  await page.goto('/estacoes/sede');
  await expect(page).toHaveURL(/\/login\?next=%2Festacoes%2Fsede$/);
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('a wrong password is refused with a clear message', async ({ page }) => {
  await page.goto('/login');
  // An unknown address gets the same answer, and keeps the admin's login attempts (5 per
  // minute) for the other tests.
  await signIn(page, 'ninguem@e2e.local', 'senha-errada-de-proposito');
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha inválidos');
  await expect(page).toHaveURL(/\/login$/);
});

test('signing in returns to the requested page, and signing out ends the session', async ({
  page,
}) => {
  await page.goto('/comparar');
  await signIn(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/comparar$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Comparar estações' })).toBeVisible();

  await page.getByRole('button', { name: /^Menu da conta/ }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});
