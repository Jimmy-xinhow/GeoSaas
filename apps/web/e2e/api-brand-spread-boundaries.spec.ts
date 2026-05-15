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

test.describe('API smoke - brand spread boundaries', () => {
  test('paid users cannot generate brand-spread content for another user site', async ({ request }) => {
    const owner = await registerViaApi(request, 'brand-spread-owner');
    const other = await registerViaApi(request, 'brand-spread-other');
    const admin = await loginAdmin(request);
    const site = await createSite(request, owner.token, 'Brand Spread Owner Site');

    const upgradedOther = await request.patch(`${API}/api/admin/users/${other.user.id}/plan`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { plan: 'STARTER' },
    });
    expect(upgradedOther.status()).toBe(200);

    const blockedGenerate = await request.post(`${API}/api/brand-spread/generate/${site.id}?platforms=medium`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedGenerate.status()).toBe(403);

    const blockedWeeklyPlan = await request.post(`${API}/api/brand-spread/weekly-plan/${site.id}`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedWeeklyPlan.status()).toBe(403);
  });

  test('brand-spread rejects invalid platform filters before generation', async ({ request }) => {
    const owner = await registerViaApi(request, 'brand-spread-platform-owner');
    const admin = await loginAdmin(request);
    const site = await createSite(request, owner.token, 'Brand Spread Platform Site');

    const upgradedOwner = await request.patch(`${API}/api/admin/users/${owner.user.id}/plan`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { plan: 'STARTER' },
    });
    expect(upgradedOwner.status()).toBe(200);

    const platforms = await request.get(`${API}/api/brand-spread/platforms`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(platforms.status()).toBe(200);
    const platformPayload = await platforms.json();
    expect(platformPayload.data.some((platform: { key: string }) => platform.key === 'medium')).toBe(true);

    const invalidPlatform = await request.post(`${API}/api/brand-spread/generate/${site.id}?platforms=medium,unknown`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(invalidPlatform.status()).toBe(400);
  });
});
