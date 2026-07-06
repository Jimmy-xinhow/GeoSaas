import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { matchBrand } from './match-brand';
import { classifyDetectorError, withDetectorRetry } from './detector-error';

// Model IDs rotate and retired ones return 404 (not a quota/auth error), so
// keep this overridable via env — the previously hardcoded
// claude-sonnet-4-20250514 had been retired and 404'd every check.
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

@Injectable()
export class ClaudeDetector {
  private client: Anthropic;
  private logger = new Logger(ClaudeDetector.name);
  private model: string;

  constructor(private config: ConfigService) {
    this.client = new Anthropic({ apiKey: this.config.get('ANTHROPIC_API_KEY') });
    this.model = this.config.get<string>('MONITOR_CLAUDE_MODEL') || DEFAULT_CLAUDE_MODEL;
  }

  async detect(query: string, brandName: string, brandUrl: string): Promise<{ mentioned: boolean; position: number | null; response: string }> {
    const key = this.config.get('ANTHROPIC_API_KEY');
    if (!key) return { mentioned: false, position: null, response: '[Error] ANTHROPIC_API_KEY 未設定' };
    try {
      const response = await withDetectorRetry(
        () =>
          this.client.messages.create({
            model: this.model,
            max_tokens: 1024,
            messages: [{ role: 'user', content: query }],
          }),
        'Claude',
      );

      const text = response.content.find((b) => b.type === 'text')?.text || '';
      const { mentioned, position } = matchBrand(text, brandName, brandUrl);
      return { mentioned, position, response: text };
    } catch (error) {
      const info = classifyDetectorError(error, 'Claude');
      this.logger.error(`Claude detection failed: ${info.logLine}`);
      return { mentioned: false, position: null, response: `[Error] ${info.userMessage}` };
    }
  }
}
