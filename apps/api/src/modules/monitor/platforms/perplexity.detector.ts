import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class PerplexityDetector {
  private client: OpenAI;
  private logger = new Logger(PerplexityDetector.name);

  constructor(private config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.get('PERPLEXITY_API_KEY'),
      baseURL: 'https://api.perplexity.ai',
    });
  }

  async detect(query: string, brandName: string, brandUrl: string): Promise<{ mentioned: boolean; position: number | null; response: string }> {
    try {
      const completion = await this.client.chat.completions.create({
        model: 'sonar',
        max_tokens: 1024,
        messages: [{ role: 'user', content: query }],
      });

      const text = completion.choices[0]?.message?.content || '';
      const mentioned = text.toLowerCase().includes(brandName.toLowerCase()) || text.includes(brandUrl);

      let position: number | null = null;
      if (mentioned) {
        const idx = text.toLowerCase().indexOf(brandName.toLowerCase());
        position = Math.ceil((idx / text.length) * 10);
      }

      return { mentioned, position, response: text };
    } catch (error) {
      this.logger.error(`Perplexity detection failed: ${error}`);
      return { mentioned: false, position: null, response: `[Error] ${error}` };
    }
  }
}
