const DAY_MS = 86_400_000;

export type MeasurementDateRange = { startDate: string; endDate: string };

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseGa4Date(value: string): Date {
  if (!/^\d{8}$/.test(value)) throw new Error(`Invalid GA4 date: ${value}`);
  return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`);
}

export function normalizeMeasurementDateRange(
  startDate?: string,
  endDate?: string,
  defaultDays = 28,
): MeasurementDateRange {
  const yesterday = new Date(Date.now() - DAY_MS);
  const normalizedEnd = endDate || utcDateString(yesterday);
  const end = new Date(`${normalizedEnd}T00:00:00.000Z`);
  if (Number.isNaN(end.getTime())) throw new Error('Invalid endDate; expected YYYY-MM-DD');

  const fallbackStart = new Date(end.getTime() - (defaultDays - 1) * DAY_MS);
  const normalizedStart = startDate || utcDateString(fallbackStart);
  const start = new Date(`${normalizedStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new Error('Invalid startDate; expected YYYY-MM-DD');
  if (start > end) throw new Error('startDate must not be after endDate');
  if ((end.getTime() - start.getTime()) / DAY_MS > 92) {
    throw new Error('Date range must not exceed 93 days');
  }
  return { startDate: utcDateString(start), endDate: utcDateString(end) };
}
