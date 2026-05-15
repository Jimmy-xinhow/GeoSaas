import { test, expect, type APIRequestContext } from '@playwright/test';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const E2E_ADMIN = {
  email: 'e2e-admin@test.local',
  password: 'E2eAdmin123!@',
};

async function registerViaApi(request: APIRequestContext, name: string) {
  const email = `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const response = await request.post(`${API}/api/auth/register`, {
    data: { name, email, password: 'Test1234!@' },
  });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  return payload.data ?? payload;
}

async function loginAdmin(request: APIRequestContext) {
  const response = await request.post(`${API}/api/auth/login`, { data: E2E_ADMIN });
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

test.describe('API smoke - news and industry AI admin boundaries', () => {
  test('news public reads work while create/generate are admin-only', async ({ request }) => {
    const normal = await registerViaApi(request, 'news-boundary-user');
    const admin = await loginAdmin(request);
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const publicLatest = await request.get(`${API}/api/news/latest?limit=3`);
    expect(publicLatest.status()).toBe(200);
    expect(Array.isArray((await publicLatest.json()).data)).toBe(true);

    for (const path of [
      '/api/news?page=0',
      '/api/news?page=abc',
      '/api/news?limit=0',
      '/api/news?limit=51',
      `/api/news?category=${'x'.repeat(81)}`,
      '/api/news?locale=fr',
      '/api/news/latest?limit=0',
      '/api/news/latest?limit=21',
      '/api/news/latest?limit=abc',
      `/api/news/${'x'.repeat(221)}`,
      '/api/news/not-real-news-slug?locale=fr',
    ]) {
      const blockedPublic = await request.get(`${API}${path}`);
      expect(blockedPublic.status(), path).toBe(400);
    }

    const blockedCreate = await request.post(`${API}/api/news`, {
      headers: { Authorization: `Bearer ${normal.token}` },
      data: {
        title: `E2E News Boundary ${unique}`,
        summary: 'A short E2E news item used to verify admin-only creation.',
        sourceUrl: 'https://example.com/e2e-news',
        sourceName: 'E2E Source',
        category: 'e2e',
      },
    });
    expect(blockedCreate.status()).toBe(403);

    const created = await request.post(`${API}/api/news`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: {
        title: `E2E News Boundary ${unique}`,
        titleEn: `E2E News Boundary ${unique}`,
        summary: 'A short E2E news item used to verify admin-only creation.',
        summaryEn: 'A short E2E news item used to verify admin-only creation.',
        sourceUrl: 'https://example.com/e2e-news',
        sourceName: 'E2E Source',
        category: 'e2e',
      },
    });
    expect(created.status()).toBe(201);
    const news = (await created.json()).data;
    expect(news.slug).toBeTruthy();

    for (const payload of [
      {
        title: 'No',
        summary: 'A short E2E news item used to verify admin-only creation.',
        sourceUrl: 'https://example.com/e2e-news',
        sourceName: 'E2E Source',
      },
      {
        title: `E2E News Boundary ${unique}`,
        summary: 'too short',
        sourceUrl: 'https://example.com/e2e-news',
        sourceName: 'E2E Source',
      },
      {
        title: `E2E News Boundary ${unique}`,
        summary: 'A short E2E news item used to verify admin-only creation.',
        sourceUrl: 'ftp://example.com/e2e-news',
        sourceName: 'E2E Source',
      },
      {
        title: `E2E News Boundary ${unique}`,
        summary: 'A short E2E news item used to verify admin-only creation.',
        sourceUrl: 'https://example.com/e2e-news',
        sourceName: 'E2E Source',
        imageUrl: 'javascript:alert(1)',
      },
      {
        title: `E2E News Boundary ${unique}`,
        summary: 'A short E2E news item used to verify admin-only creation.',
        sourceUrl: 'https://example.com/e2e-news',
        sourceName: 'E2E Source',
        category: 'x'.repeat(81),
      },
    ]) {
      const blockedAdminCreate = await request.post(`${API}/api/news`, {
        headers: { Authorization: `Bearer ${admin.token}` },
        data: payload,
      });
      expect(blockedAdminCreate.status(), JSON.stringify(payload)).toBe(400);
    }

    const publicDetail = await request.get(`${API}/api/news/${news.slug}?locale=en`);
    expect(publicDetail.status()).toBe(200);
    expect((await publicDetail.json()).data.title).toContain('E2E News Boundary');

    const blockedGenerate = await request.post(`${API}/api/news/generate?count=1`, {
      headers: { Authorization: `Bearer ${normal.token}` },
    });
    expect(blockedGenerate.status()).toBe(403);

    for (const query of ['count=0', 'count=abc', 'count=21']) {
      const blockedGenerateInput = await request.post(`${API}/api/news/generate?${query}`, {
        headers: { Authorization: `Bearer ${admin.token}` },
      });
      expect(blockedGenerateInput.status(), query).toBe(400);
    }
  });

  test('industry AI write/admin endpoints are protected while read endpoints stay public', async ({ request }) => {
    const normal = await registerViaApi(request, 'industry-boundary-user');
    const admin = await loginAdmin(request);
    const industry = `e2e-industry-${Date.now()}`;

    const publicRanking = await request.get(`${API}/api/industry-ai/${industry}/ranking`);
    expect(publicRanking.status()).toBe(200);

    const privateSite = await createSite(request, normal.token, 'Industry AI Private Site');
    for (const path of [
      `/api/industry-ai/site/${privateSite.id}/impression`,
      `/api/industry-ai/site/${privateSite.id}/trend`,
      `/api/industry-ai/${industry}/compare?a=${privateSite.id}&b=${privateSite.id}`,
    ]) {
      const blockedPrivateRead = await request.get(`${API}${path}`);
      expect(blockedPrivateRead.status(), path).toBe(404);
    }

    for (const path of [
      `/api/industry-ai/${industry}/ranking?platform=unknown`,
      `/api/industry-ai/${'x'.repeat(81)}/ranking`,
      `/api/industry-ai/${industry}/sites`.replace(industry, 'x'.repeat(81)),
      `/api/industry-ai/site/${'x'.repeat(129)}/impression`,
      `/api/industry-ai/site/${'x'.repeat(129)}/trend`,
      `/api/industry-ai/site/missing/trend?weeks=abc`,
      `/api/industry-ai/site/missing/trend?weeks=0`,
      `/api/industry-ai/site/missing/trend?weeks=53`,
      `/api/industry-ai/${industry}/compare`,
      `/api/industry-ai/${industry}/compare?a=${'x'.repeat(129)}&b=site-b`,
      `/api/industry-ai/${industry}/compare?a=site-a&b=${'x'.repeat(129)}`,
    ]) {
      const blockedPublic = await request.get(`${API}${path}`);
      expect(blockedPublic.status(), path).toBe(400);
    }

    const blockedSeed = await request.post(`${API}/api/industry-ai/queries`, {
      headers: { Authorization: `Bearer ${normal.token}` },
      data: {
        industry,
        queries: [{ question: 'Which E2E brand is most visible in AI search?', category: 'brand' }],
      },
    });
    expect(blockedSeed.status()).toBe(403);

    const seed = await request.post(`${API}/api/industry-ai/queries`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: {
        industry,
        queries: [{ question: 'Which E2E brand is most visible in AI search?', category: 'brand' }],
      },
    });
    expect(seed.status()).toBe(201);
    expect((await seed.json()).data.created).toBe(1);

    for (const payload of [
      {
        industry: '',
        queries: [{ question: 'Which E2E brand is most visible in AI search?', category: 'brand' }],
      },
      {
        industry,
        queries: [],
      },
      {
        industry,
        queries: Array.from({ length: 31 }, (_, index) => ({
          question: `Which E2E brand is most visible in AI search ${index}?`,
          category: 'brand',
        })),
      },
      {
        industry,
        queries: [{ question: 'bad', category: 'brand' }],
      },
      {
        industry,
        queries: [{ question: 'Which E2E brand is most visible in AI search?', category: 'x'.repeat(61) }],
      },
      {
        industry,
        queries: [{ question: 'Which E2E brand is most visible in AI search?', category: 'brand', extra: true }],
      },
    ]) {
      const blockedSeedInput = await request.post(`${API}/api/industry-ai/queries`, {
        headers: { Authorization: `Bearer ${admin.token}` },
        data: payload,
      });
      expect(blockedSeedInput.status(), JSON.stringify(payload)).toBe(400);
    }

    const blockedQueries = await request.get(`${API}/api/industry-ai/${industry}/queries`, {
      headers: { Authorization: `Bearer ${normal.token}` },
    });
    expect(blockedQueries.status()).toBe(403);

    const queries = await request.get(`${API}/api/industry-ai/${industry}/queries`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    expect(queries.status()).toBe(200);
    expect((await queries.json()).data.length).toBeGreaterThanOrEqual(1);

    const blockedCompare = await request.post(`${API}/api/industry-ai/${industry}/compare`, {
      headers: { Authorization: `Bearer ${normal.token}` },
      data: { siteAId: 'missing-a', siteBId: 'missing-b' },
    });
    expect(blockedCompare.status()).toBe(403);

    const adminCompareMissingSites = await request.post(`${API}/api/industry-ai/${industry}/compare`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { siteAId: 'missing-a', siteBId: 'missing-b' },
    });
    expect(adminCompareMissingSites.status()).toBe(404);

    const adminCompareMalformed = await request.post(`${API}/api/industry-ai/${industry}/compare`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { siteAId: 'x'.repeat(129), siteBId: 'missing-b' },
    });
    expect(adminCompareMalformed.status()).toBe(400);

    const adminCompareMissingBodyField = await request.post(`${API}/api/industry-ai/${industry}/compare`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { siteAId: 'missing-a' },
    });
    expect(adminCompareMissingBodyField.status()).toBe(400);
  });
});
