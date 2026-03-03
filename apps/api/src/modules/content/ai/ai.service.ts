import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { buildFaqPrompt } from './prompts/faq.prompt';
import { buildArticlePrompt } from './prompts/article.prompt';

@Injectable()
export class AiService {
  private client: Anthropic;
  private logger = new Logger(AiService.name);

  constructor(private config: ConfigService) {
    this.client = new Anthropic({ apiKey: this.config.get('ANTHROPIC_API_KEY') });
  }

  async generateFaq(brand: string, industry: string, keywords: string[], language: string = 'zh-TW'): Promise<string> {
    const { system, user } = buildFaqPrompt(brand, industry, keywords, language);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  async generateArticle(brand: string, topic: string, keywords: string[], language: string = 'zh-TW'): Promise<string> {
    const { system, user } = buildArticlePrompt(brand, topic, keywords, language);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock ? textBlock.text : '';
  }
}
