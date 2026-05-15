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

async function loginAdmin(request: APIRequestContext) {
  const response = await request.post(`${API}/api/auth/login`, {
    data: E2E_ADMIN,
  });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  return payload.data ?? payload;
}

test.describe('API smoke — dashboard owned resources', () => {
  test('knowledge CRUD works for owner and is blocked for another user', async ({ request }) => {
    const owner = await registerViaApi(request, 'knowledge-owner');
    const other = await registerViaApi(request, 'knowledge-other');
    const site = await createSite(request, owner.token, 'Knowledge E2E Site');

    const createQa = await request.post(`${API}/api/sites/${site.id}/knowledge`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: {
        question: '你們如何協助 AI 搜尋理解品牌？',
        answer: '我們透過品牌知識庫、結構化資料與 llms.txt 建立穩定的 AI 可讀內容。',
        category: 'brand',
      },
    });
    expect(createQa.status()).toBe(201);
    const qaPayload = await createQa.json();
    const qa = qaPayload.data ?? qaPayload;

    const list = await request.get(`${API}/api/sites/${site.id}/knowledge`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(list.status()).toBe(200);
    const listPayload = await list.json();
    const items = listPayload.data ?? listPayload;
    expect(items.some((item: { id: string }) => item.id === qa.id)).toBe(true);

    const blockedList = await request.get(`${API}/api/sites/${site.id}/knowledge`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedList.status()).toBeGreaterThanOrEqual(400);

    const update = await request.put(`${API}/api/sites/${site.id}/knowledge/${qa.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: { answer: '更新後的 E2E 知識庫回答，仍然保持 AI 可讀。' },
    });
    expect(update.status()).toBe(200);

    const remove = await request.delete(`${API}/api/sites/${site.id}/knowledge/${qa.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(remove.status()).toBe(200);
  });

  test('knowledge AI generation checks ownership before deducting paid quota', async ({ request }) => {
    const owner = await registerViaApi(request, 'knowledge-ai-owner');
    const other = await registerViaApi(request, 'knowledge-ai-other');
    const admin = await loginAdmin(request);
    const site = await createSite(request, owner.token, 'Knowledge AI Boundary Site');

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

    const blockedGenerate = await request.post(`${API}/api/sites/${site.id}/knowledge/ai-generate`, {
      headers: { Authorization: `Bearer ${other.token}` },
      data: { excludeQuestions: [] },
    });
    expect(blockedGenerate.status()).toBeGreaterThanOrEqual(400);

    const creditsAfter = await request.get(`${API}/api/billing/credits`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(creditsAfter.status()).toBe(200);
    const afterPayload = await creditsAfter.json();
    expect((afterPayload.data ?? afterPayload).freeGenerations.used).toBe(beforeUsed);
  });

  test('monitor resources are scoped to the site owner', async ({ request }) => {
    const owner = await loginAdmin(request);
    const other = await registerViaApi(request, 'monitor-other');
    const site = await createSite(request, owner.token, 'Monitor E2E Site');

    const createMonitor = await request.post(`${API}/api/sites/${site.id}/monitors`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: { platform: 'perplexity', query: '請推薦 Monitor E2E Site' },
    });
    expect(createMonitor.status()).toBe(201);
    const monitorPayload = await createMonitor.json();
    const monitor = monitorPayload.data ?? monitorPayload;

    const ownerList = await request.get(`${API}/api/sites/${site.id}/monitors`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerList.status()).toBe(200);

    const blockedList = await request.get(`${API}/api/sites/${site.id}/monitors`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedList.status()).toBeGreaterThanOrEqual(400);

    const blockedCreate = await request.post(`${API}/api/sites/${site.id}/monitors`, {
      headers: { Authorization: `Bearer ${other.token}` },
      data: { platform: 'perplexity', query: '跨帳號不應該能建立監控' },
    });
    expect(blockedCreate.status()).toBeGreaterThanOrEqual(400);

    const malformedBodies = [
      { platform: 'unknown-ai', query: 'Where does Monitor E2E Site appear?' },
      { platform: 'perplexity', query: '' },
      { platform: 'perplexity', query: '    ' },
      { platform: 'perplexity', query: 'x'.repeat(301) },
      { platform: 'perplexity', query: 'What is Monitor E2E Site?', extra: true },
    ];

    for (const body of malformedBodies) {
      const response = await request.post(`${API}/api/sites/${site.id}/monitors`, {
        headers: { Authorization: `Bearer ${owner.token}` },
        data: body,
      });
      expect(response.status()).toBe(400);
    }

    const blockedDelete = await request.delete(`${API}/api/monitors/${monitor.id}`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedDelete.status()).toBeGreaterThanOrEqual(400);

    const remove = await request.delete(`${API}/api/monitors/${monitor.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(remove.status()).toBe(200);
  });

  test('client report query sets are scoped to the site owner', async ({ request }) => {
    const owner = await registerViaApi(request, 'report-owner');
    const other = await registerViaApi(request, 'report-other');
    const site = await createSite(request, owner.token, 'Report E2E Site');

    const createSet = await request.post(`${API}/api/client-reports/query-sets`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: {
        siteId: site.id,
        name: 'E2E 驗收問題集',
        queries: [{ category: 'brand', question: 'Report E2E Site 有哪些優勢？' }],
      },
    });
    expect(createSet.status()).toBe(201);

    const ownerSets = await request.get(`${API}/api/client-reports/query-sets/${site.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerSets.status()).toBe(200);

    const blockedSets = await request.get(`${API}/api/client-reports/query-sets/${site.id}`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedSets.status()).toBeGreaterThanOrEqual(400);

    const publicCompleteHtml = await request.get(`${API}/api/client-reports/complete/${site.id}/html`);
    expect(publicCompleteHtml.status()).toBeGreaterThanOrEqual(400);

    const blockedCompleteHtml = await request.get(`${API}/api/client-reports/complete/${site.id}/html`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedCompleteHtml.status()).toBeGreaterThanOrEqual(400);

    const ownerCompleteHtml = await request.get(`${API}/api/client-reports/complete/${site.id}/html`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerCompleteHtml.status()).toBe(200);
    expect(ownerCompleteHtml.headers()['content-type']).toContain('text/html');

    const blockedCreate = await request.post(`${API}/api/client-reports/query-sets`, {
      headers: { Authorization: `Bearer ${other.token}` },
      data: {
        siteId: site.id,
        name: '跨帳號問題集',
        queries: [{ category: 'brand', question: '不應該能建立' }],
      },
    });
    expect(blockedCreate.status()).toBeGreaterThanOrEqual(400);

    const malformedBodies = [
      {
        siteId: site.id,
        name: '',
        queries: [{ category: 'brand', question: 'What is Report E2E Site known for?' }],
      },
      {
        siteId: 's'.repeat(129),
        name: 'Invalid site id',
        queries: [{ category: 'brand', question: 'What is Report E2E Site known for?' }],
      },
      {
        siteId: site.id,
        name: 'Empty queries',
        queries: [],
      },
      {
        siteId: site.id,
        name: 'Too many queries',
        queries: Array.from({ length: 21 }, (_, index) => ({
          category: 'brand',
          question: `What is Report E2E Site known for ${index}?`,
        })),
      },
      {
        siteId: site.id,
        name: 'Short question',
        queries: [{ category: 'brand', question: 'bad' }],
      },
      {
        siteId: site.id,
        name: 'Long category',
        queries: [{ category: 'c'.repeat(61), question: 'What is Report E2E Site known for?' }],
      },
      {
        siteId: site.id,
        name: 'Extra field',
        queries: [{ category: 'brand', question: 'What is Report E2E Site known for?', extra: true }],
      },
    ];

    for (const body of malformedBodies) {
      const response = await request.post(`${API}/api/client-reports/query-sets`, {
        headers: { Authorization: `Bearer ${owner.token}` },
        data: body,
      });
      expect(response.status()).toBe(400);
    }
  });
});
