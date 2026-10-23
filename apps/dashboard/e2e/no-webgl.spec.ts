import { expect, test } from '@playwright/test';

// Runs in the "no-webgl" project: the browser starts with WebGL turned off, like a machine
// without graphics acceleration. Every screen must still open, with a notice in place of the
// map and the 3D views.

test('without WebGL2 the screens open with a notice instead of the map and 3D views', async ({
  page,
}) => {
  await page.goto('/');
  const webgl2 = await page.evaluate(
    () => document.createElement('canvas').getContext('webgl2') !== null,
  );
  expect(webgl2).toBe(false);

  await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
  await expect(page.getByText('Mapa 3D indisponível neste navegador')).toBeVisible();
  // A demo station with history: a real one on the bench may have no temperature for the heatmap.
  const rack = page.getByRole('region', { name: 'Estações', exact: true });
  await rack.getByRole('link', { name: /Sede/ }).first().click();

  await expect(page.getByText('Cena 3D indisponível neste navegador')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Valores ao vivo' })).toContainText('Temperatura');
  const heatmap = page.getByRole('figure').filter({ hasText: 'Mapa de calor' });
  await expect(heatmap.getByRole('radio', { name: 'Plano' })).toHaveCount(0);
  await expect(heatmap.getByRole('img')).toBeVisible();

  await page.goto('/admin/estacoes/nova');
  await expect(page.getByText('Mapa indisponível neste navegador')).toBeVisible();
  await expect(page.getByLabel('Latitude')).toBeEditable();
});
