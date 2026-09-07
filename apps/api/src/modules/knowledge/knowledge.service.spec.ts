import { BadRequestException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { buildKnowledgeXlsx, KnowledgeExportQa } from './knowledge-xlsx.util';

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(0),
    disconnect: jest.fn(),
  })),
);

function makeQa(index: number): KnowledgeExportQa {
  return {
    id: `qa-${index}`,
    question: `匯入問題 ${index}？`,
    answer: `匯入答案 ${index}`,
    category: `分類 ${index}`,
    sortOrder: index - 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function createService(existingQuestions: string[] = []) {
  const site = {
    id: 'site-1',
    userId: 'admin-1',
    isClient: true,
    name: '測試網站',
    url: 'https://example.com',
    industry: 'technology',
    profile: null,
  };
  const prisma: any = {
    site: { findUnique: jest.fn().mockResolvedValue(site) },
    siteQa: {
      findMany: jest.fn().mockResolvedValue(
        existingQuestions.map((question) => ({ question })),
      ),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ plan: 'PRO', role: 'SUPER_ADMIN' }) },
    knowledgeImportJob: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data })),
    },
  };
  const config: any = { get: jest.fn().mockReturnValue(undefined) };
  const planUsage: any = {};
  const indexNow: any = { submitUrl: jest.fn() };
  const service = new KnowledgeService(prisma, config, planUsage, indexNow);
  return { service, prisma };
}

describe('KnowledgeService FAQ import', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('directly previews structured FAQ XLSX and caps it to remaining site capacity', async () => {
    const existing = Array.from({ length: 100 }, (_, index) => `既有問題 ${index + 1}`);
    const { service, prisma } = createService(existing);
    const buffer = buildKnowledgeXlsx(
      Array.from({ length: 200 }, (_, index) => makeQa(index + 1)),
    );

    const result = await service.previewImport(
      'site-1',
      {
        originalname: 'faq.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        buffer,
      },
      'admin-1',
      'SUPER_ADMIN',
    );

    expect(result.items).toHaveLength(100);
    expect(result.items[0].category).toBe('分類 1');
    expect(result.warnings).toContain(
      '知識庫目前剩餘 100 筆空間，已從 200 筆新資料中載入前 100 筆。',
    );
    expect(prisma.knowledgeImportJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        countsTowardQuota: false,
        generatedCount: 100,
        draftJson: expect.objectContaining({ sourceMode: 'structured-xlsx-v1' }),
      }),
    });

    await service.onModuleDestroy();
  });

  it('returns a user-facing 400 when the AI provider rejects an unstructured file', async () => {
    const { service } = createService();
    (service as any).openai = {
      chat: {
        completions: {
          create: jest.fn().mockRejectedValue(
            Object.assign(new Error('rate limit exceeded'), { status: 429 }),
          ),
        },
      },
    };
    const buffer = Buffer.from('這是一段需要 AI 整理的品牌資料。', 'utf8');

    await expect(
      service.previewImport(
        'site-1',
        { originalname: 'notes.txt', mimetype: 'text/plain', size: buffer.length, buffer },
        'admin-1',
        'SUPER_ADMIN',
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<BadRequestException>>({ status: 400 }),
    );

    await service.onModuleDestroy();
  });
});
