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

test.describe('API smoke - content citation and fix boundaries', () => {
  test('content update rejects malformed editable fields before lookup', async ({ request }) => {
    const user = await registerViaApi(request, 'content-update-owner');

    const malformedBodies = [
      { title: '' },
      { title: '   ' },
      { title: 'x'.repeat(201) },
      { body: '' },
      { body: '   ' },
      { body: 'x'.repeat(20001) },
      { title: 'Valid title', status: 'PUBLISHED' },
    ];

    for (const body of malformedBodies) {
      const response = await request.put(`${API}/api/contents/not-a-real-content-id`, {
        headers: { Authorization: `Bearer ${user.token}` },
        data: body,
      });
      expect(response.status()).toBe(400);
    }

    const validShapeMissingContent = await request.put(`${API}/api/contents/not-a-real-content-id`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { title: 'Valid title' },
    });
    expect(validShapeMissingContent.status()).toBe(404);
  });

  test('citation gap analysis and fill are scoped to the site owner', async ({ request }) => {
    const owner = await registerViaApi(request, 'citation-owner');
    const other = await registerViaApi(request, 'citation-other');
    const admin = await loginAdmin(request);
    const site = await createSite(request, owner.token, 'Citation Boundary Site');

    const blockedAnalyze = await request.get(`${API}/api/contents/citation-gaps/${site.id}`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedAnalyze.status()).toBeGreaterThanOrEqual(400);

    const ownerAnalyze = await request.get(`${API}/api/contents/citation-gaps/${site.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerAnalyze.status()).toBe(200);
    expect(Array.isArray((await ownerAnalyze.json()).data)).toBe(true);

    const adminAnalyze = await request.get(`${API}/api/contents/citation-gaps/${site.id}`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    expect(adminAnalyze.status()).toBe(200);

    const blockedFill = await request.post(`${API}/api/contents/citation-gaps/${site.id}/fill`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedFill.status()).toBeGreaterThanOrEqual(400);
  });

  test('fix generation helpers validate input and smart/apply endpoints are scoped', async ({ request }) => {
    const owner = await registerViaApi(request, 'fix-owner');
    const other = await registerViaApi(request, 'fix-other');
    const site = await createSite(request, owner.token, 'Fix Boundary Site');

    const jsonLd = await request.post(`${API}/api/fix/json-ld/generate`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: { type: 'Organization', name: 'Fix Boundary Site', url: site.url },
    });
    expect(jsonLd.status()).toBe(201);
    expect((await jsonLd.json()).data.code).toContain('application/ld+json');

    const badSmartGenerateOther = await request.post(`${API}/api/fix/smart-generate`, {
      headers: { Authorization: `Bearer ${other.token}` },
      data: { siteId: site.id, indicator: 'json_ld', scanResultId: 'not-a-real-scan-result' },
    });
    expect(badSmartGenerateOther.status()).toBe(403);

    const badSmartGenerateOwner = await request.post(`${API}/api/fix/smart-generate`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: { siteId: site.id, indicator: 'json_ld', scanResultId: 'not-a-real-scan-result' },
    });
    expect(badSmartGenerateOwner.status()).toBe(404);

    const applyMissing = await request.patch(`${API}/api/fix/not-a-real-scan-result/apply`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: { generatedCode: '<script>safe</script>' },
    });
    expect(applyMissing.status()).toBe(404);
  });

  test('fix generation helpers reject malformed URLs and oversized arrays', async ({ request }) => {
    const user = await registerViaApi(request, 'fix-validation-owner');

    const badJsonLdUrl = await request.post(`${API}/api/fix/json-ld/generate`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { type: 'Organization', name: 'Bad URL Brand', url: 'javascript:alert(1)' },
    });
    expect(badJsonLdUrl.status()).toBe(400);

    const badOgType = await request.post(`${API}/api/fix/og-tags/generate`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: {
        title: 'Bad OG Type',
        description: 'A description',
        url: 'https://example.com',
        type: 'script',
      },
    });
    expect(badOgType.status()).toBe(400);

    const tooManyFaqs = await request.post(`${API}/api/fix/faq-schema/generate`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: {
        faqs: Array.from({ length: 51 }, (_, index) => ({
          question: `Question ${index}`,
          answer: 'Answer',
        })),
      },
    });
    expect(tooManyFaqs.status()).toBe(400);
  });
});
