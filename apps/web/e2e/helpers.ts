import { type Page } from '@playwright/test';

export const TEST_USER = {
  name: 'E2E Tester',
  email: `e2e-${Date.now()}@test.local`,
  password: 'Test1234!@',
};

function resetTestUser() {
  TEST_USER.email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
}

/** Register a new account and return the page already logged in. */
export async function registerAndLogin(page: Page) {
  resetTestUser();
  await page.goto('/register');
  await page.locator('#name').fill(TEST_USER.name);
  await page.locator('#email').fill(TEST_USER.email);
  await page.locator('#password').fill(TEST_USER.password);
  await page.locator('#confirmPassword').fill(TEST_USER.password);
  await page.getByRole('button', { name: '建立帳號', exact: true }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

/** Login with the most recently registered test credentials. */
export async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(TEST_USER.email);
  await page.locator('#password').fill(TEST_USER.password);
  await page.getByRole('button', { name: '登入', exact: true }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

/** Ensure authenticated; tries login, then falls back to a fresh registration. */
export async function ensureAuth(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(TEST_USER.email);
  await page.locator('#password').fill(TEST_USER.password);
  await page.getByRole('button', { name: '登入', exact: true }).click();

  try {
    await page.waitForURL('**/dashboard', { timeout: 8_000 });
  } catch {
    await registerAndLogin(page);
  }
}
