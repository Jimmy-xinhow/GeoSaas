import { classifyDetectorError, withDetectorRetry } from './detector-error';

describe('classifyDetectorError', () => {
  it('classifies OpenAI insufficient_quota (429) as non-retryable quota', () => {
    const err = Object.assign(new Error('You exceeded your current quota, please check your plan and billing details.'), {
      status: 429,
      code: 'insufficient_quota',
    });
    const info = classifyDetectorError(err, 'ChatGPT');
    expect(info.kind).toBe('quota');
    expect(info.retryable).toBe(false);
    expect(info.userMessage).toContain('ChatGPT');
    expect(info.userMessage).not.toContain('billing'); // no raw provider text leaked
    expect(info.logLine).toContain('code=insufficient_quota');
  });

  it('classifies a genuine 401 as non-retryable auth', () => {
    const err = Object.assign(new Error('Incorrect API key provided'), { status: 401, code: 'invalid_api_key' });
    const info = classifyDetectorError(err, 'ChatGPT');
    expect(info.kind).toBe('auth');
    expect(info.retryable).toBe(false);
  });

  it('classifies a real rate limit (429 without insufficient_quota) as retryable', () => {
    const err = Object.assign(new Error('Rate limit reached'), { status: 429, code: 'rate_limit_exceeded' });
    const info = classifyDetectorError(err, 'Perplexity');
    expect(info.kind).toBe('rate');
    expect(info.retryable).toBe(true);
  });

  it('classifies Anthropic 529 overload as retryable rate', () => {
    const err = Object.assign(new Error('Overloaded'), { status: 529 });
    const info = classifyDetectorError(err, 'Claude');
    expect(info.kind).toBe('rate');
    expect(info.retryable).toBe(true);
  });

  it('classifies Google RESOURCE_EXHAUSTED (429) as retryable', () => {
    const err = Object.assign(new Error('Quota exceeded for quota metric'), {
      status: 429,
      code: 'RESOURCE_EXHAUSTED',
    });
    const info = classifyDetectorError(err, 'Gemini');
    expect(info.retryable).toBe(true);
  });

  it('classifies Google PERMISSION_DENIED (403) as non-retryable auth', () => {
    const err = Object.assign(new Error('API key not valid. Please pass a valid API key.'), {
      status: 403,
      code: 'PERMISSION_DENIED',
    });
    const info = classifyDetectorError(err, 'Gemini');
    expect(info.kind).toBe('auth');
    expect(info.retryable).toBe(false);
  });

  it('classifies 5xx as retryable server error', () => {
    const err = Object.assign(new Error('Internal server error'), { status: 503 });
    const info = classifyDetectorError(err, 'ChatGPT');
    expect(info.kind).toBe('server');
    expect(info.retryable).toBe(true);
  });

  it('reads quota from message when structured fields are absent', () => {
    const info = classifyDetectorError('Error: 429 You exceeded your current quota', 'ChatGPT');
    expect(info.kind).toBe('quota');
  });
});

describe('withDetectorRetry', () => {
  it('does not retry a quota error', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw Object.assign(new Error('exceeded your current quota'), { status: 429, code: 'insufficient_quota' });
    };
    await expect(withDetectorRetry(fn, 'ChatGPT', 2)).rejects.toBeDefined();
    expect(calls).toBe(1); // no retries on permanent failure
  });

  it('retries a transient rate limit then succeeds', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('rate limit'), { status: 429, code: 'rate_limit_exceeded' });
      return 'ok';
    };
    await expect(withDetectorRetry(fn, 'Perplexity', 2)).resolves.toBe('ok');
    expect(calls).toBe(2);
  });
});
