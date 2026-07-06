// Shared error handling for the AI-citation detectors.
//
// Two jobs:
//  1. Never leak a provider's raw error (which includes billing text and can
//     be mildly information-leaky) to the end user's monitor table. Users see a
//     short, provider-labelled message; the raw detail goes to the logs only.
//  2. Classify the failure from STRUCTURED fields (HTTP status + provider error
//     code) rather than fragile substring matching, so quota/auth/rate-limit
//     are told apart reliably — and so the logs record the exact status+code we
//     need to diagnose issues like "429 insufficient_quota despite a funded
//     account" (usually a wrong-project/wrong-key situation).

export type DetectorErrorKind =
  | 'quota' // account/project out of quota or credit — permanent, do not retry
  | 'auth' // invalid/unauthorized key — permanent, do not retry
  | 'rate' // rate limited / overloaded — transient, retry
  | 'server' // 5xx from provider — transient, retry
  | 'unknown';

export interface DetectorErrorInfo {
  kind: DetectorErrorKind;
  retryable: boolean;
  /** Short, safe message for the user-facing monitor table. */
  userMessage: string;
  /** Structured, non-leaky detail for server logs. */
  logLine: string;
}

interface StructuredError {
  status?: number;
  code?: string;
  message: string;
}

// Pull status / provider error code out of an OpenAI-SDK, Anthropic-SDK, or
// Google-REST error shape. Falls back to the stringified message.
function extractStructured(error: unknown): StructuredError {
  const e = error as Record<string, any> | null | undefined;
  const status: number | undefined =
    e?.status ?? e?.statusCode ?? e?.response?.status ?? e?.error?.code;
  const code: string | undefined =
    e?.code ?? e?.error?.code ?? e?.error?.type ?? e?.type ?? e?.error?.status;
  const message: string =
    e?.error?.message ?? e?.message ?? (typeof error === 'string' ? error : String(error));
  return {
    status: typeof status === 'number' ? status : undefined,
    code: typeof code === 'string' ? code : undefined,
    message,
  };
}

export function classifyDetectorError(
  error: unknown,
  providerLabel: string,
): DetectorErrorInfo {
  const { status, code, message } = extractStructured(error);
  const lc = message.toLowerCase();
  const codeLc = (code ?? '').toLowerCase();
  const has = (s: string) => lc.includes(s);

  // Quota / credit exhaustion. OpenAI returns HTTP 429 with code
  // `insufficient_quota` (distinct from a transient rate limit); Anthropic and
  // Google surface it in the message. This is NOT retryable — retrying a
  // funded-but-blocked key just burns time.
  const isQuota =
    codeLc === 'insufficient_quota' ||
    has('exceeded your current quota') ||
    has('credit balance is too low') ||
    has('insufficient_quota') ||
    has('billing') ||
    status === 402;

  // Authentication / authorization. Genuine 401, or Google's 403/PERMISSION_DENIED
  // and invalid-key shapes.
  const isAuth =
    ((status === 401 || status === 403) && !isQuota) ||
    codeLc === 'invalid_api_key' ||
    codeLc === 'permission_denied' ||
    codeLc === 'api_key_invalid' ||
    has('invalid api key') ||
    has('invalid x-api-key') ||
    has('incorrect api key') ||
    has('api key not valid') ||
    has('authenticationerror') ||
    has('permission denied');

  // Transient rate limit / model overload. A 429 that is NOT insufficient_quota
  // is a real rate limit; Anthropic uses 529 for overload.
  const isRate =
    (status === 429 && !isQuota) ||
    status === 529 ||
    codeLc === 'rate_limit_exceeded' ||
    has('rate limit') ||
    has('rate_limit') ||
    has('overloaded');

  const isServer = status !== undefined && status >= 500 && status < 600;

  const logLine = `status=${status ?? '?'} code=${code ?? '?'} msg=${message.slice(0, 300)}`;

  if (isQuota) {
    return {
      kind: 'quota',
      retryable: false,
      userMessage: `${providerLabel} 服務額度已用盡，請確認該 AI 服務帳戶的用量與計費設定`,
      logLine,
    };
  }
  if (isAuth) {
    return {
      kind: 'auth',
      retryable: false,
      userMessage: `${providerLabel} 服務金鑰無效或未授權，請確認 API 金鑰設定`,
      logLine,
    };
  }
  if (isRate) {
    return {
      kind: 'rate',
      retryable: true,
      userMessage: `${providerLabel} 服務暫時繁忙，請稍後再試`,
      logLine,
    };
  }
  if (isServer) {
    return {
      kind: 'server',
      retryable: true,
      userMessage: `${providerLabel} 服務暫時無法使用，請稍後再試`,
      logLine,
    };
  }
  return {
    kind: 'unknown',
    retryable: false,
    userMessage: `${providerLabel} 服務暫時無法使用，請稍後再試`,
    logLine,
  };
}

// Run `fn`, retrying once (by default) on transient failures with exponential
// backoff. Permanent failures (quota/auth) throw immediately so we don't waste
// time or credits retrying something that cannot succeed.
export async function withDetectorRetry<T>(
  fn: () => Promise<T>,
  providerLabel: string,
  retries = 1,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const info = classifyDetectorError(error, providerLabel);
      if (!info.retryable || attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}
