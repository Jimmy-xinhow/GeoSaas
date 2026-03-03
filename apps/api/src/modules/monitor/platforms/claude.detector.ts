import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class ClaudeDetector {
  private client: Anthropic;
  private logger = new Logger(ClaudeDetector.name);

  constructor(private config: ConfigService) {
    this.client = new Anthropic({ apiKey: this.config.get('ANTHROPIC_API_KEY') });
  }

  async detect(query: string, brandName: string, brandUrl: string): Promise<{ mentioned: boolean; position: number | null; response: string }> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: query }],
      });

      const text = response.content.find((b) => b.type === 'text')?.text || '';
      const mentioned = text.toLowerCase().includes(brandName.toLowerCase()) || text.includes(brandUrl);

      let position: number | null = null;
      if (mentioned) {
        const idx = text.toLowerCase().indexOf(brandName.toLowerCase());
        position = Math.ceil((idx / text.length) * 10);
      }

      return { mentioned, position, response: text };
    } catch (error) {
      this.logger.error(`Claude detection failed: ${error}`);
      return { mentioned: false, position: null, response: `[Error] ${error}` };
    }
  }
}
