import { canAccessSite, siteAccessWhere } from './site-access';

describe('site access helpers', () => {
  const clientSite = { userId: 'owner-1', isClient: true };
  const regularSite = { userId: 'owner-1', isClient: false };

  it('allows staff to access client-tagged sites they do not own', () => {
    expect(canAccessSite(clientSite, 'staff-1', 'STAFF')).toBe(true);
  });

  it('does not allow staff to access non-client sites they do not own', () => {
    expect(canAccessSite(regularSite, 'staff-1', 'STAFF')).toBe(false);
  });

  it('keeps regular users scoped to their own sites', () => {
    expect(canAccessSite(regularSite, 'owner-1', 'USER')).toBe(true);
    expect(canAccessSite(clientSite, 'other-user', 'USER')).toBe(false);
  });

  it('uses owned-or-client filtering for staff list endpoints', () => {
    expect(siteAccessWhere('staff-1', 'STAFF')).toEqual({
      OR: [{ userId: 'staff-1' }, { isClient: true }],
    });
  });
});
