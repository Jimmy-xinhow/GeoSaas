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

test.describe('API smoke - core resource operations', () => {
  test('profile update and password change flows behave safely', async ({ request }) => {
    const user = await registerViaApi(request, 'profile-owner');
    const other = await registerViaApi(request, 'profile-other');
    const newPassword = 'NewTest1234!@';

    const me = await request.get(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(me.status()).toBe(200);
    expect((await me.json()).data.email).toBe(user.user.email);

    const updateName = await request.patch(`${API}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { name: 'Updated Profile Owner' },
    });
    expect(updateName.status()).toBe(200);
    expect((await updateName.json()).data.name).toBe('Updated Profile Owner');

    const emailConflict = await request.patch(`${API}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { email: other.user.email },
    });
    expect(emailConflict.status()).toBe(409);

    const wrongCurrentPassword = await request.post(`${API}/api/auth/change-password`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { currentPassword: 'WrongPassword123!', newPassword },
    });
    expect(wrongCurrentPassword.status()).toBe(401);

    const shortNewPassword = await request.post(`${API}/api/auth/change-password`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { currentPassword: 'Test1234!@', newPassword: 'short' },
    });
    expect(shortNewPassword.status()).toBe(400);

    const changed = await request.post(`${API}/api/auth/change-password`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { currentPassword: 'Test1234!@', newPassword },
    });
    expect(changed.status()).toBe(201);

    const oldPasswordLogin = await request.post(`${API}/api/auth/login`, {
      data: { email: user.user.email, password: 'Test1234!@' },
    });
    expect(oldPasswordLogin.status()).toBe(401);

    const newPasswordLogin = await request.post(`${API}/api/auth/login`, {
      data: { email: user.user.email, password: newPassword },
    });
    expect(newPasswordLogin.status()).toBe(201);
  });

  test('auth normalizes email and rejects blank profile names', async ({ request }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const rawEmail = `  Mixed-${unique}@Test.Local  `;
    const normalizedEmail = `mixed-${unique}@test.local`;
    const updatedEmail = `updated-${unique}@test.local`;

    const registered = await request.post(`${API}/api/auth/register`, {
      data: { name: '  Mixed User  ', email: rawEmail, password: 'Test1234!@' },
    });
    expect(registered.status()).toBe(201);
    const registeredPayload = await registered.json();
    const registeredData = registeredPayload.data ?? registeredPayload;
    expect(registeredData.user.email).toBe(normalizedEmail);
    expect(registeredData.user.name).toBe('Mixed User');

    const duplicateCaseEmail = await request.post(`${API}/api/auth/register`, {
      data: { name: 'Duplicate', email: normalizedEmail.toUpperCase(), password: 'Test1234!@' },
    });
    expect(duplicateCaseEmail.status()).toBe(409);

    const login = await request.post(`${API}/api/auth/login`, {
      data: { email: ` ${normalizedEmail.toUpperCase()} `, password: 'Test1234!@' },
    });
    expect(login.status()).toBe(201);
    const loginPayload = await login.json();
    const loginData = loginPayload.data ?? loginPayload;

    const blankName = await request.patch(`${API}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${loginData.token}` },
      data: { name: '   ' },
    });
    expect(blankName.status()).toBe(400);

    const updateEmail = await request.patch(`${API}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${loginData.token}` },
      data: { email: ` ${updatedEmail.toUpperCase()} ` },
    });
    expect(updateEmail.status()).toBe(200);
    expect((await updateEmail.json()).data.email).toBe(updatedEmail);
  });

  test('site detail, update, and delete are scoped to the owner', async ({ request }) => {
    const owner = await registerViaApi(request, 'site-owner');
    const other = await registerViaApi(request, 'site-other');
    const site = await createSite(request, owner.token, 'Scoped Site');

    for (const url of ['http://127.0.0.1:4000', 'http://10.0.0.1', 'http://192.168.1.1']) {
      const blockedCreate = await request.post(`${API}/api/sites`, {
        headers: { Authorization: `Bearer ${owner.token}` },
        data: { name: 'Blocked Internal Site', url },
      });
      expect(blockedCreate.status(), `${url} should be rejected on create`).toBe(400);
    }

    const malformedCreates = [
      { name: '', url: 'https://blank-name.example.com' },
      { name: '   ', url: 'https://blank-name-spaces.example.com' },
      { name: 'x'.repeat(121), url: 'https://too-long-name.example.com' },
      { name: 'FTP Site', url: 'ftp://example.com' },
      { name: 'Extra Field Site', url: 'https://extra-field.example.com', extra: true },
    ];

    for (const body of malformedCreates) {
      const response = await request.post(`${API}/api/sites`, {
        headers: { Authorization: `Bearer ${owner.token}` },
        data: body,
      });
      expect(response.status()).toBe(400);
    }

    const ownerDetail = await request.get(`${API}/api/sites/${site.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerDetail.status()).toBe(200);
    expect((await ownerDetail.json()).data.id).toBe(site.id);

    const blockedDetail = await request.get(`${API}/api/sites/${site.id}`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedDetail.status()).toBeGreaterThanOrEqual(400);

    const blockedUpdate = await request.put(`${API}/api/sites/${site.id}`, {
      headers: { Authorization: `Bearer ${other.token}` },
      data: { name: 'Other Account Rename', url: site.url },
    });
    expect(blockedUpdate.status()).toBeGreaterThanOrEqual(400);

    const blockedInternalUpdate = await request.put(`${API}/api/sites/${site.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: { name: 'Scoped Site', url: 'http://localhost:4000' },
    });
    expect(blockedInternalUpdate.status()).toBe(400);

    const malformedUpdates = [
      { name: '' },
      { name: '   ' },
      { name: 'x'.repeat(121) },
      { url: 'ftp://example.com' },
      { name: 'Scoped Site', extra: true },
    ];

    for (const body of malformedUpdates) {
      const response = await request.put(`${API}/api/sites/${site.id}`, {
        headers: { Authorization: `Bearer ${owner.token}` },
        data: body,
      });
      expect(response.status()).toBe(400);
    }

    const ownerUpdate = await request.put(`${API}/api/sites/${site.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: { name: 'Scoped Site Updated', url: site.url },
    });
    expect(ownerUpdate.status()).toBe(200);
    expect((await ownerUpdate.json()).data.name).toBe('Scoped Site Updated');

    const blockedDelete = await request.delete(`${API}/api/sites/${site.id}`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(blockedDelete.status()).toBeGreaterThanOrEqual(400);

    const ownerDelete = await request.delete(`${API}/api/sites/${site.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerDelete.status()).toBe(200);
  });

  test('notifications are user-scoped and cannot be marked read by another account', async ({ request }) => {
    const owner = await registerViaApi(request, 'notification-owner');
    const other = await registerViaApi(request, 'notification-other');

    const ownerList = await request.get(`${API}/api/notifications`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerList.status()).toBe(200);
    const ownerNotifications = (await ownerList.json()).data;
    expect(Array.isArray(ownerNotifications)).toBe(true);
    expect(ownerNotifications.length).toBeGreaterThan(0);

    const target = ownerNotifications.find((item: { read: boolean }) => item.read === false) ?? ownerNotifications[0];

    const otherMark = await request.put(`${API}/api/notifications/${target.id}/read`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(otherMark.status()).toBe(200);
    expect((await otherMark.json()).data.count).toBe(0);

    const ownerListAfterOther = await request.get(`${API}/api/notifications`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const stillUnread = (await ownerListAfterOther.json()).data.find(
      (item: { id: string }) => item.id === target.id,
    );
    expect(stillUnread.read).toBe(target.read);

    const ownerMark = await request.put(`${API}/api/notifications/${target.id}/read`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerMark.status()).toBe(200);
    expect((await ownerMark.json()).data.count).toBe(1);
  });

  test('upload config and screenshot presign handle unconfigured and invalid input safely', async ({ request }) => {
    const user = await registerViaApi(request, 'upload-owner');

    const config = await request.get(`${API}/api/upload/config`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(config.status()).toBe(200);
    const uploadConfigured = (await config.json()).data.configured;
    expect(typeof uploadConfigured).toBe('boolean');

    const badMime = await request.post(`${API}/api/upload/case-screenshot/presign`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { fileName: 'case.exe', contentType: 'application/x-msdownload', fileSize: 1024 },
    });
    expect(badMime.status()).toBeGreaterThanOrEqual(400);

    const tooLarge = await request.post(`${API}/api/upload/case-screenshot/presign`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { fileName: 'case.png', contentType: 'image/png', fileSize: 6 * 1024 * 1024 },
    });
    expect(tooLarge.status()).toBeGreaterThanOrEqual(400);

    const validShape = await request.post(`${API}/api/upload/case-screenshot/presign`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { fileName: 'case.png', contentType: 'image/png', fileSize: 1024 },
    });
    const expectedStatus = uploadConfigured ? 201 : 503;
    expect(validShape.status()).toBe(expectedStatus);
  });
});
