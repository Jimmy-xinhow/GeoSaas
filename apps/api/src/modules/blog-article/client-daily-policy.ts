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

export function getClientDailyActiveDays(
  plan?: string | null,
  role?: string | null,
): ClientDailyDay[] {
  void role;
  if (plan === 'PRO') return ['tue_qa_deepdive', 'fri_comparison', 'sat_data_pulse'];
  if (plan === 'STARTER') return ['tue_qa_deepdive'];
  return [];
}
