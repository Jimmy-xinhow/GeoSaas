import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { matchBrand } from './match-brand';

@Injectable()
export class CopilotDetector {
  private client: OpenAI;
  private logger = new Logger(CopilotDetector.name);

  constructor(private config: ConfigService) {
    // Microsoft Copilot uses OpenAI API (GPT-4 based)
    // Can use same OpenAI key or a separate COPILOT_API_KEY
    this.client = new OpenAI({
      apiKey: this.config.get('COPILOT_API_KEY') || this.config.get('OPENAI_API_KEY') || 'missing',
    });
  }

  async detect(query: string, brandName: string, brandUrl: string): Promise<{ mentioned: boolean; position: number | null; response: string }> {
    const key = this.config.get('COPILOT_API_KEY') || this.config.get('OPENAI_API_KEY');
    if (!key) return { mentioned: false, position: null, response: '[Error] COPILOT_API_KEY / OPENAI_API_KEY 未設定' };

    try {
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        messages: [
          {
            role: 'system',
            content: 'You are Microsoft Copilot, a helpful AI assistant powered by Microsoft. Answer the user\'s question helpfully and cite specific brands, websites, or services when relevant.',
          },
          { role: 'user', content: query },
        ],
      });

      const text = completion.choices[0]?.message?.content || '';
      const { mentioned, position } = matchBrand(text, brandName, brandUrl);
      return { mentioned, position, response: text };
    } catch (error) {
      this.logger.error(`Copilot detection failed: ${error}`);
      return { mentioned: false, position: null, response: `[Error] ${error}` };
    }
  }
}
