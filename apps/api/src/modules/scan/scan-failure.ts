export type ScanFailureCode =
  | 'timeout'
  | 'network'
  | 'http_4xx'
  | 'http_5xx'
  | 'rate_limited'
  | 'non_html'
  | 'body_too_large'
  | 'empty_body'
  | 'blocked_target'
  | 'redirect_limit'
  | 'unexpected';

const MAX_FAILURE_REASON_LENGTH = 500;

export class ScanExecutionError extends Error {
  constructor(
    readonly code: ScanFailureCode,
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'ScanExecutionError';
  }
}

export function classifyScanFailure(error: unknown): {
  code: ScanFailureCode;
  reason: string;
} {
  if (error instanceof ScanExecutionError) {
    return { code: error.code, reason: sanitizeFailureReason(error.message) };
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (
    (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) ||
    normalized.includes('timeout') ||
    normalized.includes('timed out')
  ) {
    return { code: 'timeout', reason: 'Target did not respond before the scan timeout' };
  }
  if (normalized.includes('fetch failed') || normalized.includes('network')) {
    return { code: 'network', reason: 'Target could not be reached over the network' };
  }
  return {
    code: 'unexpected',
    reason: sanitizeFailureReason(message || 'Unexpected scan failure'),
  };
}

function sanitizeFailureReason(value: string): string {
  return value
    .replace(/\b(?:postgres(?:ql)?|redis):\/\/\S+/gi, '[redacted connection URL]')
    .replace(/\b((?:api[_-]?key|token|password|secret))=\S+/gi, '$1=[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, MAX_FAILURE_REASON_LENGTH);
}
