const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetryScanAttempt {
  status: string;
  createdAt: Date;
}

export function consecutiveFailedScans(attemptsNewestFirst: RetryScanAttempt[]): number {
  let failures = 0;
  for (const attempt of attemptsNewestFirst) {
    if (attempt.status !== 'FAILED') break;
    failures += 1;
  }
  return failures;
}

export function scanRetryDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  if (consecutiveFailures === 1) return 7 * DAY_MS;
  if (consecutiveFailures === 2) return 14 * DAY_MS;
  return 30 * DAY_MS;
}

export function isScanRetryBackoffActive(
  attemptsNewestFirst: RetryScanAttempt[],
  now = new Date(),
): boolean {
  const failures = consecutiveFailedScans(attemptsNewestFirst);
  const latest = attemptsNewestFirst[0];
  if (!latest || failures === 0) return false;
  return latest.createdAt.getTime() + scanRetryDelayMs(failures) > now.getTime();
}
