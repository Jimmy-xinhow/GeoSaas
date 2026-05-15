import { test, expect, type APIRequestContext } from '@playwright/test';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function registerViaApi(request: APIRequestContext) {
  const email = `api-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const response = await request.post(`${API}/api/auth/register`, {
    data: {
      name: 'API E2E User',
      email,
      password: 'Test1234!@',
    },
  });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  return payload.data ?? payload;
}

test.describe('API smoke — public files, badge, success cases', () => {
  test('LLMS public endpoints return plain text with crawler-friendly headers', async ({ request }) => {
    const direct = await request.get(`${API}/api/llms-full.txt`);
    expect(direct.status()).toBe(200);
    expect(direct.headers()['content-type']).toContain('text/plain');
    expect(direct.headers()['access-control-allow-origin']).toBe('*');
    expect(direct.headers()['cache-control']).toContain('max-age=21600');
    expect(direct.headers()['x-content-version']).toBeTruthy();
    expect(await direct.text()).toMatch(/GEO|Geovault|品牌|Directory/i);

    const platform = await request.get(`${API}/api/platform/llms-full.txt`);
    expect(platform.status()).toBe(200);
    expect(platform.headers()['content-type']).toContain('text/plain');
    expect(platform.headers()['access-control-allow-origin']).toBe('*');
    expect(platform.headers()['cache-control']).toContain('max-age=21600');
    expect(platform.headers()['x-content-version']).toBeTruthy();

    const summary = await request.get(`${API}/api/llms.txt`);
    expect(summary.status()).toBe(200);
    expect(summary.headers()['content-type']).toContain('text/plain');
  });

  test('Badge API handles private, foreign, and missing sites safely', async ({ request }) => {
    const auth = await registerViaApi(request);
    const token = auth.token;
    const other = await registerViaApi(request);

    const createSite = await request.post(`${API}/api/sites`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: 'API E2E Badge Site',
        url: `https://api-e2e-badge-${Date.now()}.example.com`,
      },
    });
    expect(createSite.status()).toBe(201);
    const sitePayload = await createSite.json();
    const site = sitePayload.data ?? sitePayload;

    const privateSvg = await request.get(`${API}/api/badge/${site.id}.svg`);
    expect(privateSvg.status()).toBe(404);

    const embed = await request.get(`${API}/api/badge/${site.id}/embed-code`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(embed.status()).toBe(200);
    const embedPayload = await embed.json();
    const embedData = embedPayload.data ?? embedPayload;
    expect(embedData.available).toBe(false);
    expect(embedData.reason).toBe('site_not_public');

    const foreignEmbed = await request.get(`${API}/api/badge/${site.id}/embed-code`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(foreignEmbed.status()).toBe(403);

    const privateBadges = await request.get(`${API}/api/sites/${site.id}/badges`);
    expect(privateBadges.status()).toBe(200);
    const privateBadgesPayload = await privateBadges.json();
    expect(privateBadgesPayload.data ?? privateBadgesPayload).toEqual([]);

    const missing = await request.get(`${API}/api/badge/not-a-real-site/embed-code`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(missing.status()).toBe(200);
    const missingPayload = await missing.json();
    const missingData = missingPayload.data ?? missingPayload;
    expect(missingData.available).toBe(false);
    expect(missingData.reason).toBe('site_not_found');
  });

  test('Pending success cases are not exposed through public detail endpoint', async ({ request }) => {
    const auth = await registerViaApi(request);
    const token = auth.token;

    const createCase = await request.post(`${API}/api/success-cases`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: 'API E2E pending case should stay private',
        aiPlatform: 'perplexity',
        queryUsed: '請推薦一個 API 測試用 GEO SaaS 品牌',
        aiResponse: 'Perplexity 測試回覆提到了 API E2E pending case，這筆資料應該在審核前保持非公開。',
        beforeGeoScore: 30,
        afterGeoScore: 72,
        improvementDays: 10,
        industry: '科技 / 軟體',
        tags: ['JSON-LD', 'FAQ Schema'],
      },
    });
    expect(createCase.status()).toBe(201);
    const casePayload = await createCase.json();
    const caseData = casePayload.data ?? casePayload;
    expect(caseData.status).toBe('pending');

    const publicDetail = await request.get(`${API}/api/success-cases/${caseData.id}`);
    expect(publicDetail.status()).toBe(404);

    const publicList = await request.get(`${API}/api/success-cases?limit=50`);
    expect(publicList.status()).toBe(200);
    const listPayload = await publicList.json();
    const listData = listPayload.data ?? listPayload;
    expect(listData.items.some((item: { id: string }) => item.id === caseData.id)).toBe(false);
  });

  test('success case site attribution is scoped to the submitting user', async ({ request }) => {
    const owner = await registerViaApi(request);
    const other = await registerViaApi(request);

    const createSite = await request.post(`${API}/api/sites`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: {
        name: 'API E2E Case Owner Site',
        url: `https://api-e2e-case-owner-${Date.now()}.example.com`,
      },
    });
    expect(createSite.status()).toBe(201);
    const sitePayload = await createSite.json();
    const site = sitePayload.data ?? sitePayload;

    const blockedCreate = await request.post(`${API}/api/success-cases`, {
      headers: { Authorization: `Bearer ${other.token}` },
      data: {
        title: 'Blocked cross-account success case',
        aiPlatform: 'chatgpt',
        queryUsed: 'Which GEO tools mention this brand?',
        aiResponse: 'The AI response includes enough detail to pass the minimum validation length.',
        siteId: site.id,
        industry: 'SaaS',
        tags: ['JSON-LD'],
      },
    });
    expect(blockedCreate.status()).toBe(403);

    const ownCreate = await request.post(`${API}/api/success-cases`, {
      headers: { Authorization: `Bearer ${other.token}` },
      data: {
        title: 'Own pending success case',
        aiPlatform: 'chatgpt',
        queryUsed: 'Which GEO tools mention this other brand?',
        aiResponse: 'The AI response includes enough detail to pass the minimum validation length.',
        industry: 'SaaS',
        tags: ['JSON-LD'],
      },
    });
    expect(ownCreate.status()).toBe(201);
    const ownPayload = await ownCreate.json();
    const ownCase = ownPayload.data ?? ownPayload;

    const blockedUpdate = await request.put(`${API}/api/success-cases/${ownCase.id}`, {
      headers: { Authorization: `Bearer ${other.token}` },
      data: {
        title: 'Updated cross-account success case',
        aiPlatform: 'chatgpt',
        queryUsed: 'Which GEO tools mention this other brand?',
        aiResponse: 'The AI response includes enough detail to pass the minimum validation length.',
        siteId: site.id,
        industry: 'SaaS',
        tags: ['JSON-LD'],
      },
    });
    expect(blockedUpdate.status()).toBe(403);

    for (const payload of [
      {
        title: 'Invalid screenshot success case',
        aiPlatform: 'chatgpt',
        queryUsed: 'Which GEO tools mention this other brand?',
        aiResponse: 'The AI response includes enough detail to pass the minimum validation length.',
        screenshotUrl: 'ftp://example.com/screenshot.png',
      },
      {
        title: 'Oversized industry success case',
        aiPlatform: 'chatgpt',
        queryUsed: 'Which GEO tools mention this other brand?',
        aiResponse: 'The AI response includes enough detail to pass the minimum validation length.',
        industry: 'x'.repeat(81),
      },
      {
        title: 'Oversized tag success case',
        aiPlatform: 'chatgpt',
        queryUsed: 'Which GEO tools mention this other brand?',
        aiResponse: 'The AI response includes enough detail to pass the minimum validation length.',
        tags: ['x'.repeat(41)],
      },
    ]) {
      const blockedPayload = await request.post(`${API}/api/success-cases`, {
        headers: { Authorization: `Bearer ${other.token}` },
        data: payload,
      });
      expect(blockedPayload.status(), JSON.stringify(payload)).toBe(400);
    }
  });

  test('success case public list rejects malformed pagination and filters', async ({ request }) => {
    for (const query of [
      'page=abc',
      'page=0',
      'limit=0',
      'limit=999',
      'aiPlatform=unknown',
      `industry=${'x'.repeat(81)}`,
    ]) {
      const response = await request.get(`${API}/api/success-cases?${query}`);
      expect(response.status(), query).toBe(400);
    }
  });

  test('blog public list rejects malformed pagination and filters', async ({ request }) => {
    const valid = await request.get(`${API}/api/blog/articles?limit=3`);
    expect(valid.status()).toBe(200);

    for (const query of [
      'page=abc',
      'page=0',
      'limit=0',
      'limit=999',
      `category=${'x'.repeat(81)}`,
      'locale=unknown',
    ]) {
      const response = await request.get(`${API}/api/blog/articles?${query}`);
      expect(response.status(), query).toBe(400);
    }
  });

  test('IndexNow submission rejects unowned or mixed-host URLs before external push', async ({ request }) => {
    const publicExternal = await request.post(`${API}/api/indexnow/submit`, {
      data: { url: 'https://example.com/not-owned-by-geovault' },
    });
    expect(publicExternal.status()).toBe(400);

    const auth = await registerViaApi(request);
    const token = auth.token;

    const batchExternal = await request.post(`${API}/api/indexnow/submit-batch`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { urls: ['https://example.com/a', 'https://example.com/b'] },
    });
    expect(batchExternal.status()).toBe(400);

    const mixedHostBatch = await request.post(`${API}/api/indexnow/submit-batch`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { urls: ['https://geovault.app/a', 'https://www.geovault.app/b'] },
    });
    expect(mixedHostBatch.status()).toBe(400);
  });

  test('Guest scan rejects private and local URLs before crawling', async ({ request }) => {
    for (const url of [
      'http://localhost:4000',
      'http://127.0.0.1:4000',
      'http://10.0.0.1',
      'http://172.16.0.1',
      'http://192.168.1.1',
      'http://[::1]',
    ]) {
      const response = await request.post(`${API}/api/guest-scan`, {
        data: { url },
      });
      expect(response.status(), `${url} should be rejected`).toBe(400);
    }
  });

  test('Guest scan status exposes only public-safe fields', async ({ request }) => {
    const create = await request.post(`${API}/api/guest-scan`, {
      data: { url: `https://guest-status-${Date.now()}.example.com` },
    });
    expect(create.status()).toBe(201);
    const createPayload = await create.json();
    const created = createPayload.data ?? createPayload;

    const status = await request.get(`${API}/api/guest-scan/${created.id}`);
    expect(status.status()).toBe(200);
    const statusPayload = await status.json();
    const data = statusPayload.data ?? statusPayload;
    expect(data.id).toBe(created.id);
    expect(data.url).toContain('guest-status-');
    expect(data.ipHash).toBeUndefined();
  });
});
