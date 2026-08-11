export type CrawlerAuditStatus =
  | 'needs_review'
  | 'pending_verification'
  | 'fixed';

export function classifyCrawlerAuditStatus(
  issues: string[],
  actions: string[],
): CrawlerAuditStatus {
  if (actions.includes('indexnow-queued')) return 'pending_verification';
  if (
    actions.includes('description-refreshed') &&
    issues.every((issue) => issue === 'thin-description')
  ) {
    return 'fixed';
  }
  return 'needs_review';
}
