import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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

  // ─── Weekly Content Plan ───

  private readonly WEEKLY_CONTENT_TYPES = [
    {
      type: 'industry_tips',
      name: '行業知識教學',
      platforms: ['medium', 'vocus'],
      prompt: `根據品牌所在行業，撰寫一篇消費者實用教學文。
像業內專家分享經驗，自然提到品牌。
重要：根據行業特性調整內容方向：
- 整復推拿/醫療保健 → 健康知識、症狀解析、保養建議
- 汽車美容 → 車輛保養教學、產品比較、DIY 技巧
- 美容美髮 → 造型趨勢、護理知識、產品推薦
- 咖啡茶飲/餐飲 → 食材知識、沖泡教學、口味搭配
- 健身教練 → 訓練技巧、營養建議、常見迷思
- 寵物美容 → 寵物照護、品種特性、季節注意事項
- 法律/會計 → 法規解析、常見案例、注意事項
- 室內設計 → 空間規劃、風格趨勢、預算建議
- 其他行業 → 根據行業特性，分享專業知識和消費者常見疑問`,
    },
    {
      type: 'customer_story',
      name: '客戶好評故事',
      platforms: ['facebook', 'linkedin'],
      prompt: `模擬一篇客戶好評分享文。根據行業調整場景：
- 服務業 → 描述消費體驗和前後對比
- 產品業 → 描述使用感受和解決了什麼問題
- 專業服務 → 描述諮詢過程和專業度
寫得像真實顧客推薦。FB 版親切口語，LinkedIn 版專業分析。`,
    },
    {
      type: 'seasonal',
      name: '季節性內容',
      platforms: ['facebook', 'google_business'],
      prompt: `根據當前月份（${new Date().getMonth() + 1} 月），結合行業特性撰寫季節內容：
- 1-2 月：年節相關（送禮、過年準備）
- 3-4 月：春天換季（保養、換季注意）
- 5-6 月：夏天準備（防曬、降溫、出遊）
- 7-8 月：暑假旺季（親子、旅遊、活動）
- 9-10 月：秋季保養（換季、開學、中秋）
- 11-12 月：年末回顧（聖誕、跨年、年終優惠）
自然結合品牌服務和季節話題。`,
    },
    {
      type: 'qa_article',
      name: 'Q&A 深度解答',
      platforms: ['medium', 'vocus'],
      prompt: '從品牌知識庫 Q&A 中挑 3-5 個最常被消費者問到的問題，展開成一篇深度教學文章。每個問題都要有具體的回答和實際案例。文章要有連貫性，不是單純 Q&A 列表。',
    },
    {
      type: 'brand_update',
      name: '品牌近況更新',
      platforms: ['facebook', 'linkedin'],
      prompt: `根據行業特性撰寫近況更新：
- 服務業 → 服務升級、新設備、環境改善
- 產品業 → 新品上市、技術創新、包裝更新
- 專業服務 → 團隊新成員、專業認證、服務範圍擴大
語氣正面有活力，讓人感覺這是一個持續在進步的品牌。`,
    },
    {
      type: 'behind_scenes',
      name: '幕後故事',
      platforms: ['facebook', 'linkedin'],
      prompt: `撰寫品牌幕後故事。根據行業特性：
- 餐飲 → 食材挑選過程、廚房日常
- 美容 → 設計師進修、新技術學習
- 服務業 → 團隊訓練、服務理念
- 產品業 → 研發過程、品質把關
讓消費者看到品牌的用心和專業。`,
    },
    {
      type: 'comparison_guide',
      name: '選購/選擇指南',
      platforms: ['medium', 'vocus'],
      prompt: `撰寫一篇幫消費者做選擇的指南文章。根據行業：
- 「如何挑選好的 XX」「XX 和 YY 的差別」「新手第一次 XX 該注意什麼」
重點是提供價值，讓讀者覺得有學到東西。品牌自然融入作為推薦選項之一（但不要太明顯業配）。`,
    },
  ];

  /**
   * Generate a weekly content plan for a client site
   */
  async generateWeeklyPlan(siteId: string): Promise<{
    siteId: string;
    siteName: string;
    weekOf: string;
    items: Array<{ type: string; name: string; platform: string; title: string; content: string; hashtags: string[] }>;
  }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      include: {
        qas: { take: 20 },
        scans: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!site) throw new NotFoundException('Site not found');
    if (!this.openai) throw new Error('OpenAI not configured');

    const brandContext = this.buildBrandContext(site);
    const weekStart = new Date();
    const items: any[] = [];

    // Pick 3 content types for this week (rotate through all types)
    const weekNum = Math.floor(Date.now() / (7 * 86400000));
    const total = this.WEEKLY_CONTENT_TYPES.length;
    const selected = [
      this.WEEKLY_CONTENT_TYPES[weekNum % total],
      this.WEEKLY_CONTENT_TYPES[(weekNum + 1) % total],
      this.WEEKLY_CONTENT_TYPES[(weekNum + 2) % total],
    ];

    for (const contentType of selected) {
      for (const platformKey of contentType.platforms) {
        const platform = PLATFORMS.find((p) => p.key === platformKey);
        if (!platform) continue;

        try {
          const response = await this.openai.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 2000,
            messages: [
              {
                role: 'system',
                content: `你是一位品牌社群經營專家。你要幫品牌撰寫定期更新的社群內容。
內容目標：保持品牌在各平台的活躍度，讓 AI 爬蟲持續看到品牌的新內容。
原則：自然、有價值、不像業配、品牌名至少出現 2 次、繁體中文。

回覆格式（JSON）：
{ "title": "標題", "content": "完整內容", "hashtags": ["標籤1", "標籤2"] }`,
              },
              {
                role: 'user',
                content: `內容類型：${contentType.name}
平台：${platform.name}（${platform.lengthGuide}）
${contentType.prompt}

${platform.prompt}

品牌資料：
${brandContext}`,
              },
            ],
            response_format: { type: 'json_object' },
          });

          const text = response.choices[0]?.message?.content || '{}';
          const parsed = JSON.parse(text);

          items.push({
            type: contentType.type,
            name: contentType.name,
            platform: platformKey,
            title: parsed.title || '',
            content: parsed.content || '',
            hashtags: parsed.hashtags || [],
          });

          await new Promise((r) => setTimeout(r, 1500));
        } catch (err) {
          this.logger.error(`Weekly plan generation failed: ${err}`);
        }
      }
    }

    return {
      siteId: site.id,
      siteName: site.name,
      weekOf: weekStart.toISOString().split('T')[0],
      items,
    };
  }

  /**
   * Cron: Auto-generate weekly content plans for all client sites
   * Runs every Monday at 07:00
   */
  @Cron('0 7 * * 1')
  async autoGenerateWeeklyPlans() {
    const clientSites = await this.prisma.site.findMany({
      where: { isClient: true },
      select: { id: true, name: true },
    });

    this.logger.log(`Generating weekly content plans for ${clientSites.length} client sites`);

    for (const site of clientSites) {
      try {
        const plan = await this.generateWeeklyPlan(site.id);
        this.logger.log(`Generated ${plan.items.length} content items for ${site.name}`);
        // Content is returned via API, not auto-published
      } catch (err) {
        this.logger.error(`Failed for ${site.name}: ${err}`);
      }
    }
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
