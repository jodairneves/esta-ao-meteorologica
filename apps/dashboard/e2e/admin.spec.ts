import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from '../playwright.config';
import { SIGNED_OUT, signIn, unique } from './helpers';

// The steps build on each other: register, check, delete; create an operator, use it.
test.describe.configure({ mode: 'serial' });

const suffix = unique();
const code = `e2e-${suffix}`;
const stationName = `Teste E2E ${suffix}`;
const operator = { email: `operador-${suffix}@e2e.local`, password: '' };

test.afterAll(async ({ playwright, baseURL }) => {
  // Leaves nothing behind even if a step failed halfway.
  const api = await playwright.request.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { 'x-wx-request': '1', origin: baseURL ?? '' },
  });
  await api.delete(`/api/v1/stations/${code}`, { data: { confirmCode: code } });
  const users = (await (await api.get('/api/v1/users')).json()) as { id: string; email: string }[];
  for (const user of users.filter((item) => item.email === operator.email)) {
    await api.delete(`/api/v1/users/${user.id}`);
  }
  await api.dispose();
});

test('an admin registers a station and receives its MQTT credentials once', async ({ page }) => {
  await page.goto('/admin/estacoes/nova');
  await page.getByLabel('Nome').fill(stationName);
  await page.getByLabel('Código (usado no MQTT)').fill(code);
  await page.getByLabel('Latitude').fill('-22,70');
  await page.getByLabel('Longitude').fill('-47,62');
  await page.getByRole('button', { name: 'Cadastrar estação' }).click();

  const dialog = page.getByRole('dialog', { name: `${stationName} cadastrada` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Senha', { exact: true })).toBeVisible();
  await expect(dialog.getByText(code, { exact: true }).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Anotei, continuar' }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/estacoes/${code}$`));
  await expect(page.getByRole('heading', { level: 1, name: stationName })).toBeVisible();
});

test('the new station is listed and can be deleted after typing its code', async ({ page }) => {
  await page.goto('/admin/estacoes');
  await expect(page.getByRole('row', { name: new RegExp(stationName) })).toBeVisible();

  await page.goto(`/admin/estacoes/${code}?aba=remover`);
  await page.getByRole('button', { name: 'Excluir estação' }).click();
  const dialog = page.getByRole('dialog', { name: `Excluir ${stationName}?` });
  const confirm = dialog.getByRole('button', { name: 'Excluir para sempre' });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('textbox').fill(code);
  await confirm.click();

  await expect(page).toHaveURL(/\/admin\/estacoes$/);
  await expect(page.getByRole('row', { name: new RegExp(stationName) })).toHaveCount(0);
});

test('an admin creates an operator with a temporary password', async ({ page }) => {
  await page.goto('/admin/usuarios');
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo usuário' });
  await dialog.getByLabel('Nome').fill('Operador de Teste');
  await dialog.getByLabel('E-mail').fill(operator.email);
  await dialog.getByLabel('Perfil').selectOption('operator');
  await dialog.getByRole('button', { name: 'Criar usuário' }).click();

  const shown = page.getByRole('dialog', { name: 'Senha provisória' });
  await expect(shown).toBeVisible();
  operator.password = (await shown.getByTestId('temporary-password').textContent())?.trim() ?? '';
  expect(operator.password.length).toBeGreaterThanOrEqual(12);
  await shown.getByRole('button', { name: 'Anotei, fechar' }).click();
  await expect(page.getByRole('row', { name: new RegExp(operator.email) })).toBeVisible();
});

test('the operator must change the password and cannot reach administration', async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  await page.goto('/login');
  await signIn(page, operator.email, operator.password);

  await expect(page).toHaveURL(/\/trocar-senha$/);
  await page.getByLabel('Senha provisória').fill(operator.password);
  await page.getByLabel('Nova senha', { exact: true }).fill('chuva-de-granizo-42');
  await page.getByLabel('Repita a nova senha').fill('chuva-de-granizo-42');
  await page.getByRole('button', { name: 'Trocar senha' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Principal' });
  await expect(nav.getByText('Administração')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Nova estação' })).toHaveCount(0);

  await page.goto('/admin/usuarios');
  await expect(
    page.getByRole('heading', { name: 'Acesso restrito a administradores' }),
  ).toBeVisible();
  const response = await page.request.get('/api/v1/users');
  expect(response.status()).toBe(403);
  await context.close();
});
