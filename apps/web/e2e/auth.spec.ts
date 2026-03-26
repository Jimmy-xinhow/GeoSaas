import { test, expect } from '@playwright/test';

const uniqueEmail = `e2e-auth-${Date.now()}@test.local`;
const password = 'Test1234!@';

test.describe('Auth — 註冊 & 登入流程', () => {
  test('顯示登入頁面', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('歡迎回來')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: '登入' })).toBeVisible();
  });

  test('顯示註冊頁面', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByText('建立帳號')).toBeVisible();
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
  });

  test('登入表單驗證 — 空白欄位', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: '登入' }).click();
    // Should show validation errors, not navigate away
    await expect(page).toHaveURL(/\/login/);
  });

  test('註冊表單驗證 — 密碼不一致', async ({ page }) => {
    await page.goto('/register');
    await page.locator('#name').fill('Test User');
    await page.locator('#email').fill('test@example.com');
    await page.locator('#password').fill('Password123!');
    await page.locator('#confirmPassword').fill('DifferentPassword');
    await page.getByRole('button', { name: '建立帳號' }).click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('完整流程 — 註冊 → 導向 Dashboard', async ({ page }) => {
    await page.goto('/register');
    await page.locator('#name').fill('E2E Tester');
    await page.locator('#email').fill(uniqueEmail);
    await page.locator('#password').fill(password);
    await page.locator('#confirmPassword').fill(password);
    await page.getByRole('button', { name: '建立帳號' }).click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page.getByText('總覽')).toBeVisible();
  });

  test('完整流程 — 登入 → 導向 Dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(uniqueEmail);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: '登入' }).click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page.getByText('總覽')).toBeVisible();
  });

  test('登入失敗 — 錯誤密碼', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(uniqueEmail);
    await page.locator('#password').fill('WrongPassword99!');
    await page.getByRole('button', { name: '登入' }).click();
    // Should stay on login page
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/login/);
  });
});
