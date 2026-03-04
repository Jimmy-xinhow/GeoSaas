import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { matchBrand } from './match-brand';

@Injectable()
export class GeminiDetector {
  private apiKey: string;
  private logger = new Logger(GeminiDetector.name);

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get('GEMINI_API_KEY') || '';
  }

  async detect(query: string, brandName: string, brandUrl: string): Promise<{ mentioned: boolean; position: number | null; response: string }> {
    if (!this.apiKey) return { mentioned: false, position: null, response: '[Error] GEMINI_API_KEY 未設定' };
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: query }] }],
            generationConfig: { maxOutputTokens: 1024 },
          }),
        },
      );

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const { mentioned, position } = matchBrand(text, brandName, brandUrl);
      return { mentioned, position, response: text };
    } catch (error) {
      this.logger.error(`Gemini detection failed: ${error}`);
      return { mentioned: false, position: null, response: `[Error] ${error}` };
    }
  }
}
