import { type Page } from '@playwright/test';

/** Test user credentials — must exist in the database */
export const TEST_USER = {
  name: 'E2E Tester',
  email: `e2e-${Date.now()}@test.local`,
  password: 'Test1234!@',
};

/** Register a new account and return the page (already logged in) */
export async function registerAndLogin(page: Page) {
  await page.goto('/register');
  await page.locator('#name').fill(TEST_USER.name);
  await page.locator('#email').fill(TEST_USER.email);
  await page.locator('#password').fill(TEST_USER.password);
  await page.locator('#confirmPassword').fill(TEST_USER.password);
  await page.getByRole('button', { name: '建立帳號' }).click();
  // Should redirect to dashboard after successful registration
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

/** Login with existing credentials */
export async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(TEST_USER.email);
  await page.locator('#password').fill(TEST_USER.password);
  await page.getByRole('button', { name: '登入' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

/** Ensure authenticated — tries login, falls back to register */
export async function ensureAuth(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(TEST_USER.email);
  await page.locator('#password').fill(TEST_USER.password);
  await page.getByRole('button', { name: '登入' }).click();

  try {
    await page.waitForURL('**/dashboard', { timeout: 8_000 });
  } catch {
    // Login failed — register new account
    await registerAndLogin(page);
  }
}
