import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test.describe('Scan — 網站新增與掃描流程', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test('Dashboard 顯示統計卡片', async ({ page }) => {
    await expect(page.getByText('已掃描網站', { exact: true })).toBeVisible();
    await expect(page.getByText('平均 GEO 分數', { exact: true })).toBeVisible();
    await expect(page.getByText('AI 引用次數', { exact: true })).toBeVisible();
    await expect(page.getByText('已發布內容', { exact: true })).toBeVisible();
  });

  test('進入 Sites 頁面', async ({ page }) => {
    await page.goto('/sites');
    await expect(page.getByRole('heading', { name: '我的網站' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '新增網站', exact: true })).toBeVisible();
  });

  test('新增網站', async ({ page }) => {
    const url = `https://e2e-site-${Date.now()}.example.com`;

    await page.goto('/sites/new');
    await page.locator('#url').fill(url);
    await page.locator('#name').fill('E2E 測試網站');
    await page.getByRole('button', { name: '新增並掃描', exact: true }).click();

    await page.waitForURL('**/sites/**', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'E2E 測試網站' })).toBeVisible();
  });

  test('Dashboard 快速掃描會接受輸入', async ({ page }) => {
    const input = page.locator('main input').first();
    await expect(input).toBeVisible();
    await input.fill(`https://e2e-quick-${Date.now()}.example.com`);
    await page.locator('main button').last().click();
    await expect(page).toHaveURL(/\/dashboard|\/sites/);
  });
});
