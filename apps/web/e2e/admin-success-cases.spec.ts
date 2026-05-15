import { test, expect, type APIRequestContext } from '@playwright/test';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const E2E_ADMIN = {
  email: 'e2e-admin@test.local',
  password: 'E2eAdmin123!@',
};

async function registerViaApi(request: APIRequestContext) {
  const email = `admin-case-user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const response = await request.post(`${API}/api/auth/register`, {
    data: {
      name: 'Admin Case User',
      email,
      password: 'Test1234!@',
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
  const data = payload.data ?? payload;
  expect(data.user.role).toMatch(/ADMIN/);
  return data.token as string;
}

async function createPendingCase(request: APIRequestContext, token: string, titleSuffix: string) {
  const response = await request.post(`${API}/api/success-cases`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: `Admin E2E 成功案例 ${titleSuffix}`,
      aiPlatform: 'perplexity',
      queryUsed: '請推薦一個適合測試後台審核的 GEO SaaS 品牌',
      aiResponse:
        'Perplexity 測試回覆提到了 Admin E2E 成功案例，這筆資料會用來驗證後台審核、拒絕、重置與精選流程。',
      beforeGeoScore: 41,
      afterGeoScore: 83,
      improvementDays: 12,
      industry: '科技 / 軟體',
      tags: ['JSON-LD', 'llms.txt'],
    },
  });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  return payload.data ?? payload;
}

test.describe('Admin API — success case moderation', () => {
  test('admin can list, reject, reset, approve, feature, and expose approved case', async ({ request }) => {
    const userAuth = await registerViaApi(request);
    const userToken = userAuth.token as string;
    const adminToken = await loginAdmin(request);
    const pendingCase = await createPendingCase(request, userToken, `${Date.now()}`);

    const adminList = await request.get(`${API}/api/admin/success-cases?status=pending&limit=50`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminList.status()).toBe(200);
    const listPayload = await adminList.json();
    const listData = listPayload.data ?? listPayload;
    expect(listData.items.some((item: { id: string }) => item.id === pendingCase.id)).toBe(true);

    const reject = await request.patch(`${API}/api/admin/success-cases/${pendingCase.id}/reject`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { reason: 'E2E 測試拒絕原因' },
    });
    expect(reject.status()).toBe(200);
    const rejectedPayload = await reject.json();
    const rejected = rejectedPayload.data ?? rejectedPayload;
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectionReason).toBe('E2E 測試拒絕原因');

    const reset = await request.patch(`${API}/api/admin/success-cases/${pendingCase.id}/reset`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(reset.status()).toBe(200);
    const resetPayload = await reset.json();
    const resetData = resetPayload.data ?? resetPayload;
    expect(resetData.status).toBe('pending');
    expect(resetData.rejectionReason).toBeNull();

    const approve = await request.patch(`${API}/api/admin/success-cases/${pendingCase.id}/approve`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(approve.status()).toBe(200);
    const approvedPayload = await approve.json();
    const approved = approvedPayload.data ?? approvedPayload;
    expect(approved.status).toBe('approved');

    const publicDetail = await request.get(`${API}/api/success-cases/${pendingCase.id}`);
    expect(publicDetail.status()).toBe(200);

    const feature = await request.patch(`${API}/api/admin/success-cases/${pendingCase.id}/feature`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(feature.status()).toBe(200);
    const featurePayload = await feature.json();
    const featured = featurePayload.data ?? featurePayload;
    expect(featured.featuredAt).toBeTruthy();

    const featuredList = await request.get(`${API}/api/success-cases/featured`);
    expect(featuredList.status()).toBe(200);
    const featuredPayload = await featuredList.json();
    const featuredData = featuredPayload.data ?? featuredPayload;
    expect(featuredData.some((item: { id: string }) => item.id === pendingCase.id)).toBe(true);
  });
  test('admin success case list rejects malformed pagination and filters', async ({ request }) => {
    const adminToken = await loginAdmin(request);

    for (const query of [
      'status=published',
      'aiPlatform=unknown',
      'page=abc',
      'page=0',
      'limit=0',
      'limit=500',
      `industry=${'x'.repeat(81)}`,
    ]) {
      const response = await request.get(`${API}/api/admin/success-cases?${query}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(response.status(), query).toBe(400);
    }
  });
});
