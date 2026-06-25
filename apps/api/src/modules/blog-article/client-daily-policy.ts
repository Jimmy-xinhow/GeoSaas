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
  return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'STAFF';
}

export function getClientDailyActiveDays(
  plan?: string | null,
  role?: string | null,
): ClientDailyDay[] {
  if (isClientDailyBypassRole(role)) return CLIENT_DAILY_DAY_SEQUENCE;
  if (plan === 'PRO') return ['tue_qa_deepdive', 'fri_comparison', 'sat_data_pulse'];
  if (plan === 'STARTER') return ['tue_qa_deepdive'];
  return [];
}
