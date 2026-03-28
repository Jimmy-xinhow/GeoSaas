import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateQaDto } from './dto/create-qa.dto';
import { UpdateQaDto } from './dto/update-qa.dto';

const MAX_QA_PER_SITE = 200;

export interface GeneratedQa {
  question: string;
  answer: string;
  category: string;
}

interface BatchConfig {
  category: string;
  label: string;
  count: number;
  focusPrompt: string;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);
  private anthropic: Anthropic | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.initAnthropicClient();
  }

  private initAnthropicClient() {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    } else {
      this.anthropic = null;
    }
  }

  private async verifySiteOwnership(siteId: string, userId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, userId },
    });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  private async checkLimit(siteId: string, addCount: number = 1) {
    const current = await this.prisma.siteQa.count({ where: { siteId } });
    if (current + addCount > MAX_QA_PER_SITE) {
      throw new BadRequestException(
        `知識庫上限為 ${MAX_QA_PER_SITE} 筆，目前已有 ${current} 筆，無法再新增 ${addCount} 筆`,
      );
    }
  }

  async findAll(siteId: string, userId: string) {
    await this.verifySiteOwnership(siteId, userId);
    return this.prisma.siteQa.findMany({
      where: { siteId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(siteId: string, dto: CreateQaDto, userId: string) {
    await this.verifySiteOwnership(siteId, userId);
    await this.checkLimit(siteId);

    const maxSort = await this.prisma.siteQa.aggregate({
      where: { siteId },
      _max: { sortOrder: true },
    });
    const nextSort = (maxSort._max.sortOrder ?? -1) + 1;

    return this.prisma.siteQa.create({
      data: {
        siteId,
        question: dto.question,
        answer: dto.answer,
        category: dto.category || null,
        sortOrder: nextSort,
      },
    });
  }

  async batchCreate(siteId: string, items: CreateQaDto[], userId: string) {
    await this.verifySiteOwnership(siteId, userId);
    await this.checkLimit(siteId, items.length);

    const maxSort = await this.prisma.siteQa.aggregate({
      where: { siteId },
      _max: { sortOrder: true },
    });
    let nextSort = (maxSort._max.sortOrder ?? -1) + 1;

    const data = items.map((item) => ({
      siteId,
      question: item.question,
      answer: item.answer,
      category: item.category || null,
      sortOrder: nextSort++,
    }));

    await this.prisma.siteQa.createMany({ data });
    return this.findAll(siteId, userId);
  }

  /** Admin bulk import - bypasses ownership check */
  async adminBatchCreate(siteId: string, items: CreateQaDto[]) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');

    const maxSort = await this.prisma.siteQa.aggregate({
      where: { siteId },
      _max: { sortOrder: true },
    });
    let nextSort = (maxSort._max.sortOrder ?? -1) + 1;

    const data = items.map((item) => ({
      siteId,
      question: item.question,
      answer: item.answer,
      category: item.category || null,
      sortOrder: nextSort++,
    }));

    const result = await this.prisma.siteQa.createMany({ data, skipDuplicates: true });
    return { imported: result.count, total: nextSort };
  }

  async update(qaId: string, siteId: string, dto: UpdateQaDto, userId: string) {
    await this.verifySiteOwnership(siteId, userId);
    const qa = await this.prisma.siteQa.findFirst({
      where: { id: qaId, siteId },
    });
    if (!qa) throw new NotFoundException('Q&A not found');
    return this.prisma.siteQa.update({ where: { id: qaId }, data: dto });
  }

  async remove(qaId: string, siteId: string, userId: string) {
    await this.verifySiteOwnership(siteId, userId);
    const qa = await this.prisma.siteQa.findFirst({
      where: { id: qaId, siteId },
    });
    if (!qa) throw new NotFoundException('Q&A not found');
    return this.prisma.siteQa.delete({ where: { id: qaId } });
  }

  private filterLowQuality(items: GeneratedQa[]): GeneratedQa[] {
    const placeholderPattern = /\[.*?\]|XXX|OOO|（請填入）|{.*?}/;
    return items.filter((item) => {
      if (item.question.length < 5) return false;
      if (item.answer.length < 50) return false;
      if (placeholderPattern.test(item.question) || placeholderPattern.test(item.answer)) return false;
      return true;
    });
  }

  // ── AI auto-generation: 5 parallel batches (returns preview, NOT saved to DB) ──
  async aiGenerate(siteId: string, userId: string, excludeQuestions?: string[]): Promise<GeneratedQa[]> {
    const site = await this.verifySiteOwnership(siteId, userId);

    if (!this.anthropic) {
      throw new BadRequestException('AI 功能未啟用（ANTHROPIC_API_KEY 未設定）');
    }

    // Crawl website for context
    let html = '';
    try {
      const response = await fetch(site.url, {
        headers: {
          'User-Agent': 'GEO-SaaS-Scanner/1.0 (+https://geovault.app/bot)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      });
      html = await response.text();
    } catch (err) {
      this.logger.warn(`Failed to crawl ${site.url}: ${err}`);
    }

    // Fetch existing Q&As so AI avoids duplication
    const existing = await this.prisma.siteQa.findMany({
      where: { siteId },
      select: { question: true },
    });
    const existingQuestions = [
      ...existing.map((q: any) => q.question),
      ...(excludeQuestions || []),
    ];

    const truncatedHtml =
      html.length > 6000
        ? html.substring(0, 6000) + '\n... (截斷)'
        : html || '(無法取得網頁內容)';

    // Get site profile for business context
    const profile = (site as any).profile as Record<string, any> | null;

    // Build profile context block
    let profileBlock = '';
    if (profile && Object.keys(profile).length > 0) {
      const lines: string[] = [];
      if (profile.industry) lines.push(`行業: ${profile.industry}`);
      if (profile.description) lines.push(`業務描述: ${profile.description}`);
      if (profile.services) lines.push(`主要服務/產品: ${profile.services}`);
      if (profile.targetAudience) lines.push(`目標客群: ${profile.targetAudience}`);
      if (profile.location) lines.push(`營業地區: ${profile.location}`);
      if (profile.keywords?.length) lines.push(`核心關鍵字: ${profile.keywords.join('、')}`);
      if (profile.uniqueValue) lines.push(`獨特價值/賣點: ${profile.uniqueValue}`);
      if (profile.contactInfo) lines.push(`聯絡資訊: ${profile.contactInfo}`);
      profileBlock = `\n業主基本資訊:\n${lines.join('\n')}`;
    }

    // Define 5 batch focus areas
    const batches: BatchConfig[] = [
      {
        category: 'brand',
        label: '品牌核心',
        count: 12,
        focusPrompt: `聚焦方向：品牌與企業核心
生成關於以下面向的問答：
- 企業/品牌介紹（是什麼、做什麼）
- 核心服務和產品特色
- 品牌故事與理念
- 使用方式和流程
- 營業時間/地點/聯絡方式
- 與競爭對手的差異化優勢`,
      },
      {
        category: 'industry',
        label: '行業知識',
        count: 12,
        focusPrompt: `聚焦方向：所屬行業通識與趨勢
生成關於以下面向的問答（不要只圍繞品牌本身，要擴展到整個行業領域）：
- 行業基礎知識和專業術語解釋
- 行業最新趨勢和發展方向
- 行業標準和規範
- 常見的行業迷思和正確觀念
- 行業的歷史演變
- 該領域的重要概念和原理`,
      },
      {
        category: 'product',
        label: '產品服務',
        count: 12,
        focusPrompt: `聚焦方向：產品/服務的專業深度
生成關於以下面向的問答：
- 產品/服務的技術細節和規格
- 使用教學和最佳實踐
- 保養維護和注意事項
- 產品比較和選擇指南
- 適用場景和案例分享
- 客製化選項和特殊需求`,
      },
      {
        category: 'consumer',
        label: '消費者疑慮',
        count: 12,
        focusPrompt: `聚焦方向：消費者常見疑慮與決策
生成關於以下面向的問答：
- 價格相關問題（費用結構、性價比、優惠）
- 售後服務（保固、退換、維修）
- 付款方式和交易安全
- 購買前的疑慮和擔心
- 與其他選項的比較和優劣
- 實際用戶的體驗和效果`,
      },
      {
        category: 'education',
        label: '教育延伸',
        count: 12,
        focusPrompt: `聚焦方向：教育性與延伸知識科普
生成關於以下面向的問答（用科普的角度，讓讀者學到東西）：
- 「如何選擇」系列指南
- 「注意事項」和「避坑指南」
- 相關領域的科普知識
- DIY 技巧和實用建議
- 環保/永續/健康等延伸話題
- 入門者的引導和常見疑問`,
      },
    ];

    // Run 5 AI calls in parallel
    const batchPromises = batches.map((batch) =>
      this.generateBatch(batch, site, profile, truncatedHtml, profileBlock, existingQuestions),
    );

    const results = await Promise.allSettled(batchPromises);

    // Collect all successful results
    const allGenerated: GeneratedQa[] = [];
    const errors: string[] = [];
    for (const [i, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        allGenerated.push(...result.value);
        this.logger.log(`Batch "${batches[i].label}" generated ${result.value.length} Q&As`);
      } else {
        const errMsg = String(result.reason);
        this.logger.error(`Batch "${batches[i].label}" failed: ${errMsg}`);
        errors.push(errMsg);
      }
    }

    this.logger.log(`Total AI-generated Q&As (before filter): ${allGenerated.length}`);

    // If all batches failed, throw an error with a clear message
    if (allGenerated.length === 0 && errors.length > 0) {
      const firstError = errors[0];
      this.logger.error(`All AI batches failed. First error: ${firstError}`);

      // Credit / billing errors
      const isBilling = errors.some(
        (e) =>
          e.includes('credit balance is too low') ||
          e.includes('billing') ||
          e.includes('insufficient') ||
          e.includes('exceeded your current quota') ||
          e.includes('payment') ||
          (e.includes('402') && e.includes('error')),
      );
      if (isBilling) {
        throw new BadRequestException(
          `AI API 餘額不足或帳單問題，請確認 Anthropic 帳戶餘額。原始錯誤: ${firstError.substring(0, 200)}`,
        );
      }

      // Authentication errors
      const isAuth = errors.some(
        (e) =>
          e.includes('authentication') ||
          e.includes('invalid api key') ||
          e.includes('invalid x-api-key') ||
          e.includes('unauthorized') ||
          e.includes('401') ||
          e.includes('AuthenticationError') ||
          e.includes('permission'),
      );
      if (isAuth) {
        throw new BadRequestException(
          `AI API 金鑰無效或已過期，請確認 ANTHROPIC_API_KEY 是否正確，並重啟伺服器。原始錯誤: ${firstError.substring(0, 200)}`,
        );
      }

      // Rate limit errors
      const isRateLimit = errors.some(
        (e) =>
          e.includes('rate_limit') ||
          e.includes('rate limit') ||
          e.includes('429') ||
          e.includes('too many requests') ||
          e.includes('overloaded'),
      );
      if (isRateLimit) {
        throw new BadRequestException(
          'AI API 請求過於頻繁，請稍等 1-2 分鐘後再試',
        );
      }

      throw new BadRequestException(
        `AI 生成失敗: ${firstError.substring(0, 200)}`,
      );
    }

    const filtered = this.filterLowQuality(allGenerated);
    this.logger.log(`After quality filter: ${filtered.length}/${allGenerated.length}`);
    return filtered;
  }

  private async generateBatch(
    batch: BatchConfig,
    site: { name: string; url: string },
    profile: Record<string, any> | null,
    truncatedHtml: string,
    profileBlock: string,
    existingQuestions: string[],
  ): Promise<GeneratedQa[]> {
    const prompt = `分析以下網站和業務資訊，生成 ${batch.count} 個高品質的常見問答。

網站名稱: ${site.name}
網站網址: ${site.url}
${profileBlock}

網站 HTML 內容（部分）:
${truncatedHtml}

${existingQuestions.length > 0 ? `已有的問題（請勿重複）:\n${existingQuestions.map((q) => `- ${q}`).join('\n')}\n` : ''}
${batch.focusPrompt}

要求：
1. 問題要貼近真實用戶會在 Google、ChatGPT、Perplexity 等搜尋或詢問的內容
2. 答案要具體、有價值、資訊豐富，結合網站實際資訊${profile ? '和業主提供的基本資料' : ''}
3. 每個答案 100-350 字，確保足夠詳細能被 AI 引用
4. 使用繁體中文
5. 答案風格專業但易懂，適合被 AI 搜尋引擎引用作為權威來源
6. 問題要多元化，覆蓋面要廣，不要侷限在品牌本身
7. 絕對不要跟已有的問題重複

只輸出 JSON 陣列: [{"question": "...", "answer": "..."}, ...]`;

    const response = await this.anthropic!.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system:
        `你是 GEO（Generative Engine Optimization）內容策略師，專精於「${batch.label}」面向的知識庫建構。` +
        '你的目標是生成能被 AI 搜尋引擎（ChatGPT、Claude、Perplexity、Gemini、Copilot）引用的高品質 Q&A。' +
        '只輸出有效的 JSON 陣列，不要其他文字。',
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    let text = textBlock?.text?.trim() || '[]';
    text = text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

    try {
      const parsed: { question: string; answer: string }[] = JSON.parse(text);
      return parsed.map((item) => ({
        question: item.question,
        answer: item.answer,
        category: batch.category,
      }));
    } catch {
      this.logger.error(`Failed to parse AI response for batch "${batch.label}"`);
      return [];
    }
  }
}
