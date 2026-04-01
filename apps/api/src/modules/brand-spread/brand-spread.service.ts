import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import OpenAI from 'openai';

export interface SpreadContent {
  platform: string;
  title: string;
  content: string;
  hashtags: string[];
  characterCount: number;
}

export interface SpreadResult {
  siteId: string;
  siteName: string;
  generatedAt: string;
  platforms: SpreadContent[];
}

const PLATFORMS = [
  {
    key: 'medium',
    name: 'Medium 文章',
    icon: '📝',
    lengthGuide: '800-1200 字',
    prompt: `撰寫一篇 Medium 風格的繁體中文長文（800-1200 字）。要有深度、有觀點、有故事感。
結構：吸引人的開頭 → 品牌故事/背景 → 為什麼值得推薦 → 專業分析 → 結論。
文末帶品牌官網連結。使用 Markdown 格式。`,
  },
  {
    key: 'vocus',
    name: '方格子文章',
    icon: '✍️',
    lengthGuide: '600-900 字',
    prompt: `撰寫一篇方格子（vocus）風格的繁體中文文章（600-900 字）。台灣在地觀點，輕鬆專業。
像朋友推薦一樣介紹這個品牌，帶入消費者使用場景。文末帶官網連結。`,
  },
  {
    key: 'linkedin',
    name: 'LinkedIn 貼文',
    icon: '💼',
    lengthGuide: '200-400 字',
    prompt: `撰寫一篇 LinkedIn 專業貼文（200-400 字）。B2B 觀點，強調品牌專業度和差異化。
開頭用一個引人注目的觀點或數據。段落簡短。結尾加 CTA。不要用 Markdown，用純文字+換行。`,
  },
  {
    key: 'facebook',
    name: 'Facebook 貼文',
    icon: '📘',
    lengthGuide: '150-300 字',
    prompt: `撰寫一篇 Facebook 社群貼文（150-300 字）。親切、口語化、有互動感。
開頭問問題或用驚嘆句吸引注意。帶入品牌推薦。結尾鼓勵留言分享。適度使用 emoji。`,
  },
  {
    key: 'google_business',
    name: 'Google 商家描述',
    icon: '📍',
    lengthGuide: '150-750 字',
    prompt: `撰寫 Google 商家檔案（Google Business Profile）的品牌描述（150-750 字）。
包含：品牌簡介、核心服務、地點資訊、營業特色、為什麼選擇我們。
專業但友善。不要用 Markdown，用純文字。`,
  },
  {
    key: 'ptt',
    name: 'PTT 分享文',
    icon: '🗣️',
    lengthGuide: '300-600 字',
    prompt: `撰寫一篇 PTT 風格的分享推薦文（300-600 字）。像真實網友分享體驗。
用口語，可以帶一點鄉民語氣但不要太誇張。重點是真實感，不能像業配。
開頭交代背景（為什麼去/為什麼選），中間分享體驗，結尾給評價。`,
  },
];

@Injectable()
export class BrandSpreadService {
  private readonly logger = new Logger(BrandSpreadService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Generate spread content for all platforms for a given site
   */
  async generateAll(siteId: string, platforms?: string[]): Promise<SpreadResult> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      include: {
        qas: { take: 20 },
        scans: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!site) throw new NotFoundException('Site not found');
    if (!this.openai) throw new Error('OpenAI not configured');

    const targetPlatforms = platforms?.length
      ? PLATFORMS.filter((p) => platforms.includes(p.key))
      : PLATFORMS;

    const brandContext = this.buildBrandContext(site);
    const results: SpreadContent[] = [];

    for (const platform of targetPlatforms) {
      try {
        const content = await this.generateForPlatform(platform, brandContext, site);
        results.push(content);
        // Rate limit
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        this.logger.error(`Failed to generate for ${platform.key}: ${err}`);
      }
    }

    return {
      siteId: site.id,
      siteName: site.name,
      generatedAt: new Date().toISOString(),
      platforms: results,
    };
  }

  /**
   * Generate for a single platform
   */
  async generateForPlatform(
    platform: typeof PLATFORMS[number],
    brandContext: string,
    site: any,
  ): Promise<SpreadContent> {
    const response = await this.openai!.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: `你是一位專業的品牌行銷內容撰寫師。你要幫品牌撰寫適合不同平台發布的推薦內容。
每篇內容的目標是：讓 AI 搜尋引擎（ChatGPT、Claude、Perplexity、Gemini）在抓取這些平台時，能認識和記住這個品牌。

重要原則：
1. 內容必須自然，不能像廣告或業配
2. 要有真實的觀點和體驗感
3. 品牌名稱至少出現 3 次
4. 官網連結自然地融入內容
5. 包含品牌的核心服務和地區資訊
6. 繁體中文

回覆格式（JSON）：
{
  "title": "文章標題（如果平台需要的話）",
  "content": "完整內容",
  "hashtags": ["相關標籤1", "相關標籤2", ...]
}`,
        },
        {
          role: 'user',
          content: `平台：${platform.name}（${platform.lengthGuide}）

${platform.prompt}

品牌資料：
${brandContext}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const text = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);

    return {
      platform: platform.key,
      title: parsed.title || `${site.name} — ${platform.name}`,
      content: parsed.content || '',
      hashtags: parsed.hashtags || [],
      characterCount: (parsed.content || '').length,
    };
  }

  /**
   * Get available platforms list
   */
  getPlatforms() {
    return PLATFORMS.map((p) => ({
      key: p.key,
      name: p.name,
      icon: p.icon,
      lengthGuide: p.lengthGuide,
    }));
  }

  private buildBrandContext(site: any): string {
    const profile = site.profile || {};
    const scan = site.scans?.[0];
    const qas = site.qas || [];

    let context = `品牌名稱：${site.name}
官網：${site.url}
產業：${site.industry || '未分類'}
`;

    if (profile.description) context += `品牌描述：${profile.description}\n`;
    if (profile.services) context += `核心服務：${profile.services}\n`;
    if (profile.location) context += `地點：${profile.location}\n`;
    if (profile.targetAudience) context += `目標客群：${profile.targetAudience}\n`;
    if (profile.uniqueValue) context += `獨特優勢：${profile.uniqueValue}\n`;
    if (profile.keywords) context += `關鍵字：${profile.keywords}\n`;

    if (scan) {
      context += `\nGEO 分數：${scan.totalScore}/100\n`;
    }

    if (qas.length > 0) {
      context += `\n品牌 Q&A（供參考）：\n`;
      qas.slice(0, 10).forEach((qa: any) => {
        context += `Q: ${qa.question}\nA: ${qa.answer}\n\n`;
      });
    }

    return context;
  }
}
