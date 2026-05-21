import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { assertSiteAccess } from '../../common/auth/site-access';
import { FixService } from '../fix/fix.service';

const INDICATOR_META: Record<string, { label: string; weight: number; plain: string; canAutoFix: boolean }> = {
  json_ld: {
    label: 'JSON-LD 結構化資料',
    weight: 15,
    plain: '讓 AI 更容易理解品牌、組織、服務與網站主體。',
    canAutoFix: true,
  },
  llms_txt: {
    label: 'llms.txt',
    weight: 20,
    plain: '提供 AI 爬蟲一份可直接讀取的品牌說明與重要頁面索引。',
    canAutoFix: true,
  },
  faq_schema: {
    label: 'FAQ Schema',
    weight: 15,
    plain: '把常見問題轉成 AI 和搜尋引擎都能讀懂的問答結構。',
    canAutoFix: true,
  },
  og_tags: {
    label: 'Open Graph 標籤',
    weight: 10,
    plain: '補齊頁面標題、描述與分享語意，降低 AI 摘錄錯誤。',
    canAutoFix: true,
  },
  meta_description: {
    label: 'Meta Description',
    weight: 10,
    plain: '補上首頁摘要，讓 AI 和搜尋結果更快抓到品牌定位。',
    canAutoFix: true,
  },
  title_optimization: {
    label: '標題優化',
    weight: 10,
    plain: '讓頁面標題更清楚描述品牌與服務。',
    canAutoFix: false,
  },
  contact_info: {
    label: '聯絡資訊',
    weight: 10,
    plain: '增加品牌真實性訊號，協助 AI 判斷可信度。',
    canAutoFix: false,
  },
  image_alt: {
    label: '圖片 Alt',
    weight: 10,
    plain: '讓 AI 能理解圖片內容與品牌服務脈絡。',
    canAutoFix: false,
  },
  robots_ai: {
    label: 'AI 爬蟲權限',
    weight: 15,
    plain: '確認 robots.txt 沒有擋掉重要 AI 或搜尋爬蟲。',
    canAutoFix: false,
  },
};

const FIX_ORDER = ['llms_txt', 'json_ld', 'faq_schema', 'og_tags', 'meta_description'];

type LatestScan = {
  id: string;
  totalScore: number;
  completedAt: Date | null;
  createdAt: Date;
  results: Array<{
    id: string;
    indicator: string;
    score: number;
    status: string;
    suggestion: string | null;
    autoFixable: boolean;
    generatedCode: string | null;
  }>;
};

type SiteContext = {
  id: string;
  name: string;
  url: string;
  industry: string | null;
  bestScore: number | null;
  tier: string | null;
  profile: unknown;
  llmsTxt: string | null;
  crawlerToken: string | null;
  qas: Array<{ question: string; answer: string }>;
};

