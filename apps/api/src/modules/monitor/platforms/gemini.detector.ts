import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { matchBrand } from './match-brand';
import { classifyDetectorError, withDetectorRetry } from './detector-error';

// Gemini retires model ids too (gemini-2.0-flash was pulled and returned a
// 404 NOT_FOUND), so keep this overridable via env — a rotation is then a
// config change, not a code change.
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

@Injectable()
export class GeminiDetector {
  private apiKey: string;
  private model: string;
  private logger = new Logger(GeminiDetector.name);

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get('GEMINI_API_KEY') || '';
    this.model = this.config.get<string>('MONITOR_GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  }

  async detect(query: string, brandName: string, brandUrl: string): Promise<{ mentioned: boolean; position: number | null; response: string }> {
    if (!this.apiKey) return { mentioned: false, position: null, response: '[Error] GEMINI_API_KEY 未設定' };
    try {
      const text = await withDetectorRetry(async () => {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: query }] }],
              generationConfig: { maxOutputTokens: 1024 },
            }),
          },
        );

        // fetch() does not throw on 4xx/5xx — without this the error JSON would
        // fall through and silently become an empty "not mentioned" result.
        if (!res.ok) {
          const body = await res.json().catch(() => ({}) as Record<string, any>);
          const g = (body as Record<string, any>).error ?? {};
          const err = new Error(g.message || `Gemini API HTTP ${res.status}`) as Error & {
            status?: number;
            code?: string;
          };
          err.status = res.status;
          err.code = g.status; // e.g. RESOURCE_EXHAUSTED, PERMISSION_DENIED
          throw err;
        }

        const data = (await res.json()) as Record<string, any>;
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }, 'Gemini');

      const { mentioned, position } = matchBrand(text, brandName, brandUrl);
      return { mentioned, position, response: text };
    } catch (error) {
      const info = classifyDetectorError(error, 'Gemini');
      this.logger.error(`Gemini detection failed: ${info.logLine}`);
      return { mentioned: false, position: null, response: `[Error] ${info.userMessage}` };
    }
  }
}
