import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test.describe('Content — AI 內容生成流程', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test('進入內容列表頁', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByRole('heading', { name: '內容引擎' }).first()).toBeVisible();
    await expect(page.getByText('AI 生成', { exact: true })).toBeVisible();
  });

  test('進入 AI 內容生成頁面', async ({ page }) => {
    await page.goto('/content/new');
    await expect(page.getByRole('heading', { name: 'AI 內容生成' }).first()).toBeVisible();
    await expect(page.getByText('步驟 1：選擇內容類型')).toBeVisible();
    await expect(page.getByText('步驟 2：填寫品牌資訊')).toBeVisible();
  });

  test('表單驗證 — 未填品牌名稱', async ({ page }) => {
    await page.goto('/content/new');
    await page.locator('main button').last().click();
    await expect(page).toHaveURL(/\/content\/new/);
  });

  test('免費帳號點數不足時顯示限制訊息', async ({ page }) => {
    await page.goto('/content/new');
    await page.locator('#brand').fill('E2E 測試品牌');
    await page.locator('#industry').fill('測試產業');
    await page.locator('#keywords').fill('GEO, AI 搜尋');
    await page.locator('main button').last().click();

    await expect(page.getByText('點數不足')).toBeVisible({ timeout: 15_000 });
  });

  test('內容列表可導航到生成頁', async ({ page }) => {
    await page.goto('/content');
    await page.getByText('AI 生成', { exact: true }).click();
    await page.waitForURL('**/content/new', { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'AI 內容生成' }).first()).toBeVisible();
  });
});
