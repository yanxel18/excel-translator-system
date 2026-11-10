import { test, expect } from '@playwright/test';

test('API should be running and respond', async ({ request }) => {
  // Test that the API is responding
  const response = await request.get('http://localhost:3000/');
  expect(response.status()).toBe(200);
});

test('File upload requires a valid session and a file', async ({ request }) => {
  const unauthorized = await request.post('http://localhost:3000/upload');
  expect(unauthorized.status()).toBe(401);

  const login = await request.post('http://localhost:3000/auth/login', {
    data: { username: 'user', password: 'password' },
  });
  expect(login.ok()).toBeTruthy();
  const { access_token: token } = await login.json();
  const missingFile = await request.post('http://localhost:3000/upload', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(missingFile.status()).toBe(400);
});
