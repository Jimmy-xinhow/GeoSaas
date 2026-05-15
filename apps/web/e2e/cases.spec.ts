import { test, expect } from '@playwright/test';
import { registerAndLogin } from './helpers';

test.describe('Cases — 成功案例流程', () => {
  test('公開案例頁可瀏覽，未登入 CTA 導向登入頁', async ({ page }) => {
    await page.goto('/cases');

    await expect(page.getByRole('heading', { name: 'GEO 成功案例' })).toBeVisible();
    await page.getByRole('link', { name: /免費註冊並提交案例/ }).first().click();
    await page.waitForURL('**/login?redirect=/dashboard/submit-case', { timeout: 10_000 });
  });

  test('登入後可提交成功案例並回到 Dashboard', async ({ page }) => {
    await registerAndLogin(page);
    await page.goto('/dashboard/submit-case');

    await expect(page.getByRole('heading', { name: /提交成功案例/ })).toBeVisible();

    await page.locator('#title').fill('E2E 測試品牌被 Perplexity 推薦案例');
    await page.getByRole('button', { name: 'Perplexity' }).click();
    await page.locator('#industry').selectOption('科技 / 軟體');
    await page.getByRole('button', { name: /下一步/ }).click();

    await page.locator('#queryUsed').fill('請推薦台灣適合測試 GEO 的 SaaS 品牌');
    await page.locator('#aiResponse').fill(
      'Perplexity 在測試情境中提到了 E2E 測試品牌，並描述它具備完整的 JSON-LD、FAQ Schema 與 llms.txt，可作為 GEO 優化案例。',
    );
    await page.getByRole('button', { name: /下一步/ }).click();

    await page.locator('#beforeGeoScore').fill('45');
    await page.locator('#afterGeoScore').fill('78');
    await page.locator('#improvementDays').fill('14');
    await page.getByRole('button', { name: /JSON-LD/ }).click();
    await page.getByRole('button', { name: /FAQ Schema/ }).click();
    await page.getByRole('button', { name: /下一步/ }).click();

    await expect(page.getByRole('heading', { name: '確認送出' })).toBeVisible();
    await page.getByRole('button', { name: '確認送出審核' }).click();

    await page.waitForURL('**/dashboard?caseSubmitted=1', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: '總覽' }).first()).toBeVisible();
  });
});
