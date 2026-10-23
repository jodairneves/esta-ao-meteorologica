import { expect, test } from '@playwright/test';

test('the overview lists the stations and opens one of them', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Mapa das estações' })).toBeVisible();

  const rack = page.getByRole('region', { name: 'Estações', exact: true });
  const first = rack.getByRole('link').first();
  const name = (await first.textContent())?.trim() ?? '';
  await first.click();

  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Valores ao vivo' })).toContainText('Temperatura');
  await expect(page.getByRole('region', { name: 'Estação em 3D' })).toBeVisible();

  const temperature = page
    .getByRole('figure')
    .filter({ hasText: 'Temperatura e ponto de orvalho' });
  await expect(temperature).toBeVisible();
  await temperature.getByRole('button', { name: 'Ver tabela' }).click();
  await expect(temperature.getByRole('table')).toBeVisible();

  await page.getByRole('radio', { name: '7 dias' }).click();
  await expect(page).toHaveURL(/periodo=7d/);
  await expect(
    page.getByText('Cada ponto é a média de 10 minutos', { exact: false }),
  ).toBeVisible();
});

test('the sidebar reaches every monitoring screen', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Principal' });
  const screens: [RegExp, string][] = [
    [/^Comparar estações/, 'Comparar estações'],
    [/^Dispositivos/, 'Dispositivos'],
    [/^Alertas/, 'Alertas'],
    [/^Logs/, 'Logs'],
    [/^Visão geral/, 'Visão geral'],
  ];
  for (const [link, heading] of screens) {
    await nav.getByRole('link', { name: link }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
});