@Injectable()
export class GuidedFixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fixService: FixService,
  ) {}

  async getPlan(siteId: string, userId: string, role?: string) {
    await assertSiteAccess(this.prisma, siteId, userId, role);
    const { site, latestScan } = await this.getSiteAndLatestScan(siteId);

    const issues = this.buildIssues(latestScan);
    const quickWins = issues
      .filter((issue) => issue.canAutoFix)
      .sort((a, b) => this.fixSort(a.indicator) - this.fixSort(b.indicator))
      .slice(0, 5);
    const manualItems = issues.filter((issue) => !issue.canAutoFix);
    const estimatedGain = Math.min(
      100 - latestScan.totalScore,
      quickWins.reduce((sum, issue) => sum + issue.estimatedGain, 0),
    );

    const missingBrandFacts = this.missingBrandFacts(site);
    const recommendedPath = this.chooseRecommendedPath(site, quickWins, manualItems);

    return {
      site: this.publicSite(site),
      scan: {
        id: latestScan.id,
        score: latestScan.totalScore,
        completedAt: latestScan.completedAt ?? latestScan.createdAt,
      },
      headline: {
        title: `${site.name} 最快可提升 ${estimatedGain} 分`,
        currentScore: latestScan.totalScore,
        estimatedScore: Math.min(100, latestScan.totalScore + estimatedGain),
        estimatedMinutes: quickWins.length > 0 ? 5 : 15,
        quickWinCount: quickWins.length,
        manualCount: manualItems.length,
      },
      recommendedPath,
      paths: [
        {
          key: 'wordpress',
          title: '我用 WordPress',
          description: '安裝外掛後，由 Geovault 下發 JSON-LD、llms.txt、FAQ Schema、Badge 與追蹤碼。',
          effort: '約 5 分鐘',
          cta: '前往 CMS 一鍵修復',
          href: `/sites/${site.id}/cms-fix`,
          recommended: recommendedPath === 'wordpress',
        },
        {
          key: 'engineer',
          title: '我有工程師',
          description: '產生完整安裝包，工程師照檔案貼上即可，不需要理解 GEO 細節。',
          effort: '約 10 分鐘',
          cta: '產生工程師修復包',
          href: `/sites/${site.id}/guided-fix#handoff`,
          recommended: recommendedPath === 'engineer',
        },
        {
          key: 'done_for_you',
          title: '我完全不會',
          description: '把修復包交給 Geovault 支援，改完後重新掃描並交付完成報告。',
          effort: '交給我們處理',
          cta: '聯絡代裝',
          href: '/support',
          recommended: recommendedPath === 'done_for_you',
        },
      ],
      quickWins,
      manualItems,
      missingBrandFacts,
      paymentTrigger: {
        title: '付費後最先完成這些事',
        bullets: [
          '產生可直接安裝的 AI 可讀結構',
          '下發到 WordPress 或輸出給工程師',
          '重新掃描並產生分數提升報告',
          '開啟每週監控與後續缺口提醒',
        ],
      },
    };
  }

  async getEngineerHandoff(siteId: string, userId: string, role?: string) {
    await assertSiteAccess(this.prisma, siteId, userId, role);
    const { site, latestScan } = await this.getSiteAndLatestScan(siteId);
    const files = this.buildHandoffFiles(site, latestScan);
    const issues = this.buildIssues(latestScan);
    const quickWins = issues.filter((issue) => issue.canAutoFix);
    const estimatedGain = Math.min(
      100 - latestScan.totalScore,
      quickWins.reduce((sum, issue) => sum + issue.estimatedGain, 0),
    );

    return {
      site: this.publicSite(site),
      generatedAt: new Date().toISOString(),
      summary: {
        currentScore: latestScan.totalScore,
        estimatedScore: Math.min(100, latestScan.totalScore + estimatedGain),
        installTime: '10-20 分鐘',
        files: files.length,
      },
      instructions: [
        '把 head.html 內容貼到全站 <head>。',
        '把 footer.html 內容貼到全站 </body> 前。',
        '把 llms.txt 放到網站根目錄 /llms.txt。',
        '若可修改 robots.txt，加入 robots.txt 建議段落。',
        '完成後回到 Geovault 重新掃描並查看完成報告。',
      ],
      files,
    };
  }

  async getCompletionReport(siteId: string, userId: string, role?: string) {
    await assertSiteAccess(this.prisma, siteId, userId, role);

    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        bestScore: true,
        tier: true,
        llmsTxt: true,
        crawlerVisits: {
          where: { isSeeded: false },
          orderBy: { visitedAt: 'desc' },
          take: 5,
          select: { botName: true, url: true, visitedAt: true },
        },
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
          take: 2,
          include: { results: true },
        },
      },
    });
    if (!site) throw new NotFoundException('Site not found');

    const latest = site.scans[0];
    if (!latest) throw new NotFoundException('No completed scan found for this site');
    const previous = site.scans[1] ?? null;

    const latestByIndicator = new Map(latest.results.map((result: any) => [result.indicator, result]));
    const previousByIndicator = new Map((previous?.results ?? []).map((result: any) => [result.indicator, result]));
    const resolved = Array.from(latestByIndicator.values())
      .filter((result: any) => result.status === 'pass')
      .filter((result: any) => {
        const before = previousByIndicator.get(result.indicator) as any;
        return !before || before.status !== 'pass';
      })
      .map((result: any) => this.resultSummary(result));

    const remaining = Array.from(latestByIndicator.values())
      .filter((result: any) => result.status !== 'pass' || result.score < 90)
      .map((result: any) => this.resultSummary(result));

    return {
      site: this.publicSite(site),
      latestScan: {
        id: latest.id,
        score: latest.totalScore,
        completedAt: latest.completedAt ?? latest.createdAt,
      },
      previousScan: previous
        ? {
            id: previous.id,
            score: previous.totalScore,
            completedAt: previous.completedAt ?? previous.createdAt,
          }
        : null,
      scoreDelta: previous ? latest.totalScore - previous.totalScore : 0,
      resolved,
      remaining,
      verification: [
        {
          key: 'llms_txt',
          label: '/llms.txt 可讀',
          passed: latestByIndicator.get('llms_txt')?.status === 'pass' || Boolean(site.llmsTxt),
        },
        {
          key: 'json_ld',
          label: 'JSON-LD 已被掃描到',
          passed: latestByIndicator.get('json_ld')?.status === 'pass',
        },
        {
          key: 'faq_schema',
          label: 'FAQ Schema 已被掃描到',
          passed: latestByIndicator.get('faq_schema')?.status === 'pass',
        },
        {
          key: 'crawler',
          label: 'AI 爬蟲追蹤已有真實紀錄',
          passed: site.crawlerVisits.length > 0,
        },
      ],
      crawlerVisits: site.crawlerVisits,
      nextSteps: remaining.slice(0, 3).map((item) => item.nextStep),
    };
  }

  private async getSiteAndLatestScan(siteId: string): Promise<{ site: SiteContext; latestScan: LatestScan }> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        bestScore: true,
        tier: true,
        profile: true,
        llmsTxt: true,
        crawlerToken: true,
        qas: {
          orderBy: { sortOrder: 'asc' },
          take: 8,
          select: { question: true, answer: true },
        },
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          include: { results: true },
        },
      },
    });
    if (!site) throw new NotFoundException('Site not found');
    const latestScan = site.scans[0];
    if (!latestScan) throw new NotFoundException('No completed scan found for this site');
    const { scans, ...siteContext } = site;
    return { site: siteContext, latestScan };
  }

  private buildIssues(scan: LatestScan) {
    return scan.results
      .filter((result) => result.status !== 'pass' || result.score < 90)
      .map((result) => {
        const meta = INDICATOR_META[result.indicator] ?? {
          label: result.indicator,
          weight: 5,
          plain: result.suggestion || '此項目會影響 AI 理解網站。',
          canAutoFix: Boolean(result.autoFixable),
        };
        return {
          indicator: result.indicator,
          label: meta.label,
          score: result.score,
          status: result.status,
          canAutoFix: Boolean(result.autoFixable || meta.canAutoFix),
          estimatedGain: Math.max(1, Math.round(((100 - result.score) / 100) * meta.weight)),
          whyItMatters: meta.plain,
          nextStep: this.nextStepFor(result.indicator, Boolean(result.autoFixable || meta.canAutoFix)),
          suggestion: result.suggestion,
        };
      });
  }

  private resultSummary(result: any) {
    const meta = INDICATOR_META[result.indicator] ?? {
      label: result.indicator,
      plain: result.suggestion || '此項目會影響 AI 理解網站。',
      canAutoFix: Boolean(result.autoFixable),
    };
    return {
      indicator: result.indicator,
      label: meta.label,
      score: result.score,
      status: result.status,
      nextStep: this.nextStepFor(result.indicator, Boolean(result.autoFixable || meta.canAutoFix)),
    };
  }

  private buildHandoffFiles(site: SiteContext, scan: LatestScan) {
    const description = this.siteDescription(site);
    const resultMap = new Map(scan.results.map((result) => [result.indicator, result]));
    const headParts: string[] = [];
    const generated = (indicator: string) => resultMap.get(indicator)?.generatedCode?.trim();

    headParts.push(
      generated('json_ld') ||
        this.fixService.generateJsonLd({
          type: site.industry ? 'LocalBusiness' : 'Organization',
          name: site.name,
          url: site.url,
          description,
        }).code,
    );
    headParts.push(
      generated('faq_schema') ||
        this.fixService.generateFaqSchema(
          site.qas.length > 0
            ? site.qas
            : [{ question: `${site.name} 是什麼？`, answer: description }],
        ).code,
    );
    headParts.push(
      generated('og_tags') ||
        this.fixService.generateOgTags({
          title: site.name,
          description,
          url: site.url,
          type: 'website',
        }).code,
    );
    headParts.push(`<meta name="description" content="${this.escapeHtml(description.slice(0, 160))}">`);

    const llmsTxt =
      generated('llms_txt') ||
      site.llmsTxt ||
      this.fixService.generateLlmsTxt({
        title: site.name,
        description,
        url: site.url,
        links: [{ title: 'Geovault 品牌檔案', url: `${this.webUrl()}/directory/${site.id}` }],
      }).code;

    const crawlerToken = site.crawlerToken || `TODO_CREATE_TOKEN_${randomBytes(4).toString('hex')}`;
    const footer = [
      `<a href="${this.webUrl()}/directory/${site.id}" target="_blank" rel="noopener"><img src="${this.apiPublicUrl()}/api/badge/${site.id}.svg" alt="GEO Score: ${site.bestScore ?? scan.totalScore} | Verified by Geovault" width="148" height="20"></a>`,
      this.crawlerSnippet(crawlerToken),
    ].join('\n\n');

    return [
      {
        path: 'head.html',
        purpose: '貼到全站 <head>，補齊 AI 可讀結構與頁面摘要。',
        language: 'html',
        content: headParts.join('\n\n'),
      },
      {
        path: 'footer.html',
        purpose: '貼到全站 </body> 前，安裝 GEO Badge 與 AI 爬蟲追蹤。',
        language: 'html',
        content: footer,
      },
      {
        path: 'llms.txt',
        purpose: '放到網站根目錄，讓 AI 爬蟲可直接讀取品牌資訊。',
        language: 'text',
        content: llmsTxt,
      },
      {
        path: 'robots.txt.addition',
        purpose: '若 robots.txt 可修改，加入這段協助 AI 與搜尋爬蟲探索網站。',
        language: 'text',
        content: [
          'User-agent: GPTBot',
          'Allow: /',
          '',
          'User-agent: ClaudeBot',
          'Allow: /',
          '',
          'User-agent: PerplexityBot',
          'Allow: /',
          '',
          `Sitemap: ${new URL('/sitemap.xml', site.url).toString()}`,
        ].join('\n'),
      },
      {
        path: 'verify-checklist.md',
        purpose: '工程師完成後照這份清單驗證。',
        language: 'markdown',
        content: [
          `# ${site.name} GEO 結構修復驗證清單`,
          '',
          '- [ ] 首頁原始碼可看到 JSON-LD script',
          '- [ ] 首頁原始碼可看到 FAQ Schema script',
          '- [ ] 首頁原始碼可看到 OG tags 與 meta description',
          '- [ ] /llms.txt 可用瀏覽器開啟',
          '- [ ] 頁尾可看到 GEO Badge 或追蹤碼',
          '- [ ] 回到 Geovault 重新掃描',
          '- [ ] 確認完成報告分數與通過項目',
        ].join('\n'),
      },
    ];
  }

  private chooseRecommendedPath(
    site: SiteContext,
    quickWins: Array<{ indicator: string }>,
    manualItems: Array<{ indicator: string }>,
  ): string {
    const host = this.hostname(site.url);
    if (host.includes('wordpress') || quickWins.length >= 3) return 'wordpress';
    if (manualItems.length >= 4) return 'done_for_you';
    return 'engineer';
  }

  private fixSort(indicator: string): number {
    const index = FIX_ORDER.indexOf(indicator);
    return index === -1 ? 99 : index;
  }

  private missingBrandFacts(site: SiteContext): string[] {
    const profile = this.profile(site);
    return [
      !this.hasText(profile.description) && '品牌描述',
      !this.hasText(profile.services) && '主要服務',
      !this.hasText(profile.location) && '服務地區',
      !this.hasText(profile.contactInfo, profile.contact) && '聯絡資訊',
      site.qas.length < 5 && '至少 5 組品牌 Q&A',
    ].filter(Boolean) as string[];
  }

  private nextStepFor(indicator: string, canAutoFix: boolean): string {
    if (canAutoFix) return '可透過 WordPress 外掛或工程師修復包完成。';
    const steps: Record<string, string> = {
      title_optimization: '請調整首頁 title，加入品牌名稱、服務與地區。',
      contact_info: '請在首頁或聯絡頁補上電話、Email、地址或服務區域。',
      image_alt: '請替主要圖片補上能描述服務內容的 alt 文字。',
      robots_ai: '請檢查 robots.txt，不要封鎖重要 AI 與搜尋爬蟲。',
    };
    return steps[indicator] || '請交給工程師或 Geovault 代裝協助處理。';
  }

  private publicSite(site: { id: string; name: string; url: string; industry: string | null; bestScore?: number | null; tier?: string | null }) {
    return {
      id: site.id,
      name: site.name,
      url: site.url,
      industry: site.industry,
      bestScore: site.bestScore ?? 0,
      tier: site.tier,
    };
  }

  private siteDescription(site: SiteContext): string {
    const profile = this.profile(site);
    const description = this.stringValue(profile.description ?? profile.summary ?? profile.positioning ?? profile.uniqueValue);
    return description || `${site.name} 是一個收錄於 Geovault 的品牌網站，主要網站為 ${site.url}。`;
  }

  private profile(site: SiteContext): Record<string, unknown> {
    return site.profile && typeof site.profile === 'object' && !Array.isArray(site.profile)
      ? site.profile as Record<string, unknown>
      : {};
  }

  private hasText(...values: unknown[]): boolean {
    return values.some((value) => this.stringValue(value).length > 0);
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private hostname(value: string): string {
    try {
      return new URL(value).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  private apiPublicUrl(): string {
    return (process.env.API_PUBLIC_URL || 'https://api.geovault.app').replace(/\/$/, '');
  }

  private webUrl(): string {
    return (process.env.FRONTEND_URL || 'https://www.geovault.app').replace(/\/$/, '');
  }

  private crawlerSnippet(token: string): string {
    const apiUrl = this.apiPublicUrl();
    return `<!-- Geovault AI Crawler Tracker -->
<script>
(function() {
  var AI_BOTS = ['ClaudeBot','GPTBot','ChatGPT-User','Google-Extended','PerplexityBot','YouBot','CCBot','Bytespider','bingbot','Googlebot'];
  var ua = navigator.userAgent || '';
  for (var i = 0; i < AI_BOTS.length; i++) {
    if (ua.indexOf(AI_BOTS[i]) !== -1) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '${apiUrl}/api/crawler/report', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ token: '${token}', botName: AI_BOTS[i], url: window.location.href, userAgent: ua }));
      break;
    }
  }
})();
</script>
<img src="${apiUrl}/api/crawler/pixel/${token}.gif" alt="" width="1" height="1" style="position:absolute;left:-9999px;top:-9999px" referrerpolicy="no-referrer-when-downgrade" />`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
