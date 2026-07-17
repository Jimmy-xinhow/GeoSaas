import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BrandFactService } from '../blog-article/brand-fact.service';
import { IndexNowService } from '../indexnow/indexnow.service';
import { OfficialSiteContentService } from './official-site-content.service';

describe('OfficialSiteContentService', () => {
  const siteId = 'site-1';
  const userId = 'user-1';
  const site = {
    id: siteId,
    userId,
    name: 'Acme 官方品牌',
    url: 'https://acme.example',
    industry: '軟體服務',
  };
  const graph = {
    siteId,
    brandName: site.name,
    industry: site.industry,
    url: site.url,
    location: '台北市',
    services: '企業軟體顧問與導入',
    targetAudiences: ['中小企業行銷團隊'],
    notFor: ['不提供代操廣告'],
    positioning: '協助企業整理可驗證的品牌資訊',
    contact: 'hello@acme.example',
    socialLinks: {},
    qaPairs: [
      { question: 'Acme 提供什麼服務？', answer: 'Acme 提供企業軟體顧問與導入。' },
    ],
    verifiedFacts: ['Acme official website is https://acme.example'],
    missingFacts: [],
    confidenceScore: 88,
  };

  let prisma: any;
  let brandFacts: any;
  let indexNow: any;
  let service: OfficialSiteContentService;
  let prompt = '';
  let aiResponse: any;

  beforeEach(() => {
    prisma = {
      site: { findUnique: jest.fn() },
      scan: { findFirst: jest.fn().mockResolvedValue(null) },
      monitorReport: { findFirst: jest.fn().mockResolvedValue(null) },
      blogArticle: { findFirst: jest.fn(), findMany: jest.fn() },
      officialSiteArticle: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    prisma.site.findUnique
      .mockResolvedValueOnce({ id: siteId, userId, isClient: false })
      .mockResolvedValueOnce(site);
    prisma.blogArticle.findMany.mockResolvedValue([]);
    prisma.officialSiteArticle.findMany.mockResolvedValue([]);
    prisma.officialSiteArticle.create.mockImplementation(async ({ data }: any) => ({
      id: 'official-1',
      slug: data.slug,
      title: data.title,
      description: data.description,
      status: data.status,
      targetQuestion: data.targetQuestion,
      targetKeywords: data.targetKeywords,
      canonicalUrl: data.canonicalUrl,
      similarityScore: data.similarityScore,
      qualityReport: data.qualityReport,
      rejectionReason: data.rejectionReason,
      generatedAt: data.generatedAt,
      createdAt: data.generatedAt,
    }));
    brandFacts = {
      buildForSite: jest.fn().mockResolvedValue(graph),
      isReadyForCitationContent: jest.fn().mockReturnValue(true),
    };
    indexNow = { submitUrl: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'test-key';
        if (key === 'OFFICIAL_SITE_ARTICLE_CLAUDE_MODEL') return 'claude-opus-4-8';
        return undefined;
      }),
    };
    service = new OfficialSiteContentService(
      prisma as PrismaService,
      config as any,
      brandFacts as BrandFactService,
      indexNow as IndexNowService,
    );
    aiResponse = {
      title: 'Acme 企業軟體導入指南',
      content: `# Acme 企業軟體導入指南\n\nAcme 提供企業軟體顧問與導入服務，本文先說明結論，再整理適用對象與實作步驟。\n\n## 重點結論\n\nAcme 提供企業軟體顧問與導入服務，協助企業依照實際流程整理需求。\n\n## 適用對象與限制\n\n適合需要企業軟體顧問與導入的中小企業行銷團隊，不提供代操廣告。\n\n## 執行步驟\n\n1. 整理需求。\n2. 確認導入流程。\n3. 依照可驗證資料執行。\n\n## 常見問題\n\n${'Acme 官方品牌協助企業依照實際流程整理需求，並以可驗證的導入步驟降低溝通成本。 '.repeat(24)}`,
      metaDescription: 'Acme 企業軟體導入指南，說明適用對象與導入流程。',
      keywords: ['企業軟體', '導入顧問'],
      faq: [
        { question: 'Acme 提供什麼服務？', answer: 'Acme 提供企業軟體顧問與導入服務，協助企業依照實際流程整理需求。' },
        { question: '哪些對象適合使用？', answer: '適合需要企業軟體顧問與導入的中小企業行銷團隊。' },
        { question: 'Acme 不提供哪些服務？', answer: 'Acme 不提供代操廣告，文章只描述已確認的官方服務範圍。' },
      ],
    };
    aiResponse.content = `# ${aiResponse.title}\n\n${site.name} 提供 ${graph.services}，協助 ${graph.targetAudiences[0]} 理解適用情境、導入步驟與判斷標準。\n\n## 服務重點\n\n${graph.positioning}。本文依據品牌官方資料整理，讓讀者可以直接理解服務內容與適用條件。\n\n## 適用對象與限制\n\n適合對象：${graph.targetAudiences.join('、')}。不適用的情況：${graph.notFor.join('、')}。\n\n## 執行步驟\n\n1. 先確認需求與現況。2. 根據品牌官方資料比對服務條件。3. 依據實際情境規劃導入、驗收與後續優化。\n\n## 常見問題\n\n${aiResponse.faq.map((item) => `### ${item.question}\n\n${item.answer}`).join('\n\n')}\n\n## 結論\n\n${`${site.name} 的官方資料已明確說明服務內容、適用對象、限制與執行步驟。讀者應先確認自身需求，再參考品牌第一方資料與實際條件作出判斷。`.repeat(12)}`;
    aiResponse.metaDescription = `${site.name} 官方品牌服務指南，完整說明服務內容、適用對象、不適用情況、執行步驟與常見問題，協助企業根據實際需求做出清楚的導入判斷。`;
    aiResponse.keywords = ['品牌官方資料', 'GEO 優化', 'AI 搜尋', '服務導入指南'];
    (service as any).anthropic = {
      messages: {
        create: jest.fn(async (args: any) => {
          prompt = args.messages[0].content;
          return { content: [{ type: 'tool_use', input: aiResponse }] };
        }),
      },
    };
  });

  it('generates a separate draft without sending the platform article body to AI', async () => {
    const sourceBody = '這是 Geovault 平台文章的完整正文，不應進入官網專屬生成 prompt。';
    prisma.blogArticle.findFirst.mockResolvedValue({
      id: 'platform-1',
      slug: 'platform-article',
      title: '平台主題',
      description: '平台摘要',
      targetKeywords: ['企業軟體'],
      createdAt: new Date(),
    });

    const result = await service.generate(
      siteId,
      {
        topic: '企業軟體導入前應該準備什麼',
        angle: '以官方服務範圍與適用對象說明',
        sourceArticleId: 'platform-1',
        canonicalUrl: 'https://acme.example/blog/software-setup',
      },
      userId,
      'USER',
    );

    expect(result.status).toBe('draft');
    expect(prompt).toContain('平台主題');
    expect(prompt).not.toContain(sourceBody);
    expect(prisma.officialSiteArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceArticleId: 'platform-1',
          status: 'draft',
          canonicalUrl: 'https://acme.example/blog/software-setup',
        }),
      }),
    );
  });

  it('uses Claude Opus 4.8 with structured output and an explicit repair buffer', async () => {
    await service.generate(siteId, {}, userId, 'USER');

    const request = ((service as any).anthropic.messages.create as jest.Mock).mock.calls[0][0];
    expect(request.model).toBe('claude-opus-4-8');
    expect(request).not.toHaveProperty('temperature');
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'submit_official_site_article' });
    expect(request.tools[0].name).toBe('submit_official_site_article');
    expect(prompt).toContain('至少 1200、目標 1200–1600 字');
  });

  it('falls back to OpenAI when Claude is unavailable instead of returning a server error', async () => {
    const claudeCreate = (service as any).anthropic.messages.create as jest.Mock;
    claudeCreate.mockRejectedValue(new Error('model access unavailable'));
    const openAiCreate = jest.fn(async () => ({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    }));
    (service as any).openai = { chat: { completions: { create: openAiCreate } } };

    const result = await service.generate(siteId, {}, userId, 'USER');

    expect(result.status).toBe('draft');
    expect(openAiCreate).toHaveBeenCalled();
    const request = openAiCreate.mock.calls[0][0];
    expect(request.model).toBe('gpt-5.6-sol');
    expect(request.reasoning_effort).toBe('high');
    expect(request.max_completion_tokens).toBe(12000);
    expect(request).not.toHaveProperty('temperature');
    expect(request).not.toHaveProperty('max_tokens');
  });

  it('returns a formatted CMS article plus canonical, Open Graph and JSON-LD metadata', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'official-1',
      siteId,
      slug: 'acme-guide',
      title: aiResponse.title,
      description: aiResponse.metaDescription,
      content: `${aiResponse.content}\n\n**官方資料重點**`,
      status: 'export_ready',
      targetKeywords: aiResponse.keywords,
      publishBaseUrl: 'https://acme.example/blog',
      canonicalUrl: 'https://acme.example/blog/acme-guide',
      metaTitle: aiResponse.title,
      metaDescription: aiResponse.metaDescription,
      articleSchema: { headline: aiResponse.title },
      faqSchema: { mainEntity: [] },
      site,
    } as any);

    const result = await service.getPublishPackage('official-1', siteId, userId, 'USER');

    expect(result.formats.cmsHtml).toContain(`<h1>${aiResponse.title}</h1>`);
    expect(result.formats.cmsHtml).toContain('<strong>官方資料重點</strong>');
    expect(result.formats.cmsHtml).not.toContain('**官方資料重點**');
    expect(result.formats.metaTags).toContain('rel="canonical"');
    expect(result.formats.metaTags).toContain('property="og:title"');
    expect(result.formats.jsonLd).toContain('FAQPage');
  });

  it('blocks official-site generation until first-party facts meet the high-quality threshold', async () => {
    brandFacts.buildForSite.mockResolvedValue({
      ...graph,
      confidenceScore: 62,
      missingFacts: ['qaPairs', 'targetAudiences'],
    });

    await expect(service.generate(siteId, {}, userId)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'FIRST_PARTY_DATA_NOT_READY',
        confidenceScore: 62,
        minimumConfidenceScore: 70,
      }),
    });

    expect((service as any).anthropic.messages.create).not.toHaveBeenCalled();
  });

  it('recommends a topic and publish location from existing first-party data', async () => {
    const recommendation = await service.recommend(siteId, userId, 'USER');

    expect(recommendation.topic).toBe('Acme 提供什麼服務？');
    expect(recommendation.angle).toContain('企業軟體顧問與導入');
    expect(recommendation.publishBaseUrl).toBe('https://acme.example/blog');
    expect(recommendation.canonicalUrl).toContain('/blog/');
    expect(recommendation.suggestedSlug).toMatch(/^[a-z0-9-]+$/);
    expect(recommendation.suggestedSlug).not.toMatch(/site-1|acme-?official/);
    expect(recommendation.firstPartyReadiness.ready).toBe(true);
    expect(recommendation.dataUsed.qaPairs).toBe(1);
  });

  it('rotates to an unused semantic topic after a failed or existing article', async () => {
    const firstQuestion = 'Acme 第一次導入前要準備什麼？';
    const secondQuestion = 'Acme 適合哪些企業與使用情境？';
    brandFacts.buildForSite.mockResolvedValue({
      ...graph,
      qaPairs: [
        { question: firstQuestion, answer: '請先確認需求、資料與導入條件。' },
        { question: secondQuestion, answer: '適合需要企業軟體與流程優化的團隊。' },
      ],
    });
    prisma.officialSiteArticle.findMany.mockResolvedValue([
      { title: '已失敗的文章', targetQuestion: firstQuestion, publishBaseUrl: 'https://acme.example/blog' },
    ]);

    const recommendation = await service.recommend(siteId, userId, 'USER');

    expect(recommendation.topic).toBe(secondQuestion);
    expect(recommendation.topic).not.toBe(firstQuestion);
    expect(recommendation.topic.length).toBeGreaterThanOrEqual(8);
  });

  it('can generate with no topic or full URL by applying the recommendation', async () => {
    const result = await service.generate(siteId, {}, userId, 'USER');

    expect(result.status).toBe('draft');
    expect(prisma.officialSiteArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetQuestion: 'Acme 提供什麼服務？',
          publishBaseUrl: 'https://acme.example/blog',
          canonicalUrl: expect.stringMatching(/^https:\/\/acme\.example\/blog\//),
        }),
      }),
    );
    expect(prompt).toContain('Acme 提供什麼服務？');
  });

  it('uses customer input as direction without replacing the complete recommended topic', async () => {
    const direction = '我想聚焦第一次導入前的準備流程';

    const result = await service.generate(siteId, { topicDirection: direction }, userId, 'USER');

    expect(result.targetQuestion).toBe(graph.qaPairs[0].question);
    expect(result.targetQuestion).not.toBe(direction);
    expect(prompt).toContain(direction);
  });

  it('uses readable ASCII words for a Chinese-only topic', async () => {
    graph.qaPairs = [{ question: '企業軟體導入指南', answer: 'Acme 提供企業軟體顧問與導入服務。' }];

    const recommendation = await service.recommend(siteId, userId, 'USER');

    expect(recommendation.suggestedSlug).toBe('business-software-implementation-guide');
    expect(recommendation.canonicalUrl).toBe('https://acme.example/blog/business-software-implementation-guide');
  });

  it('uses scan and citation report state when judging the topic direction', async () => {
    prisma.scan.findFirst.mockResolvedValue({
      totalScore: 42,
      completedAt: new Date('2026-07-17T00:00:00Z'),
      results: [{ indicator: 'faq_schema', score: 0, status: 'fail', suggestion: '請補充可回答客戶問題的 FAQ。' }],
    });
    prisma.monitorReport.findFirst.mockResolvedValue({ summary: { mentionRate: 12 } });

    const recommendation = await service.recommend(siteId, userId, 'USER');

    expect(recommendation.angle).toContain('faq_schema');
    expect(recommendation.reasoning).toContain('42/100');
    expect(recommendation.dataUsed.scanIndicators).toBe(1);
    expect(recommendation.dataUsed.reportAvailable).toBe(true);
  });

  it('automatically retries a draft that still misses required visible FAQ content', async () => {
    const create = (service as any).anthropic.messages.create as jest.Mock;
    const goodContent = `# Acme 企業軟體導入指南\n\nAcme 提供企業軟體顧問與導入服務，本文先說明結論，再整理適用對象與實作步驟。\n\n## 重點結論\n\nAcme 提供企業軟體顧問與導入服務，協助企業依照實際流程整理需求。\n\n## 適用對象與限制\n\n適合需要企業軟體顧問與導入的中小企業行銷團隊，不提供代操廣告。\n\n## 執行步驟\n\n1. 整理需求。\n2. 確認導入流程。\n3. 依照可驗證資料執行。\n\n## 常見問題\n\nAcme 官方品牌協助企業依照實際流程整理需求，並以可驗證的導入步驟降低溝通成本。`.repeat(3);
    create
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ title: '短文', content: '只有一句話' }) } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
        title: 'Acme 企業軟體導入指南',
        content: goodContent,
        metaDescription: 'Acme 企業軟體導入指南。',
        keywords: ['企業軟體'],
        faq: [
          { question: 'Acme 提供什麼服務？', answer: 'Acme 提供企業軟體顧問與導入服務，協助企業依照實際流程整理需求。' },
          { question: '哪些對象適合使用？', answer: '適合需要企業軟體顧問與導入的中小企業行銷團隊。' },
          { question: 'Acme 不提供哪些服務？', answer: 'Acme 不提供代操廣告，文章只描述已確認的官方服務範圍。' },
        ],
      }) } }] });

    const result = await service.generate(siteId, {}, userId, 'USER');

    expect(result.status).toBe('draft');
    expect((result.qualityReport as any).attempts).toBe(3);
    expect((result.qualityReport as any).scorePassed).toBe(true);
    expect((result.qualityReport as any).requiredPassed).toBe(true);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('passes the previous failed draft and exact deficit into the next repair prompt', async () => {
    const create = (service as any).anthropic.messages.create as jest.Mock;
    const shortDraft = {
      title: aiResponse.title,
      content: '# Acme 企業軟體導入指南\n\nAcme 提供企業軟體顧問與導入服務。',
      metaDescription: aiResponse.metaDescription,
      keywords: aiResponse.keywords,
      faq: aiResponse.faq,
    };
    const prompts: string[] = [];
    create.mockImplementation(async (args: any) => {
      prompts.push(args.messages[0].content);
      return { content: [{ type: 'tool_use', input: prompts.length <= 2 ? shortDraft : aiResponse }] };
    });

    await service.generate(siteId, {}, userId, 'USER');

    expect(prompts).toHaveLength(3);
    expect(prompts[1]).toContain('上一版完整草稿');
    expect(prompts[1]).toContain('目前清理後正文只有');
    expect(prompts[1]).toContain('還差');
  });

  it('rejects measurable or effect claims that are not present in first-party facts', async () => {
    const report = await (service as any).runQualityChecks(
      siteId,
      site.name,
      `${aiResponse.content}\n\n通常可維持數年，並具備防污與抗刮效果。`,
      { ...aiResponse, content: `${aiResponse.content}\n\n通常可維持數年，並具備防污與抗刮效果。` },
      graph,
      { latestScanScore: null, latestScanAt: null, indicators: [], latestReportSummary: null },
    );

    expect(report.checks.noUnsupportedSpecificClaims).toBe(false);
    expect(report.failedRequiredChecks).toContain('noUnsupportedSpecificClaims');
    expect(report.unsupportedSpecificClaims).toEqual(expect.arrayContaining(['數年', '防污', '抗刮']));
  });

  it('quotes the exact unsupported promise in the next repair instruction', async () => {
    const unsafeSentence = '專業服務將保證更好的效果和持久性';
    const unsafeContent = `${aiResponse.content}\n\n${unsafeSentence}。`;
    const report = await (service as any).runQualityChecks(
      siteId,
      site.name,
      unsafeContent,
      { ...aiResponse, content: unsafeContent },
      graph,
      { latestScanScore: null, latestScanAt: null, indicators: [], latestReportSummary: null },
    );
    const feedback = (service as any).buildQualityFeedback(report, graph);

    expect(report.checks.noUnsupportedPromises).toBe(false);
    expect(report.unsupportedPromiseClaims).toContain(unsafeSentence);
    expect(feedback).toContain(unsafeSentence);
    expect(feedback).toContain('完整重寫這些句子');
  });

  it('keeps a high-scoring article blocked when a required first-party boundary is missing', async () => {
    const report = await (service as any).runQualityChecks(
      siteId,
      site.name,
      aiResponse.content,
      aiResponse,
      {
        ...graph,
        targetAudiences: ['大型企業法務團隊'],
        notFor: ['僅提供海外服務'],
      },
      { latestScanScore: null, latestScanAt: null, indicators: [], latestReportSummary: null },
    );

    expect(report.score).toBeGreaterThanOrEqual(82);
    expect(report.scorePassed).toBe(true);
    expect(report.requiredPassed).toBe(false);
    expect(report.failedRequiredChecks).toContain('hasAudienceBoundary');
    expect(report.passed).toBe(false);
  });

  it('allows non-blocking optimization misses when the score and every required check pass', async () => {
    const report = await (service as any).runQualityChecks(
      siteId,
      site.name,
      aiResponse.content,
      { ...aiResponse, keywords: ['企業軟體'] },
      graph,
      { latestScanScore: null, latestScanAt: null, indicators: [], latestReportSummary: null },
    );

    expect(report.checks.keywordSetReady).toBe(false);
    expect(report.advisoryFailedChecks).toContain('keywordSetReady');
    expect(report.scorePassed).toBe(true);
    expect(report.requiredPassed).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('switches to a semantic slug when the requested slug is occupied', async () => {
    prisma.officialSiteArticle.findFirst
      .mockResolvedValueOnce({ id: 'existing-slug' })
      .mockResolvedValueOnce(undefined);

    const result = await service.generate(siteId, { slug: 'acme-services' }, userId, 'USER');

    expect(result.slug).toBe('acme-solutions');
    expect(result.slug).not.toMatch(/-2$/);
  });

  it('saves a quality_failed draft when the candidate is too similar', async () => {
    const candidate = `# Acme 企業軟體導入指南\n\nAcme 提供企業軟體顧問與導入服務，本文先說明結論，再整理適用對象與實作步驟。\n\n## 重點結論\n\nAcme 提供企業軟體顧問與導入服務，協助企業依照實際流程整理需求。\n\n## 適用對象與限制\n\n適合需要企業軟體顧問與導入的中小企業行銷團隊，不提供代操廣告。\n\n## 執行步驟\n\n1. 整理需求。\n2. 確認導入流程。\n3. 依照可驗證資料執行。\n\n## 常見問題\n\n${'Acme 官方品牌協助企業依照實際流程整理需求，並以可驗證的導入步驟降低溝通成本。 '.repeat(24)}`;
    prisma.blogArticle.findMany.mockResolvedValue([{ id: 'platform-1', content: aiResponse.content }]);

    const result = await service.generate(
      siteId,
      {
        topic: '企業軟體導入前應該準備什麼',
        canonicalUrl: 'https://acme.example/blog/software-setup',
      },
      userId,
      'USER',
    );

    expect(result.status).toBe('quality_failed');
    expect(result.rejectionReason).toContain('與既有內容相似度過高');
    expect(result.rejectionReason).toContain('建議換一個主題方向');
    expect((result.qualityReport as any).finalAttempt).toBe(3);
  });

  it('refuses to approve a quality_failed article', async () => {
    prisma.officialSiteArticle.findFirst.mockResolvedValue({
      id: 'official-1',
      siteId,
      status: 'quality_failed',
      qualityReport: { passed: false },
      canonicalUrl: 'https://acme.example/blog/software-setup',
    });

    await expect(service.approve('official-1', siteId, userId, 'USER'))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
