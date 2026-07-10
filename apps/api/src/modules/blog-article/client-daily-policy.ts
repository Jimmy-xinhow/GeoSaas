import type { ClientDailyDay } from './blog-template.service';

export const CLIENT_DAILY_DAY_SEQUENCE: ClientDailyDay[] = [
  'mon_topical',
  'tue_qa_deepdive',
  'wed_service',
  'thu_audience',
  'fri_comparison',
  'sat_data_pulse',
];

export function clientDailyDayTypeForDate(date: Date): ClientDailyDay | null {
  const day = date.getUTCDay();
  if (day === 0) return null;
  return CLIENT_DAILY_DAY_SEQUENCE[day - 1] ?? null;
}

export function isClientDailyBypassRole(role?: string | null): boolean {
  // Production content entitlement follows the paid plan, not staff/admin role.
  // This avoids staff-owned client records receiving every weekday slot.
  void role;
  return false;
}

export type ClientDailyPlan = 'FREE' | 'STARTER' | 'PRO';

const CLIENT_DAILY_PLANS = new Set<ClientDailyPlan>(['FREE', 'STARTER', 'PRO']);

function normalizeClientDailyPlan(value?: string | null): ClientDailyPlan | null {
  if (!value) return null;
  const plan = value.toUpperCase() as ClientDailyPlan;
  return CLIENT_DAILY_PLANS.has(plan) ? plan : null;
}

export function getClientDailyPlanOverride(profile?: unknown): ClientDailyPlan | null {
  if (!profile || typeof profile !== 'object') return null;
  const data = profile as Record<string, unknown>;
  const raw =
    typeof data.clientDailyPlanOverride === 'string'
      ? data.clientDailyPlanOverride
      : typeof data.dailyContentPlanOverride === 'string'
        ? data.dailyContentPlanOverride
        : null;
  const override = normalizeClientDailyPlan(raw);
  return override === 'FREE' ? null : override;
}

export function getEffectiveClientDailyPlan(
  plan?: string | null,
  role?: string | null,
  profile?: unknown,
): ClientDailyPlan {
  void role;
  return getClientDailyPlanOverride(profile) ?? normalizeClientDailyPlan(plan) ?? 'FREE';
}

export function getClientDailyActiveDays(
  plan?: string | null,
  role?: string | null,
  profile?: unknown,
): ClientDailyDay[] {
  const effectivePlan = getEffectiveClientDailyPlan(plan, role, profile);
  if (effectivePlan === 'PRO') return ['tue_qa_deepdive', 'fri_comparison', 'sat_data_pulse'];
  if (effectivePlan === 'STARTER') return ['tue_qa_deepdive'];
  return [];
}
