import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GeminiDetector {
  private apiKey: string;
  private logger = new Logger(GeminiDetector.name);

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get('GEMINI_API_KEY') || '';
  }

  async detect(query: string, brandName: string, brandUrl: string): Promise<{ mentioned: boolean; position: number | null; response: string }> {
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
      const mentioned = text.toLowerCase().includes(brandName.toLowerCase()) || text.includes(brandUrl);

      let position: number | null = null;
      if (mentioned) {
        const idx = text.toLowerCase().indexOf(brandName.toLowerCase());
        position = Math.ceil((idx / text.length) * 10);
      }

      return { mentioned, position, response: text };
    } catch (error) {
      this.logger.error(`Gemini detection failed: ${error}`);
      return { mentioned: false, position: null, response: `[Error] ${error}` };
    }
  }
}
