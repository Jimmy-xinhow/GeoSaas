import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test.describe('Scan — 網站新增 & 掃描流程', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test('Dashboard 顯示統計卡片', async ({ page }) => {
    await expect(page.getByText('已掃描網站')).toBeVisible();
    await expect(page.getByText('平均 GEO 分數')).toBeVisible();
    await expect(page.getByText('AI 引用次數')).toBeVisible();
    await expect(page.getByText('已發布內容')).toBeVisible();
  });

  test('進入 Sites 頁面 — 顯示空狀態', async ({ page }) => {
    await page.goto('/sites');
    await expect(page.getByText('我的網站')).toBeVisible();
    // New account should have no sites
    await expect(page.getByText('新增網站')).toBeVisible();
  });

  test('新增網站', async ({ page }) => {
    await page.goto('/sites');
    await page.getByRole('button', { name: '新增網站' }).click();

    // Fill in the form
    const urlInput = page.getByPlaceholder('輸入網址，例如 https://example.com');
    await expect(urlInput).toBeVisible();
    await urlInput.fill('https://e2e-test.example.com');

    const nameInput = page.getByPlaceholder('網站名稱（選填）');
    if (await nameInput.isVisible()) {
      await nameInput.fill('E2E 測試網站');
    }

    await page.getByRole('button', { name: '新增' }).click();

    // Wait for site card to appear
    await expect(page.getByText('e2e-test.example.com')).toBeVisible({ timeout: 10_000 });
  });

  test('新增網站並觸發掃描', async ({ page }) => {
    await page.goto('/sites');
    await page.getByRole('button', { name: '新增網站' }).click();

    const urlInput = page.getByPlaceholder('輸入網址，例如 https://example.com');
    await urlInput.fill('https://e2e-scan.example.com');
    await page.getByRole('button', { name: '新增' }).click();

    // Wait for site to appear
    await expect(page.getByText('e2e-scan.example.com')).toBeVisible({ timeout: 10_000 });

    // Click scan button
    const scanBtn = page.getByRole('button', { name: '掃描' }).first();
    if (await scanBtn.isVisible()) {
      await scanBtn.click();
      // Status should change to pending/running
      const statusBadge = page.getByText(/排隊中|掃描中/).first();
      await expect(statusBadge).toBeVisible({ timeout: 10_000 });
    }
  });

  test('Dashboard 快速掃描', async ({ page }) => {
    const input = page.getByPlaceholder('輸入網址開始掃描...');
    if (await input.isVisible()) {
      await input.fill('https://e2e-quick.example.com');
      await page.getByRole('button', { name: '開始掃描' }).click();
      // Should either redirect or show status
      await page.waitForTimeout(3000);
    }
  });
});
