import { test, expect } from "@playwright/test";

const apiBaseUrl =
  process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const authUsername = process.env.TEST_AUTH_USERNAME || "user";
const authPassword = process.env.TEST_AUTH_PASSWORD || "password";

test("API should be running and respond", async ({ request }) => {
  const response = await request.get(apiBaseUrl);
  expect(response.status()).toBe(200);
});

test("File upload requires a valid session and a file", async ({ request }) => {
  const unauthorized = await request.post(`${apiBaseUrl}/upload`);
  expect(unauthorized.status()).toBe(401);

  const login = await request.post(`${apiBaseUrl}/auth/login`, {
    data: { username: authUsername, password: authPassword },
  });
  expect(login.ok()).toBeTruthy();
  const { access_token: token } = await login.json();
  const missingFile = await request.post(`${apiBaseUrl}/upload`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(missingFile.status()).toBe(400);
});
