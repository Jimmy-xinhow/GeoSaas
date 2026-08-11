import { classifyCrawlerAuditStatus } from './crawler-audit-lifecycle';

describe('crawler audit lifecycle', () => {
  it('does not call an IndexNow submission a fix', () => {
    expect(
      classifyCrawlerAuditStatus(['no-crawler-7d'], ['indexnow-queued']),
    ).toBe('pending_verification');
  });

  it('marks a locally repaired description as fixed when no issue remains', () => {
    expect(
      classifyCrawlerAuditStatus(['thin-description'], ['description-refreshed']),
    ).toBe('fixed');
  });

  it('keeps unresolved content issues in review', () => {
    expect(classifyCrawlerAuditStatus(['thin-content'], [])).toBe('needs_review');
  });
});
