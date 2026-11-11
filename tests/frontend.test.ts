import { test, expect } from '@playwright/test';
import { normalizeApiBaseUrl, normalizeWebBasePath } from '../project/apps/web/src/config/paths';

const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000/excel-convert';
const webBasePath = process.env.WEB_BASE_PATH || '/excel-convert/';

test('frontend base-path settings normalize URLs for local and nested deployments', () => {
  expect(normalizeWebBasePath('/excel-convert')).toBe('/excel-convert/');
  expect(normalizeWebBasePath('/')).toBe('/');
  expect(normalizeApiBaseUrl('https://api.example.com/excel-convert/')).toBe('https://api.example.com/excel-convert');
});

test('workspace navigation, preferences, and Japanese localization work on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(apiBaseUrl).pathname, '');
    const body = path === '/auth/login'
      ? { access_token: 'ui-test-token' }
      : path === '/profile'
        ? { id: 'user-1', username: 'ui-test', email: null, fullName: null, createdAt: '2026-01-01T00:00:00.000Z' }
        : ['/jobs/history', '/notifications', '/changelog'].includes(path)
          ? { data: [], nextCursor: null }
          : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto(webBasePath);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Translate a workbook' })).toBeVisible();

  const navigate = async (name: string) => {
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await page.getByText(name, { exact: true }).click();
  };
  await navigate('History');
  await expect(page.getByRole('heading', { name: 'Translation history' })).toBeVisible();
  await navigate('Vocabulary');
  await expect(page.getByRole('heading', { name: 'Vocabulary' })).toBeVisible();
  await navigate('Notifications');
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await navigate('Profile');
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await navigate('Changelog');
  await expect(page.getByRole('heading', { name: 'Changelog' })).toBeVisible();

  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Language' }).click();
  await page.getByRole('option', { name: '日本語' }).click();
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(page.getByRole('heading', { name: '更新履歴' })).toBeVisible();
  await expect(page.getByText('Sheetlingはワークブックの内容をセッション内で安全に保管します。')).toBeVisible();
  await expect(page.getByRole('button', { name: 'テーマを切り替える' })).toBeVisible();
  const themeToggle = page.getByRole('button', { name: 'テーマを切り替える' });
  const schemeBefore = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  await themeToggle.click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).not.toBe(schemeBefore);

});
