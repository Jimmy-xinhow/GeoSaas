import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export function normalizeRole(role?: string | null): string {
  return String(role || '').toUpperCase();
}

export function isAdminRole(role?: string | null): boolean {
  return ['ADMIN', 'SUPER_ADMIN'].includes(normalizeRole(role));
}

export function isStaffRole(role?: string | null): boolean {
  return normalizeRole(role) === 'STAFF';
}

export function canAccessSite(
  site: { userId: string; isClient?: boolean | null },
  userId?: string | null,
  role?: string | null,
): boolean {
  if (isAdminRole(role)) return true;
  if (site.userId === userId) return true;
  return isStaffRole(role) && site.isClient === true;
}

export function siteAccessWhere(userId: string, role?: string | null) {
  if (isAdminRole(role)) return {};
  if (isStaffRole(role)) return { OR: [{ userId }, { isClient: true }] };
  return { userId };
}

export function workspaceSiteWhere(userId: string, role?: string | null) {
  if (isStaffRole(role)) return { OR: [{ userId }, { isClient: true }] };
  return { userId };
}

export async function assertSiteAccess(
  prisma: PrismaService,
  siteId: string,
  userId?: string | null,
  role?: string | null,
): Promise<{ id: string; userId: string; isClient: boolean }> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, userId: true, isClient: true },
  });
  if (!site) throw new NotFoundException('Site not found');
  if (!canAccessSite(site, userId, role)) {
    throw new ForbiddenException('You do not have access to this site');
  }
  return site;
}
