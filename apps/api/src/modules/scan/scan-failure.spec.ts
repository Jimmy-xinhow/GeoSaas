import {
  classifyScanFailure,
  ScanExecutionError,
} from './scan-failure';

describe('scan failure classification', () => {
  it('preserves safe typed crawler failures', () => {
    expect(
      classifyScanFailure(
        new ScanExecutionError('http_4xx', 'Target returned HTTP 403', 403),
      ),
    ).toEqual({ code: 'http_4xx', reason: 'Target returned HTTP 403' });
  });

  it('normalizes undici network failures without leaking internals', () => {
    expect(classifyScanFailure(new TypeError('fetch failed'))).toEqual({
      code: 'network',
      reason: 'Target could not be reached over the network',
    });
  });

  it('redacts connection URLs from unexpected errors', () => {
    const result = classifyScanFailure(
      new Error('failed postgres://user:password@example.internal/database'),
    );
    expect(result.code).toBe('unexpected');
    expect(result.reason).not.toContain('password');
    expect(result.reason).toContain('[redacted connection URL]');
  });
});
