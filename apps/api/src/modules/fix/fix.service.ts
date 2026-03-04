import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { JsonLdGenerator } from './generators/json-ld.generator';
import { LlmsTxtGenerator } from './generators/llms-txt.generator';
import { OgTagsGenerator } from './generators/og-tags.generator';
import { FaqSchemaGenerator } from './generators/faq-schema.generator';
import { GenerateJsonLdDto } from './dto/generate-json-ld.dto';
import { GenerateLlmsTxtDto } from './dto/generate-llms-txt.dto';
import { GenerateOgTagsDto } from './dto/generate-og-tags.dto';

const SUPPORTED_SMART_INDICATORS = new Set([
  'json_ld',
  'og_tags',
  'llms_txt',
  'faq_schema',
]);

@Injectable()
export class FixService {
  private readonly logger = new Logger(FixService.name);
  private anthropic: Anthropic | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jsonLdGen: JsonLdGenerator,
    private readonly llmsTxtGen: LlmsTxtGenerator,
    private readonly ogTagsGen: OgTagsGenerator,
    private readonly faqSchemaGen: FaqSchemaGenerator,
  ) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    }
  }

  // ── Legacy template-based generators (kept for backward compatibility) ──

  generateJsonLd(data: GenerateJsonLdDto) {
    return { code: this.jsonLdGen.generate(data), language: 'html' };
  }

  generateLlmsTxt(data: GenerateLlmsTxtDto) {
    return { code: this.llmsTxtGen.generate(data), language: 'text' };
  }

  generateOgTags(data: GenerateOgTagsDto) {
    return { code: this.ogTagsGen.generate(data), language: 'html' };
  }

  generateFaqSchema(faqs: { question: string; answer: string }[]) {
    return { code: this.faqSchemaGen.generate(faqs), language: 'html' };
  }

  // ── AI-powered smart generation ──

  async smartGenerate(siteId: string, indicator: string, scanResultId: string) {
    if (!SUPPORTED_SMART_INDICATORS.has(indicator)) {
      throw new NotFoundException(`Indicator "${indicator}" does not support smart generation`);
    }

    // 1. Fetch site info (including profile)
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, url: true, profile: true },
    });
    if (!site) throw new NotFoundException('Site not found');

    // 2. Fetch scan result details (contains data from original scan)
    const scanResult = await this.prisma.scanResult.findUnique({
      where: { id: scanResultId },
    });
    if (!scanResult) throw new NotFoundException('Scan result not found');

    // 3. Crawl the website to get current HTML
    let html = '';
    try {
      const response = await fetch(site.url, {
        headers: {
          'User-Agent': 'GEO-SaaS-Scanner/1.0 (+https://geo-saas.com/bot)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      });
      html = await response.text();
    } catch (err) {
      this.logger.warn(`Failed to crawl ${site.url}: ${err}`);
      // Continue with empty HTML – AI will work with scan details only
    }

    // 4. Fetch knowledge base Q&As for this site
    const qas = await this.prisma.siteQa.findMany({
      where: { siteId },
      orderBy: { sortOrder: 'asc' },
      take: 100,
    });

    // 5. Generate code using AI (or fallback to template)
    let code: string;
    const language = indicator === 'llms_txt' ? 'text' : 'html';

    if (this.anthropic) {
      code = await this.generateWithAi(indicator, site, scanResult.details, html, qas, (site as any).profile);
    } else {
      this.logger.warn('ANTHROPIC_API_KEY not configured, falling back to template generator');
      code = this.generateWithTemplate(indicator, site);
    }

    // 6. Auto-save to DB
    await this.prisma.scanResult.update({
      where: { id: scanResultId },
      data: { generatedCode: code },
    });

    return { code, language };
  }

  private async generateWithAi(
    indicator: string,
    site: { name: string; url: string },
    details: any,
    html: string,
    qas: { question: string; answer: string }[] = [],
    profile: Record<string, any> | null = null,
  ): Promise<string> {
    const prompt = this.buildSmartPrompt(indicator, site, details, html, qas, profile);

    try {
      const response = await this.anthropic!.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system:
          '你是一位專業的 SEO 工程師。根據網站的實際內容分析並產生修復程式碼。' +
          '只輸出程式碼本身，不要包含任何說明文字、markdown 標記（如 ```）或其他額外內容。',
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      let code = textBlock?.text?.trim() || '';

      // Strip markdown code fences if AI accidentally wraps them
      code = code.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

      return code;
    } catch (error) {
      const errMsg = String(error);
      this.logger.error(`AI code generation failed: ${errMsg}`);

      if (
        errMsg.includes('credit balance is too low') ||
        errMsg.includes('billing') ||
        errMsg.includes('insufficient') ||
        errMsg.includes('402')
      ) {
        throw new BadRequestException(
          `AI API 餘額不足，請確認 Anthropic 帳戶餘額。原始錯誤: ${errMsg.substring(0, 200)}`,
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
          `AI API 金鑰無效，請確認 ANTHROPIC_API_KEY 並重啟伺服器。原始錯誤: ${errMsg.substring(0, 200)}`,
        );
      }

      // Fallback to template generation
      this.logger.warn('AI generation failed, falling back to template');
      return this.generateWithTemplate(indicator, site);
    }
  }

  private generateWithTemplate(
    indicator: string,
    site: { name: string; url: string },
  ): string {
    switch (indicator) {
      case 'json_ld':
        return this.jsonLdGen.generate({
          type: 'Organization',
          name: site.name,
          url: site.url,
        });
      case 'llms_txt':
        return this.llmsTxtGen.generate({
          title: site.name,
          description: `${site.name} 的官方網站`,
          url: site.url,
        });
      case 'og_tags':
        return this.ogTagsGen.generate({
          title: site.name,
          description: `${site.name} 的官方網站`,
          url: site.url,
        });
      case 'faq_schema':
        return this.faqSchemaGen.generate([
          {
            question: `什麼是 ${site.name}？`,
            answer: `${site.name} 是一個位於 ${site.url} 的網站。`,
          },
        ]);
      default:
        return '';
    }
  }

  private buildSmartPrompt(
    indicator: string,
    site: { name: string; url: string },
    details: any,
    html: string,
    qas: { question: string; answer: string }[] = [],
    profile: Record<string, any> | null = null,
  ): string {
    // Reduce HTML budget when knowledge base has content
    const htmlBudget = qas.length > 0 ? 6000 : 8000;
    const truncatedHtml = this.truncateHtml(html, htmlBudget);
    const detailsStr = JSON.stringify(details, null, 2);

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
      profileBlock = `\n業主基本資訊:\n${lines.join('\n')}\n`;
    }

    // Build knowledge base context block
    let knowledgeBlock = '';
    if (qas.length > 0) {
      const qaText = qas
        .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
        .join('\n\n');
      knowledgeBlock = `\n網站知識庫（業主提供的真實 Q&A 資料，共 ${qas.length} 筆）:\n${qaText}\n\n重要：請優先使用知識庫中的真實資料來生成內容，而非自行推測。`;
    }

    const baseContext = [
      `網站名稱: ${site.name}`,
      `網站網址: ${site.url}`,
      profileBlock,
      `掃描結果詳情:`,
      detailsStr,
      knowledgeBlock,
      '',
      `網站 HTML 內容（部分）:`,
      truncatedHtml,
    ].join('\n');

    switch (indicator) {
      case 'json_ld':
        return `${baseContext}

請分析這個網站的實際內容，產生最適合的 JSON-LD 結構化資料。

要求：
1. 根據網站內容判斷最適合的 Schema.org 類型（Organization、LocalBusiness、Restaurant、WebSite、Product 等）
2. 從網頁內容中提取真實的名稱、描述、聯絡資訊、地址、營業時間等
3. 如果頁面有 logo 圖片，加入 logo 欄位
4. 如果有社群連結，加入 sameAs 欄位
5. 內容使用繁體中文（如網站為中文）
6. 輸出完整的 <script type="application/ld+json"> 標籤

只輸出 HTML 程式碼。`;

      case 'og_tags':
        return `${baseContext}

請分析這個網站的實際內容，產生完整的 Open Graph 標籤。

要求：
1. 從網頁實際內容提取有意義的標題和描述（不要使用"的官方網站"等空洞描述）
2. 描述應該簡潔有力，適合社群分享時顯示（70-160 字元）
3. 如果頁面有代表性圖片，加入 og:image
4. 必須包含 og:title、og:description、og:url、og:type、og:site_name
5. 繁體中文內容

只輸出 HTML meta 標籤（每行一個 <meta> 標籤）。`;

      case 'llms_txt':
        return `${baseContext}

請分析這個網站的實際內容，產生完整的 llms.txt 檔案。

要求：
1. 標題使用網站實際名稱
2. 描述應該從網站內容中提取真實的業務描述（不是空洞的"的官方網站"）
3. 從頁面中的連結提取重要頁面（如「關於我們」「服務」「產品」「聯絡」等），列入 Important Pages 區塊
4. 格式遵循 llms.txt 標準規範（# 標題 > 描述 ## 區塊）
5. 繁體中文內容

只輸出 llms.txt 的純文字內容，不要任何 HTML 標籤。`;

      case 'faq_schema':
        return `${baseContext}

請產生適合的 FAQ Schema 結構化資料。

要求：
${qas.length > 0 ? `1. 知識庫已包含 ${qas.length} 筆真實 Q&A，請直接使用這些問答作為 FAQ Schema 的內容（可適當潤飾但不要改變核心資訊）
2. 從知識庫中選取最適合的 5-10 筆問答` : `1. 根據網站實際提供的產品、服務、內容，生成 5-8 個有意義的常見問題
2. 問題要貼近真實用戶會問的問題`}
3. 答案要詳細有幫助
4. 使用繁體中文
5. 輸出完整的 <script type="application/ld+json"> FAQ Schema

只輸出 HTML 程式碼。`;

      default:
        return `${baseContext}\n\n請為 ${indicator} 指標生成修復程式碼。`;
    }
  }

  private truncateHtml(html: string, maxLength: number): string {
    if (!html) return '(無法取得網頁內容)';
    if (html.length <= maxLength) return html;

    // Try to keep full <head> section
    const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
    const head = headMatch ? headMatch[0] : '';

    // Get body content
    const bodyMatch = html.match(/<body[\s\S]*/i);
    const bodyStart = bodyMatch ? bodyMatch[0] : html;

    const remaining = maxLength - head.length;
    if (remaining > 500) {
      return head + '\n' + bodyStart.substring(0, remaining) + '\n... (內容已截斷)';
    }

    return html.substring(0, maxLength) + '\n... (內容已截斷)';
  }

  // ── Apply fix ──

  async applyFix(scanResultId: string, generatedCode: string) {
    const scanResult = await this.prisma.scanResult.findUnique({
      where: { id: scanResultId },
    });

    if (!scanResult) {
      throw new NotFoundException(`ScanResult with id "${scanResultId}" not found`);
    }

    const updated = await this.prisma.scanResult.update({
      where: { id: scanResultId },
      data: { generatedCode },
    });

    return {
      id: updated.id,
      indicator: updated.indicator,
      generatedCode: updated.generatedCode,
      message: 'Fix applied successfully',
    };
  }
}
