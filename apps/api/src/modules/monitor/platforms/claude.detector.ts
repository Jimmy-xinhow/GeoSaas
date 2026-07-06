import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { matchBrand } from './match-brand';
import { classifyDetectorError, withDetectorRetry } from './detector-error';

@Injectable()
export class ClaudeDetector {
  private client: Anthropic;
  private logger = new Logger(ClaudeDetector.name);

  constructor(private config: ConfigService) {
    this.client = new Anthropic({ apiKey: this.config.get('ANTHROPIC_API_KEY') });
  }

  async detect(query: string, brandName: string, brandUrl: string): Promise<{ mentioned: boolean; position: number | null; response: string }> {
    const key = this.config.get('ANTHROPIC_API_KEY');
    if (!key) return { mentioned: false, position: null, response: '[Error] ANTHROPIC_API_KEY 未設定' };
    try {
      const response = await withDetectorRetry(
        () =>
          this.client.messages.create({
            model: 'claude-sonnet-4-20250514',
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
