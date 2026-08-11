import { normalizeMeasurementDateRange, parseGa4Date } from './analytics-sync.utils';

describe('analytics sync date handling', () => {
  it('parses GA4 compact dates as UTC calendar dates', () => {
    expect(parseGa4Date('20260811').toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });

  it('keeps an explicit valid date range', () => {
    expect(normalizeMeasurementDateRange('2026-07-01', '2026-07-28')).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-28',
    });
  });

  it('rejects reversed and over-wide ranges', () => {
    expect(() => normalizeMeasurementDateRange('2026-07-02', '2026-07-01')).toThrow();
    expect(() => normalizeMeasurementDateRange('2026-01-01', '2026-07-01')).toThrow();
  });
});
