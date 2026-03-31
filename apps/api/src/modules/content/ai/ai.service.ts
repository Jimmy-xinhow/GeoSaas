import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { buildFaqPrompt } from './prompts/faq.prompt';
import { buildArticlePrompt } from './prompts/article.prompt';

@Injectable()
export class AiService {
  private client: OpenAI;
  private logger = new Logger(AiService.name);

  constructor(private config: ConfigService) {
    this.client = new OpenAI({ apiKey: this.config.get('OPENAI_API_KEY') });
  }

  private handleApiError(error: unknown, context: string): never {
    const errMsg = String(error);
    this.logger.error(`${context} failed: ${errMsg}`);

    if (
      errMsg.includes('credit balance is too low') ||
      errMsg.includes('billing') ||
      errMsg.includes('insufficient') ||
      errMsg.includes('402')
    ) {
      throw new BadRequestException(
        `AI API 餘額不足，請確認 OpenAI 帳戶餘額。原始錯誤: ${errMsg.substring(0, 200)}`,
      );
    }
    if (
      errMsg.includes('authentication') ||
      errMsg.includes('invalid api key') ||
      errMsg.includes('invalid x-api-key') ||
      errMsg.includes('401') ||
      errMsg.includes('AuthenticationError')
    ) {
      throw new BadRequestException(
        `AI API 金鑰無效，請確認 OPENAI_API_KEY 是否正確，並重啟伺服器。原始錯誤: ${errMsg.substring(0, 200)}`,
      );
    }
    if (errMsg.includes('rate_limit') || errMsg.includes('429') || errMsg.includes('overloaded')) {
      throw new BadRequestException('AI API 請求過於頻繁，請稍後再試');
    }

    throw new BadRequestException(`AI 生成失敗: ${errMsg.substring(0, 200)}`);
  }

  async generateFaq(brand: string, industry: string, keywords: string[], language: string = 'zh-TW'): Promise<string> {
    const { system, user } = buildFaqPrompt(brand, industry, keywords, language);

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 4096,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      this.handleApiError(error, 'FAQ generation');
    }
  }

  async generateArticle(brand: string, topic: string, keywords: string[], language: string = 'zh-TW'): Promise<string> {
    const { system, user } = buildArticlePrompt(brand, topic, keywords, language);

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 8192,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      this.handleApiError(error, 'Article generation');
    }
  }
}
