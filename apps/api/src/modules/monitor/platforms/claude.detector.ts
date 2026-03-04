import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { matchBrand } from './match-brand';

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
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: query }],
      });

      const text = response.content.find((b) => b.type === 'text')?.text || '';
      const { mentioned, position } = matchBrand(text, brandName, brandUrl);
      return { mentioned, position, response: text };
    } catch (error) {
      const errMsg = String(error);
      this.logger.error(`Claude detection failed: ${errMsg}`);

      let userMessage = errMsg;
      if (errMsg.includes('credit balance') || errMsg.includes('billing') || errMsg.includes('402')) {
        userMessage = 'AI API 餘額不足，請確認 Anthropic 帳戶餘額';
      } else if (errMsg.includes('authentication') || errMsg.includes('invalid') || errMsg.includes('401')) {
        userMessage = 'AI API 金鑰無效，請確認 ANTHROPIC_API_KEY 並重啟伺服器';
      }

      return { mentioned: false, position: null, response: `[Error] ${userMessage}` };
    }
  }
}
