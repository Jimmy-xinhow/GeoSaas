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
    await expect(page.getByText('步驟 2：綁定品牌知識庫')).toBeVisible();
    await expect(page.getByText('品牌資料來源')).toBeVisible();
  });

  test('沒有網站時阻止生成並顯示下一步', async ({ page }) => {
    await page.goto('/content/new');
    await expect(page.getByText(/目前沒有可用網站/)).toBeVisible();
    await expect(page.getByRole('button', { name: '產生內容' })).toBeDisabled();
  });

  test('內容列表可導航到生成頁', async ({ page }) => {
    await page.goto('/content');
    await page.getByText('AI 生成', { exact: true }).click();
    await page.waitForURL('**/content/new', { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'AI 內容生成' }).first()).toBeVisible();
  });
});
