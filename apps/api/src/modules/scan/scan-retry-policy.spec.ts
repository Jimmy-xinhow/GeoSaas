import {
  consecutiveFailedScans,
  isScanRetryBackoffActive,
  scanRetryDelayMs,
} from './scan-retry-policy';

const NOW = new Date('2026-08-11T00:00:00.000Z');

describe('scan retry policy', () => {
  it('counts only the newest consecutive failures', () => {
    expect(
      consecutiveFailedScans([
        { status: 'FAILED', createdAt: NOW },
        { status: 'FAILED', createdAt: NOW },
        { status: 'COMPLETED', createdAt: NOW },
        { status: 'FAILED', createdAt: NOW },
      ]),
    ).toBe(2);
  });

  it('uses progressively longer retry delays', () => {
    expect(scanRetryDelayMs(0)).toBe(0);
    expect(scanRetryDelayMs(1)).toBe(7 * 86400000);
    expect(scanRetryDelayMs(2)).toBe(14 * 86400000);
    expect(scanRetryDelayMs(3)).toBe(30 * 86400000);
  });

  it('blocks same-day duplicate retries after a failure', () => {
    expect(
      isScanRetryBackoffActive(
        [{ status: 'FAILED', createdAt: new Date('2026-08-10T23:00:00.000Z') }],
        NOW,
      ),
    ).toBe(true);
  });

  it('allows a retry once the applicable delay has elapsed', () => {
    expect(
      isScanRetryBackoffActive(
        [
          { status: 'FAILED', createdAt: new Date('2026-07-01T00:00:00.000Z') },
          { status: 'FAILED', createdAt: new Date('2026-06-24T00:00:00.000Z') },
          { status: 'FAILED', createdAt: new Date('2026-06-17T00:00:00.000Z') },
        ],
        NOW,
      ),
    ).toBe(false);
  });
});
