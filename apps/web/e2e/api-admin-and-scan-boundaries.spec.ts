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
  const data = payload.data ?? payload;
  expect(data.user.role).toMatch(/ADMIN/);
  return data;
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

test.describe('API smoke - admin routes and scan/directory boundaries', () => {
  test('directory publishing is owner-scoped and public detail follows visibility', async ({ request }) => {
    const owner = await registerViaApi(request, 'directory-owner');
    const other = await registerViaApi(request, 'directory-other');
    const site = await createSite(request, owner.token, 'Directory Boundary Site');

    const blockedToggle = await request.patch(`${API}/api/sites/${site.id}/directory`, {
      headers: { Authorization: `Bearer ${other.token}` },
      data: { isPublic: true, industry: 'E2E Industry' },
    });
    expect(blockedToggle.status()).toBeGreaterThanOrEqual(400);

    const privateDetail = await request.get(`${API}/api/directory/${site.id}`);
    expect(privateDetail.status()).toBe(404);

    const ownerToggle = await request.patch(`${API}/api/sites/${site.id}/directory`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: { isPublic: true, industry: 'E2E Industry' },
    });
    expect(ownerToggle.status()).toBe(200);
    const publicState = (await ownerToggle.json()).data;
    expect(publicState.isPublic).toBe(true);
    expect(publicState.industry).toBe('E2E Industry');

    const publicDetail = await request.get(`${API}/api/directory/${site.id}`);
    expect(publicDetail.status()).toBe(200);

    const publicList = await request.get(`${API}/api/directory?search=Directory&industry=E2E%20Industry&tier=bronze&minScore=0&limit=5`);
    expect(publicList.status()).toBe(200);

    for (const query of [
      `search=${'x'.repeat(121)}`,
      `industry=${'x'.repeat(81)}`,
      'tier=diamond',
      'minScore=-1',
      'minScore=101',
      'minScore=abc',
      'page=0',
      'limit=51',
    ]) {
      const blockedList = await request.get(`${API}/api/directory?${query}`);
      expect(blockedList.status(), `directory ${query}`).toBe(400);
    }

    const blockedLongIndustryToggle = await request.patch(`${API}/api/sites/${site.id}/directory`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: { isPublic: true, industry: 'x'.repeat(81) },
    });
    expect(blockedLongIndustryToggle.status()).toBe(400);

    const publicFeed = await request.get(`${API}/api/directory/${site.id}/feed-events?limit=5`);
    expect(publicFeed.status()).toBe(200);

    for (const query of ['limit=abc', 'limit=0', 'limit=101']) {
      const blockedCrawlerFeed = await request.get(`${API}/api/directory/crawler-feed?${query}`);
      expect(blockedCrawlerFeed.status(), `crawler-feed ${query}`).toBe(400);

      const blockedSiteFeed = await request.get(`${API}/api/directory/${site.id}/feed-events?${query}`);
      expect(blockedSiteFeed.status(), `feed-events ${query}`).toBe(400);
    }
  });

  test('scan detail and results are scoped to the site owner', async ({ request }) => {
    const owner = await registerViaApi(request, 'scan-owner');
    const other = await registerViaApi(request, 'scan-other');
    const site = await createSite(request, owner.token, 'Scan Boundary Site');

    const scanResponse = await request.post(`${API}/api/sites/${site.id}/scans`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(scanResponse.status()).toBe(201);
    const scan = (await scanResponse.json()).data;
    expect(scan.id).toBeTruthy();

    const ownerScan = await request.get(`${API}/api/scans/${scan.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerScan.status()).toBe(200);

    const otherScan = await request.get(`${API}/api/scans/${scan.id}`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(otherScan.status()).toBeGreaterThanOrEqual(400);

    const ownerResults = await request.get(`${API}/api/scans/${scan.id}/results`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerResults.status()).toBe(200);

    const otherResults = await request.get(`${API}/api/scans/${scan.id}/results`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(otherResults.status()).toBeGreaterThanOrEqual(400);
  });

  test('admin-only read endpoints reject normal users and accept admins', async ({ request }) => {
    const normal = await registerViaApi(request, 'admin-boundary-user');
    const admin = await loginAdmin(request);

    for (const path of [
      '/api/admin/users?limit=5',
      '/api/admin/scheduler/tasks',
      '/api/admin/seed/status',
      '/api/sites/admin/client-sites',
    ]) {
      const blocked = await request.get(`${API}${path}`, {
        headers: { Authorization: `Bearer ${normal.token}` },
      });
      expect(blocked.status()).toBe(403);

      const allowed = await request.get(`${API}${path}`, {
        headers: { Authorization: `Bearer ${admin.token}` },
      });
      expect(allowed.status()).toBe(200);
    }

    const qualityReport = await request.get(`${API}/api/admin/content-quality/report?days=30`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    expect(qualityReport.status()).toBe(200);

    const qualityRecent = await request.get(`${API}/api/admin/content-quality/recent?limit=5`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    expect(qualityRecent.status()).toBe(200);

    for (const path of [
      '/api/admin/content-quality/report?days=abc',
      '/api/admin/content-quality/report?days=0',
      '/api/admin/content-quality/report?days=366',
      `/api/admin/content-quality/report?templateType=${'x'.repeat(81)}`,
      `/api/admin/content-quality/report?promptVersion=${'x'.repeat(81)}`,
      '/api/admin/content-quality/recent?limit=abc',
      '/api/admin/content-quality/recent?limit=0',
      '/api/admin/content-quality/recent?limit=501',
      '/api/admin/content-quality/recent?failedOnly=maybe',
      `/api/admin/content-quality/recent?templateType=${'x'.repeat(81)}`,
    ]) {
      const blocked = await request.get(`${API}${path}`, {
        headers: { Authorization: `Bearer ${admin.token}` },
      });
      expect(blocked.status(), path).toBe(400);
    }
  });

  test('admin scan refresh rejects malformed limits', async ({ request }) => {
    const normal = await registerViaApi(request, 'admin-scan-refresh-user');
    const admin = await loginAdmin(request);

    const blockedUser = await request.post(`${API}/api/admin/scan/weekly-refresh?limit=1`, {
      headers: { Authorization: `Bearer ${normal.token}` },
    });
    expect(blockedUser.status()).toBe(403);

    for (const query of ['limit=abc', 'limit=0', 'limit=201']) {
      const blockedInput = await request.post(`${API}/api/admin/scan/weekly-refresh?${query}`, {
        headers: { Authorization: `Bearer ${admin.token}` },
      });
      expect(blockedInput.status(), query).toBe(400);
    }
  });

  test('admin can toggle client tagging while normal users cannot', async ({ request }) => {
    const normal = await registerViaApi(request, 'client-tag-user');
    const admin = await loginAdmin(request);
    const site = await createSite(request, normal.token, 'Client Tag Site');

    const blocked = await request.patch(`${API}/api/sites/admin/${site.id}/toggle-client`, {
      headers: { Authorization: `Bearer ${normal.token}` },
      data: { isClient: true },
    });
    expect(blocked.status()).toBe(403);

    const allowed = await request.patch(`${API}/api/sites/admin/${site.id}/toggle-client`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { isClient: true },
    });
    expect(allowed.status()).toBe(200);
    const toggled = (await allowed.json()).data;
    expect(toggled.isClient).toBe(true);
    expect(toggled.crawlerToken).toBeTruthy();

    const filteredUsers = await request.get(`${API}/api/admin/users?siteFilter=has_client_sites&limit=5`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    expect(filteredUsers.status()).toBe(200);

    const invalidVerify = await request.patch(`${API}/api/admin/sites/${site.id}/verify`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { isVerified: 'true' },
    });
    expect(invalidVerify.status()).toBe(400);

    const validVerify = await request.patch(`${API}/api/admin/sites/${site.id}/verify`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { isVerified: true },
    });
    expect(validVerify.status()).toBe(200);
    expect((await validVerify.json()).data.isVerified).toBe(true);
  });
});
