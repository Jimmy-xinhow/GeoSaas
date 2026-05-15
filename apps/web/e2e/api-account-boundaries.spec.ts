import { test, expect, type APIRequestContext } from '@playwright/test';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function registerViaApi(request: APIRequestContext, name: string) {
  const email = `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const response = await request.post(`${API}/api/auth/register`, {
    data: { name, email, password: 'Test1234!@' },
  });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  return payload.data ?? payload;
}

async function createSite(request: APIRequestContext, token: string, name: string) {
  const response = await request.post(`${API}/api/sites`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name,
      url: `https://${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.example.com`,
    },
  });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  return payload.data ?? payload;
}

test.describe('API smoke - account boundaries and commerce edges', () => {
  test('llms.txt editing is owner-scoped while public hosted text remains readable', async ({ request }) => {
    const owner = await registerViaApi(request, 'llms-owner');
    const other = await registerViaApi(request, 'llms-other');
    const site = await createSite(request, owner.token, 'LLMS Boundary Site');
    const content = '# LLMS Boundary Site\n\nThis profile is controlled by the owner account.';

    const update = await request.put(`${API}/api/sites/${site.id}/llms-txt`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: { content },
    });
    expect(update.status()).toBe(200);

    const ownerRead = await request.get(`${API}/api/sites/${site.id}/llms-txt`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerRead.status()).toBe(200);
    const ownerReadPayload = await ownerRead.json();
    expect((ownerReadPayload.data ?? ownerReadPayload).content).toContain('LLMS Boundary Site');

    const blockedRead = await request.get(`${API}/api/sites/${site.id}/llms-txt`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedRead.status()).toBeGreaterThanOrEqual(400);

    const blockedUpdate = await request.put(`${API}/api/sites/${site.id}/llms-txt`, {
      headers: { Authorization: `Bearer ${other.token}` },
      data: { content: '# hostile overwrite' },
    });
    expect(blockedUpdate.status()).toBeGreaterThanOrEqual(400);

    const publicText = await request.get(`${API}/api/llms/${site.id}/llms.txt`);
    expect(publicText.status()).toBe(200);
    expect(await publicText.text()).toContain('Powered by Geovault');
  });

  test('llms.txt AI generation checks ownership before deducting paid quota', async ({ request }) => {
    const owner = await registerViaApi(request, 'llms-ai-owner');
    const other = await registerViaApi(request, 'llms-ai-other');
    const adminLogin = await request.post(`${API}/api/auth/login`, {
      data: { email: 'e2e-admin@test.local', password: 'E2eAdmin123!@' },
    });
    expect(adminLogin.status()).toBe(201);
    const adminPayload = await adminLogin.json();
    const admin = adminPayload.data ?? adminPayload;
    const site = await createSite(request, owner.token, 'LLMS AI Boundary Site');

    const upgrade = await request.patch(`${API}/api/admin/users/${other.user.id}/plan`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { plan: 'STARTER' },
    });
    expect(upgrade.status()).toBe(200);

    const creditsBefore = await request.get(`${API}/api/billing/credits`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(creditsBefore.status()).toBe(200);
    const beforePayload = await creditsBefore.json();
    const beforeUsed = (beforePayload.data ?? beforePayload).freeGenerations.used;

    const blockedGenerate = await request.post(`${API}/api/sites/${site.id}/llms-txt/generate`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedGenerate.status()).toBeGreaterThanOrEqual(400);

    const creditsAfter = await request.get(`${API}/api/billing/credits`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(creditsAfter.status()).toBe(200);
    const afterPayload = await creditsAfter.json();
    expect((afterPayload.data ?? afterPayload).freeGenerations.used).toBe(beforeUsed);
  });

  test('llms.txt template fallback does not deduct paid quota when AI is not used', async ({ request }) => {
    const owner = await registerViaApi(request, 'llms-template-owner');
    const adminLogin = await request.post(`${API}/api/auth/login`, {
      data: { email: 'e2e-admin@test.local', password: 'E2eAdmin123!@' },
    });
    expect(adminLogin.status()).toBe(201);
    const adminPayload = await adminLogin.json();
    const admin = adminPayload.data ?? adminPayload;
    const site = await createSite(request, owner.token, 'LLMS Template Fallback Site');

    const upgrade = await request.patch(`${API}/api/admin/users/${owner.user.id}/plan`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { plan: 'STARTER' },
    });
    expect(upgrade.status()).toBe(200);

    const creditsBefore = await request.get(`${API}/api/billing/credits`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(creditsBefore.status()).toBe(200);
    const beforePayload = await creditsBefore.json();
    const beforeUsed = (beforePayload.data ?? beforePayload).freeGenerations.used;

    const generated = await request.post(`${API}/api/sites/${site.id}/llms-txt/generate`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect([200, 201]).toContain(generated.status());
    const generatedPayload = await generated.json();
    expect((generatedPayload.data ?? generatedPayload).content).toContain('LLMS Template Fallback Site');

    const creditsAfter = await request.get(`${API}/api/billing/credits`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(creditsAfter.status()).toBe(200);
    const afterPayload = await creditsAfter.json();
    expect((afterPayload.data ?? afterPayload).freeGenerations.used).toBe(beforeUsed);
  });

  test('client daily article stats and history are scoped to the site owner', async ({ request }) => {
    const owner = await registerViaApi(request, 'client-daily-owner');
    const other = await registerViaApi(request, 'client-daily-other');
    const site = await createSite(request, owner.token, 'Client Daily Boundary Site');

    const ownerStats = await request.get(`${API}/api/blog/client-daily/stats/${site.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerStats.status()).toBe(200);
    const ownerStatsPayload = await ownerStats.json();
    expect((ownerStatsPayload.data ?? ownerStatsPayload).totalCount).toBe(0);

    const blockedStats = await request.get(`${API}/api/blog/client-daily/stats/${site.id}`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedStats.status()).toBe(403);

    const ownerList = await request.get(`${API}/api/blog/client-daily/list/${site.id}?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerList.status()).toBe(200);
    const ownerListPayload = await ownerList.json();
    expect((ownerListPayload.data ?? ownerListPayload).items).toEqual([]);

    const blockedList = await request.get(`${API}/api/blog/client-daily/list/${site.id}?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedList.status()).toBe(403);

    for (const query of ['page=abc', 'page=0', 'limit=0', 'limit=101']) {
      const invalidList = await request.get(`${API}/api/blog/client-daily/list/${site.id}?${query}`, {
        headers: { Authorization: `Bearer ${owner.token}` },
      });
      expect(invalidList.status(), query).toBe(400);
    }
  });

  test('content generation checks AI configuration before deducting paid quota', async ({ request }) => {
    const user = await registerViaApi(request, 'content-ai-quota');
    const adminLogin = await request.post(`${API}/api/auth/login`, {
      data: { email: 'e2e-admin@test.local', password: 'E2eAdmin123!@' },
    });
    expect(adminLogin.status()).toBe(201);
    const adminPayload = await adminLogin.json();
    const admin = adminPayload.data ?? adminPayload;

    const upgrade = await request.patch(`${API}/api/admin/users/${user.user.id}/plan`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { plan: 'STARTER' },
    });
    expect(upgrade.status()).toBe(200);

    const creditsBefore = await request.get(`${API}/api/billing/credits`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(creditsBefore.status()).toBe(200);
    const beforePayload = await creditsBefore.json();
    const beforeUsed = (beforePayload.data ?? beforePayload).freeGenerations.used;

    const generate = await request.post(`${API}/api/contents/generate`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: {
        type: 'ARTICLE',
        brandName: 'Quota Guard Brand',
        industry: 'SaaS',
        keywords: ['GEO', 'AI search'],
        language: 'zh-TW',
      },
    });
    expect(generate.status()).toBe(400);

    const creditsAfter = await request.get(`${API}/api/billing/credits`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(creditsAfter.status()).toBe(200);
    const afterPayload = await creditsAfter.json();
    expect((afterPayload.data ?? afterPayload).freeGenerations.used).toBe(beforeUsed);
  });

  test('crawler dashboard and token operations are owner-scoped', async ({ request }) => {
    const owner = await registerViaApi(request, 'crawler-owner');
    const other = await registerViaApi(request, 'crawler-other');
    const site = await createSite(request, owner.token, 'Crawler Boundary Site');

    const snippet = await request.get(`${API}/api/crawler/snippet/${site.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(snippet.status()).toBe(200);
    const snippetPayload = await snippet.json();
    const snippetData = snippetPayload.data ?? snippetPayload;
    expect(snippetData.token).toBeTruthy();
    expect(snippetData.snippet).toContain(snippetData.token);

    const validReport = await request.post(`${API}/api/crawler/report`, {
      data: {
        token: snippetData.token,
        botName: 'GPTBot',
        url: site.url,
        userAgent: 'GPTBot/1.0',
        statusCode: 200,
      },
    });
    expect(validReport.status()).toBe(201);

    for (const payload of [
      { token: snippetData.token, botName: 'UnknownBot', url: site.url, statusCode: 200 },
      { token: snippetData.token, botName: 'GPTBot', url: 'not-a-url', statusCode: 200 },
      { token: snippetData.token, botName: 'GPTBot', url: 'https://attacker.example.com/path', statusCode: 200 },
      { token: snippetData.token, botName: 'GPTBot', url: site.url, statusCode: 99 },
      { token: snippetData.token, botName: 'GPTBot', url: site.url, statusCode: 600 },
      { token: snippetData.token, botName: 'GPTBot', url: site.url, userAgent: 'x'.repeat(501), statusCode: 200 },
    ]) {
      const blockedReport = await request.post(`${API}/api/crawler/report`, { data: payload });
      expect(blockedReport.status(), JSON.stringify(payload)).toBe(400);
    }

    for (const payload of [
      { botName: 'UnknownBot', url: 'https://www.geovault.app/', userAgent: 'UnknownBot/1.0', statusCode: 200 },
      { botName: 'GPTBot', url: 'not-a-url', userAgent: 'GPTBot/1.0', statusCode: 200 },
      { botName: 'GPTBot', url: 'https://attacker.example.com/', userAgent: 'GPTBot/1.0', statusCode: 200 },
      { botName: 'GPTBot', url: 'https://www.geovault.app/', userAgent: 'GPTBot/1.0', statusCode: 99 },
    ]) {
      const blockedPlatformReport = await request.post(`${API}/api/crawler/report-platform`, { data: payload });
      expect(blockedPlatformReport.status(), JSON.stringify(payload)).toBe(400);
    }

    for (const path of [
      `/api/sites/${site.id}/crawler`,
      `/api/sites/${site.id}/crawler/stats`,
      `/api/sites/${site.id}/crawler/robots`,
      `/api/crawler/snippet/${site.id}`,
    ]) {
      const blocked = await request.get(`${API}${path}`, {
        headers: { Authorization: `Bearer ${other.token}` },
      });
      expect(blocked.status()).toBeGreaterThanOrEqual(400);
    }

    const blockedRegenerate = await request.post(`${API}/api/sites/${site.id}/crawler/token/regenerate`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedRegenerate.status()).toBeGreaterThanOrEqual(400);

    const ownerRegenerate = await request.post(`${API}/api/sites/${site.id}/crawler/token/regenerate`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerRegenerate.status()).toBe(201);
  });

  test('billing and publish endpoints return safe responses for a fresh user', async ({ request }) => {
    const user = await registerViaApi(request, 'commerce-owner');

    const subscription = await request.get(`${API}/api/billing/subscription`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(subscription.status()).toBe(200);
    const subscriptionPayload = await subscription.json();
    expect((subscriptionPayload.data ?? subscriptionPayload).plan).toBeTruthy();

    const credits = await request.get(`${API}/api/billing/credits`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(credits.status()).toBe(200);

    const invalidPlan = await request.post(`${API}/api/billing/checkout`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { plan: 'NOT_A_PLAN' },
    });
    expect(invalidPlan.status()).toBe(400);

    const blankPlan = await request.post(`${API}/api/billing/checkout`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { plan: '   ' },
    });
    expect(blankPlan.status()).toBe(400);

    const extraCheckoutField = await request.post(`${API}/api/billing/checkout`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { plan: 'STARTER', extra: true },
    });
    expect(extraCheckoutField.status()).toBe(400);

    const creditCheckout = await request.post(`${API}/api/billing/credits/checkout`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { points: 50 },
    });
    expect(creditCheckout.status()).toBe(201);
    const checkoutPayload = await creditCheckout.json();
    const checkoutData = checkoutPayload.data ?? checkoutPayload;
    expect(checkoutData.paymentUrl).toBeTruthy();
    expect(checkoutData.TradeInfo).toBeTruthy();
    expect(checkoutData.TradeSha).toBeTruthy();

    for (const points of [0, 49, 201, 'abc']) {
      const invalidCredits = await request.post(`${API}/api/billing/credits/checkout`, {
        headers: { Authorization: `Bearer ${user.token}` },
        data: { points },
      });
      expect(invalidCredits.status()).toBe(400);
    }

    const extraCreditField = await request.post(`${API}/api/billing/credits/checkout`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { points: 50, extra: true },
    });
    expect(extraCreditField.status()).toBe(400);

    const publications = await request.get(`${API}/api/publications`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(publications.status()).toBe(200);
    const publicationsPayload = await publications.json();
    expect(Array.isArray(publicationsPayload.data ?? publicationsPayload)).toBe(true);

    const missingContentPublish = await request.post(`${API}/api/contents/not-a-real-content-id/publish`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { platforms: ['medium'] },
    });
    expect(missingContentPublish.status()).toBe(404);

    const publishWithMissingPlatforms = await request.post(`${API}/api/contents/not-a-real-content-id/publish`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: {},
    });
    expect(publishWithMissingPlatforms.status()).toBe(400);

    const publishWithEmptyPlatforms = await request.post(`${API}/api/contents/not-a-real-content-id/publish`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { platforms: [] },
    });
    expect(publishWithEmptyPlatforms.status()).toBe(400);

    const publishWithInvalidPlatforms = await request.post(`${API}/api/contents/not-a-real-content-id/publish`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { platforms: ['medium', 'unknown-platform'] },
    });
    expect(publishWithInvalidPlatforms.status()).toBe(400);
  });
});
