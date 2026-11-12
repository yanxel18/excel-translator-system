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
        : ['/jobs/history', '/history', '/notifications', '/changelog'].includes(path)
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
  await page.getByRole('button', { name: 'Open notifications' }).click();
  await expect(page.getByText('No notifications yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Profile' }).click();
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Changelog' }).click();
  await expect(page.getByRole('heading', { name: 'Changelog' })).toBeVisible();

  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await page.getByRole('textbox', { name: 'Language' }).click();
  await page.getByRole('option').nth(1).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ホーム' })).toBeVisible();
});


test('administrator settings preserve list state and support management actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('excel-translator-token', 'ui-test-token'));
  const base = { id: '11111111-1111-1111-1111-111111111111', code: 'JTY', name: 'JTY' };
  const user = { id: '22222222-2222-2222-2222-222222222222', gid: 'G123', username: 'alice', email: 'alice@example.com', baseId: null, base: null, enabled: true };
  const writes: string[] = [];
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(apiBaseUrl).pathname, '');
    const method = route.request().method();
    if (method !== 'GET') writes.push(`${method} ${path}`);
    const body = path === '/profile' ? { id: 'admin', username: 'admin', isAdmin: true }
      : path === '/admin/bases' && method === 'GET' ? { data: [base], total: 1, page: 1, pageSize: 50 }
      : path === '/admin/users' && method === 'GET' ? { data: [user], total: 1, page: 1, pageSize: 10 }
      : path.startsWith('/admin/') ? base
      : path === '/notifications/unread-count' ? { count: 0 }
      : ['/jobs/history', '/history', '/notifications', '/changelog'].includes(path) ? { data: [], total: 0 }
      : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${webBasePath}settings/users?pageSize=20`);
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search' }).fill('alice');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=alice/);
  await page.getByRole('textbox', { name: 'Enabled' }).click();
  await page.getByRole('option', { name: 'Yes' }).click();
  await expect(page).toHaveURL(/enabled=true/);
  await page.getByRole('button', { name: /Username/ }).click();
  await expect(page).toHaveURL(/sort=username/);
  await page.goBack();
  await expect(page).not.toHaveURL(/sort=username/);
  await page.goForward();
  await expect(page).toHaveURL(/sort=username/);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Search' })).toHaveValue('alice');
  await expect(page.getByText('Results: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Assign base' }).click();
  const assignDialog = page.getByRole('dialog');
  await assignDialog.getByLabel('Base').click();
  await page.getByRole('option', { name: /JTY/ }).click();
  await assignDialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Base reassigned.')).toBeVisible();
  expect(writes).toContain(`PATCH /admin/users/${user.id}/base`);
  await page.getByRole('button', { name: 'Create user' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('GID').fill('G123');
  await dialog.getByLabel('Username').fill('alice');
  await dialog.getByLabel('Email').fill('alice@example.com');
  await dialog.getByLabel('Base').click();
  await page.getByRole('option', { name: /JTY/ }).click();
  await dialog.getByLabel('Password').fill('twelvecharacters');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('User created.')).toBeVisible();
  expect(writes).toContain('POST /admin/users');
  await page.getByRole('button', { name: 'Bases', exact: true }).click();
  await expect(page).toHaveURL(/settings\/bases/);
  await page.getByRole('button', { name: 'Create base' }).click();
  await dialog.getByLabel('Code').fill('NEW');
  await dialog.getByLabel('Name').fill('New base');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Base saved.')).toBeVisible();
  expect(writes).toContain('POST /admin/bases');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByLabel('Name').fill('Edited base');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => writes.some((entry) => entry.startsWith('PATCH /admin/bases/'))).toBe(true);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Base deleted.')).toBeVisible();
  expect(writes.some((entry) => entry.startsWith('DELETE /admin/bases/'))).toBe(true);
});


test('unknown routes offer a real Workspace path and settings deny normal users', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('excel-translator-token', 'ui-test-token'));
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(new URL(apiBaseUrl).pathname, '');
    const body = path === '/profile' ? { id: 'user', username: 'user', isAdmin: false }
      : path === '/notifications/unread-count' ? { count: 0 } : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${webBasePath}unknown-destination`);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to Workspace' }).click();
  await expect(page).toHaveURL(new RegExp(`${webBasePath}workspace$`));
  await expect(page.getByRole('heading', { name: 'Translate a workbook' })).toBeVisible();
  await page.goto(`${webBasePath}settings/users`);
  await expect(page.getByText('Administrator access is required.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System Settings' })).toHaveCount(0);
});
