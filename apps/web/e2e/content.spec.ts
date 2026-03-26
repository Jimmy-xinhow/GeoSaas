import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test.describe('Content — AI 內容生成流程', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test('進入內容列表頁', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByText('內容引擎')).toBeVisible();
    await expect(page.getByText('AI 生成')).toBeVisible();
  });

  test('進入 AI 內容生成頁面', async ({ page }) => {
    await page.goto('/content/new');
    await expect(page.getByText('AI 內容生成')).toBeVisible();
    await expect(page.getByText('步驟 1：選擇內容類型')).toBeVisible();
    await expect(page.getByText('步驟 2：填寫品牌資訊')).toBeVisible();
  });

  test('表單驗證 — 未填品牌名稱', async ({ page }) => {
    await page.goto('/content/new');

    // Try to generate without filling brand name
    const generateBtn = page.getByRole('button', { name: '開始生成' });
    await generateBtn.click();

    // Should stay on same page (validation prevents submission)
    await expect(page).toHaveURL(/\/content\/new/);
  });

  test('填寫表單 — 完整 AI 內容生成流程', async ({ page }) => {
    test.setTimeout(90_000); // AI generation can take 30+ seconds

    await page.goto('/content/new');

    // Step 1: Select content type (FAQ)
    const faqOption = page.getByText('FAQ').first();
    if (await faqOption.isVisible()) {
      await faqOption.click();
    }

    // Step 2: Fill brand info
    await page.locator('#brand').fill('E2E 測試品牌');

    const industryInput = page.locator('#industry');
    if (await industryInput.isVisible()) {
      await industryInput.fill('科技');
    }

    await page.locator('#keywords').fill('AI, 測試, 自動化');

    // Generate
    await page.getByRole('button', { name: '開始生成' }).click();

    // Should show loading state
    const loadingText = page.getByText('AI 正在生成內容...');
    await expect(loadingText).toBeVisible({ timeout: 10_000 });

    // Wait for result (may take a while with real API)
    const resultTitle = page.getByText('生成結果預覽');
    await expect(resultTitle).toBeVisible({ timeout: 60_000 });

    // Verify result actions are available
    await expect(page.getByText('複製到剪貼簿')).toBeVisible();
    await expect(page.getByText('返回內容列表')).toBeVisible();
  });

  test('內容列表 — 導航到生成頁', async ({ page }) => {
    await page.goto('/content');
    await page.getByText('AI 生成').click();
    await page.waitForURL('**/content/new', { timeout: 5_000 });
    await expect(page.getByText('AI 內容生成')).toBeVisible();
  });
});
