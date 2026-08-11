import { expect, test } from '@playwright/test';

const MEASUREMENT_ID = process.env.E2E_GA_MEASUREMENT_ID || 'G-E2ETEST123';

test('GA4 config is queued before the first page view and the page view is deduplicated', async ({
  page,
}) => {
  await page.route('https://www.googletagmanager.com/**', async (route) => {
    await route.fulfill({ contentType: 'application/javascript', body: '' });
  });
  await page.addInitScript(() => {
    window.localStorage.setItem('geovault_analytics_consent', 'granted');
  });

  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => window.__geovaultAnalyticsInitialized))
    .toBe(MEASUREMENT_ID);

  const calls = await page.evaluate(() =>
    (window.dataLayer || []).map((entry) =>
      Array.isArray(entry) ? entry : Array.from(entry as ArrayLike<unknown>),
    ),
  );
  const commandEntryKinds = await page.evaluate(() =>
    (window.dataLayer || [])
      .filter((entry) => Array.from(entry as ArrayLike<unknown>).length > 0)
      .map((entry) => Object.prototype.toString.call(entry)),
  );
  const configIndex = calls.findIndex(
    (entry) => entry[0] === 'config' && entry[1] === MEASUREMENT_ID,
  );
  const pageViewIndexes = calls
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry[0] === 'event' && entry[1] === 'page_view')
    .map(({ index }) => index);

  expect(configIndex).toBeGreaterThanOrEqual(0);
  expect(commandEntryKinds.length).toBeGreaterThan(0);
  expect(commandEntryKinds.every((kind) => kind === '[object Arguments]')).toBe(true);
  expect(pageViewIndexes).toHaveLength(1);
  expect(pageViewIndexes[0]).toBeGreaterThan(configIndex);

  await page.waitForTimeout(300);
  const finalPageViewCount = await page.evaluate(
    () =>
      (window.dataLayer || []).filter((entry) => {
        const values = Array.isArray(entry)
          ? entry
          : Array.from(entry as ArrayLike<unknown>);
        return values[0] === 'event' && values[1] === 'page_view';
      }).length,
  );
  expect(finalPageViewCount).toBe(1);
});
