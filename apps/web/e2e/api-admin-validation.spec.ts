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

test.describe('API smoke - admin validation', () => {
  test('admin user mutations reject invalid input and accept safe updates', async ({ request }) => {
    const target = await registerViaApi(request, 'admin-validation-target');
    const admin = await loginAdmin(request);

    const badPlan = await request.patch(`${API}/api/admin/users/${target.user.id}/plan`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { plan: 'ENTERPRISE' },
    });
    expect(badPlan.status()).toBe(400);

    const goodPlan = await request.patch(`${API}/api/admin/users/${target.user.id}/plan`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { plan: 'STARTER' },
    });
    expect(goodPlan.status()).toBe(200);
    expect((await goodPlan.json()).data.plan).toBe('STARTER');

    const emptyName = await request.patch(`${API}/api/admin/users/${target.user.id}/name`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { name: '   ' },
    });
    expect(emptyName.status()).toBe(400);

    const goodName = await request.patch(`${API}/api/admin/users/${target.user.id}/name`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { name: '  Trimmed Admin Name  ' },
    });
    expect(goodName.status()).toBe(200);
    expect((await goodName.json()).data.name).toBe('Trimmed Admin Name');

    const shortPassword = await request.patch(`${API}/api/admin/users/${target.user.id}/password`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { password: 'short' },
    });
    expect([400, 403]).toContain(shortPassword.status());
  });

  test('scheduler and seed admin endpoints return explicit validation failures', async ({ request }) => {
    const normal = await registerViaApi(request, 'scheduler-validation-user');
    const admin = await loginAdmin(request);

    const blockedTasks = await request.get(`${API}/api/admin/scheduler/tasks`, {
      headers: { Authorization: `Bearer ${normal.token}` },
    });
    expect(blockedTasks.status()).toBe(403);

    const tasks = await request.get(`${API}/api/admin/scheduler/tasks`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    expect(tasks.status()).toBe(200);

    const invalidCron = await request.patch(`${API}/api/admin/scheduler/tasks/robots_check`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { cronExpr: 'not a cron expression' },
    });
    expect(invalidCron.status()).toBe(400);

    for (const payload of [
      { enabled: 'true' },
      { name: '   ' },
      { description: 'x'.repeat(501) },
      { unexpected: true },
    ]) {
      const invalidTaskUpdate = await request.patch(`${API}/api/admin/scheduler/tasks/robots_check`, {
        headers: { Authorization: `Bearer ${admin.token}` },
        data: payload,
      });
      expect(invalidTaskUpdate.status(), JSON.stringify(payload)).toBe(400);
    }

    const seedTraversal = await request.post(`${API}/api/admin/seed/import`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { files: ['../package.json'] },
    });
    expect(seedTraversal.status()).toBe(400);

    const seedNonCsv = await request.post(`${API}/api/admin/seed/import`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { files: ['not-a-csv.txt'] },
    });
    expect(seedNonCsv.status()).toBe(400);

    for (const payload of [
      { files: 'readers.csv' },
      { files: Array.from({ length: 51 }, (_, index) => `seed-${index}.csv`) },
      { files: ['x'.repeat(121) + '.csv'] },
      { files: ['safe.csv'], extra: true },
    ]) {
      const invalidSeedImport = await request.post(`${API}/api/admin/seed/import`, {
        headers: { Authorization: `Bearer ${admin.token}` },
        data: payload,
      });
      expect(invalidSeedImport.status(), JSON.stringify(payload)).toBe(400);
    }
  });

  test('blog admin generation endpoints reject normal users and malformed input', async ({ request }) => {
    const normal = await registerViaApi(request, 'blog-admin-validation-user');
    const admin = await loginAdmin(request);

    for (const path of [
      '/api/blog/insights/generate',
      '/api/blog/insights/generate-all',
      '/api/blog/generate/missing-site',
      '/api/blog/batch-generate',
      '/api/blog/generate-templates/missing-site',
      '/api/blog/generate-bulk-templates',
    ]) {
      const blocked = await request.post(`${API}${path}`, {
        headers: { Authorization: `Bearer ${normal.token}` },
        data: { industry: 'e2e' },
      });
      expect(blocked.status(), path).toBe(403);
    }

    for (const payload of [
      {},
      { industry: '' },
      { industry: 'x'.repeat(81) },
      { industry: 'e2e', type: 'unknown' },
      { industry: 'e2e', extra: true },
    ]) {
      const invalidInsight = await request.post(`${API}/api/blog/insights/generate`, {
        headers: { Authorization: `Bearer ${admin.token}` },
        data: payload,
      });
      expect(invalidInsight.status(), JSON.stringify(payload)).toBe(400);
    }

    for (const query of ['limit=abc', 'limit=0', 'limit=201']) {
      const invalidBatch = await request.post(`${API}/api/blog/brand-showcase/batch?${query}`, {
        headers: { Authorization: `Bearer ${admin.token}` },
      });
      expect(invalidBatch.status(), query).toBe(400);
    }

    for (const payload of [
      { description: 'x'.repeat(2001) },
      { forbidden: Array.from({ length: 21 }, (_, index) => `term-${index}`) },
      { forbidden: ['x'.repeat(121)] },
      { forbidden: 'term' },
      { extra: true },
    ]) {
      const invalidPreview = await request.post(`${API}/api/blog/preview/brand-showcase/missing-site`, {
        headers: { Authorization: `Bearer ${admin.token}` },
        data: payload,
      });
      expect(invalidPreview.status(), JSON.stringify(payload)).toBe(400);
    }
  });
});
