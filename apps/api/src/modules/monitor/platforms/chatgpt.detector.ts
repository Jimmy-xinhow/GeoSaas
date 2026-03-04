import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { matchBrand } from './match-brand';

@Injectable()
export class ChatgptDetector {
  private client: OpenAI;
  private logger = new Logger(ChatgptDetector.name);

  constructor(private config: ConfigService) {
    this.client = new OpenAI({ apiKey: this.config.get('OPENAI_API_KEY') || 'missing' });
  }

  async detect(query: string, brandName: string, brandUrl: string): Promise<{ mentioned: boolean; position: number | null; response: string }> {
    const key = this.config.get('OPENAI_API_KEY');
    if (!key) return { mentioned: false, position: null, response: '[Error] OPENAI_API_KEY 未設定' };
    try {
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        messages: [{ role: 'user', content: query }],
      });

      const text = completion.choices[0]?.message?.content || '';
      const { mentioned, position } = matchBrand(text, brandName, brandUrl);
      return { mentioned, position, response: text };
    } catch (error) {
      this.logger.error(`ChatGPT detection failed: ${error}`);
      return { mentioned: false, position: null, response: `[Error] ${error}` };
    }
  }
}
