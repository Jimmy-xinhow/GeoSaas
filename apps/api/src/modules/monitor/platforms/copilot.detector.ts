import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { matchBrand } from './match-brand';

@Injectable()
export class CopilotDetector {
  private client: OpenAI | null = null;
  private logger = new Logger(CopilotDetector.name);
  private model: string;

  constructor(private config: ConfigService) {
    const azureEndpoint = this.config.get<string>('AZURE_OPENAI_ENDPOINT');
    const azureKey = this.config.get<string>('AZURE_OPENAI_API_KEY');
    const azureDeployment = this.config.get<string>('AZURE_OPENAI_DEPLOYMENT', 'gpt-4o-mini');

    if (azureEndpoint && azureKey) {
      // Use Azure OpenAI Service (same engine as Microsoft Copilot)
      this.client = new OpenAI({
        apiKey: azureKey,
        baseURL: `${azureEndpoint}/openai/deployments/${azureDeployment}`,
        defaultQuery: { 'api-version': '2025-01-01-preview' },
        defaultHeaders: { 'api-key': azureKey },
      });
      this.model = azureDeployment;
      this.logger.log('Copilot detector initialized with Azure OpenAI');
    } else {
      // Fallback: use standard OpenAI API with Copilot-like behavior
      const openaiKey = this.config.get<string>('OPENAI_API_KEY');
      if (openaiKey) {
        this.client = new OpenAI({ apiKey: openaiKey });
      }
      this.model = 'gpt-4o-mini';
      this.logger.warn('Copilot detector using OpenAI fallback (set AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY for accurate Copilot detection)');
    }
  }

  async detect(query: string, brandName: string, brandUrl: string): Promise<{ mentioned: boolean; position: number | null; response: string }> {
    if (!this.client) {
      return { mentioned: false, position: null, response: '[Error] AZURE_OPENAI_API_KEY 或 OPENAI_API_KEY 未設定' };
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 1024,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant. When the user asks about products, services, or recommendations, provide specific brand names, websites, and detailed information. Always cite sources when possible.',
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
