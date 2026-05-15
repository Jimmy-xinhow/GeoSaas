import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test.describe('Badge — 網站詳情嵌入碼流程', () => {
  test('新增網站後，詳情頁顯示 Badge 區塊與狀態', async ({ page }) => {
    await registerAndLogin(page);

    const siteName = 'E2E Badge 測試網站';
    const url = `https://e2e-badge-${Date.now()}.example.com`;

    await page.goto('/sites/new');
    await page.locator('#url').fill(url);
    await page.locator('#name').fill(siteName);
    await page.getByRole('button', { name: '新增並掃描', exact: true }).click();

    await page.waitForURL(/\/sites(\/)?$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: siteName })).toBeVisible();

    await page.getByRole('link', { name: /查看詳情/ }).first().click();
    await page.waitForURL('**/sites/**', { timeout: 15_000 });

    await expect(page.getByRole('heading', { name: '取得 Badge' })).toBeVisible();
    await expect(
      page.getByText(/尚未公開|暫時無法產生公開 Badge|HTML 圖片版/),
    ).toBeVisible({ timeout: 15_000 });
  });
});
