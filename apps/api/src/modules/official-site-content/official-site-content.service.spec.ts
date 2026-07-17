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
        if (key === 'OPENAI_API_KEY') return 'test-key';
        if (key === 'OFFICIAL_SITE_ARTICLE_AI_MODEL') return 'gpt-4o-mini';
        return undefined;
      }),
    };
    service = new OfficialSiteContentService(
      prisma as PrismaService,
      config as any,
      brandFacts as BrandFactService,
      indexNow as IndexNowService,
    );
    const aiResponse = {
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
    (service as any).openai = {
      chat: {
        completions: {
          create: jest.fn(async (args: any) => {
            prompt = args.messages[1].content;
            return { choices: [{ message: { content: JSON.stringify(aiResponse) } }] };
          }),
        },
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

  it('automatically retries a failed draft and records the attempt count', async () => {
    const create = (service as any).openai.chat.completions.create as jest.Mock;
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
    expect(create).toHaveBeenCalledTimes(3);
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
    prisma.blogArticle.findMany.mockResolvedValue([{ id: 'platform-1', content: candidate }]);

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
    expect(result.rejectionReason).toContain('belowDuplicateThreshold');
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
