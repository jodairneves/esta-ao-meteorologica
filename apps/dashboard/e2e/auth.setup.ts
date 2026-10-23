import { expect, test as setup } from '@playwright/test';
import { ADMIN_STATE } from '../playwright.config';
import { ADMIN, signIn } from './helpers';

setup('admin signs in once for the other tests', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, ADMIN.email, ADMIN.password);
  await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
  await page.context().storageState({ path: ADMIN_STATE });
});
