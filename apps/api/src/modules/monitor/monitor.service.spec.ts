import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatgptDetector } from './platforms/chatgpt.detector';
import { ClaudeDetector } from './platforms/claude.detector';
import { PerplexityDetector } from './platforms/perplexity.detector';
import { GeminiDetector } from './platforms/gemini.detector';

describe('MonitorService', () => {
  let service: MonitorService;
  let prisma: any;
  let chatgptDetector: { detect: jest.Mock };
  let claudeDetector: { detect: jest.Mock };
  let perplexityDetector: { detect: jest.Mock };
  let geminiDetector: { detect: jest.Mock };

  beforeEach(async () => {
    prisma = {
      monitor: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      site: {
        findMany: jest.fn(),
      },
    };

    chatgptDetector = { detect: jest.fn() };
    claudeDetector = { detect: jest.fn() };
    perplexityDetector = { detect: jest.fn() };
    geminiDetector = { detect: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitorService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChatgptDetector, useValue: chatgptDetector },
        { provide: ClaudeDetector, useValue: claudeDetector },
        { provide: PerplexityDetector, useValue: perplexityDetector },
        { provide: GeminiDetector, useValue: geminiDetector },
      ],
    }).compile();

    service = module.get<MonitorService>(MonitorService);
  });

  describe('checkCitation', () => {
    const mockMonitor = (platform: string) => ({
      id: 'm1',
      siteId: 's1',
      platform,
      query: 'best SEO tools',
      site: { id: 's1', name: 'TestBrand', url: 'https://test.com' },
    });

    it('should use ChatGPT detector for CHATGPT platform', async () => {
      prisma.monitor.findUnique.mockResolvedValue(mockMonitor('CHATGPT'));
      chatgptDetector.detect.mockResolvedValue({ mentioned: true, position: 3, response: 'TestBrand is great' });
      prisma.monitor.update.mockResolvedValue({});

      await service.checkCitation('m1');

      expect(chatgptDetector.detect).toHaveBeenCalledWith('best SEO tools', 'TestBrand', 'https://test.com');
      expect(prisma.monitor.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ mentioned: true, position: 3 }),
      }));
    });

    it('should use Claude detector for CLAUDE platform', async () => {
      prisma.monitor.findUnique.mockResolvedValue(mockMonitor('CLAUDE'));
      claudeDetector.detect.mockResolvedValue({ mentioned: false, position: null, response: 'No mention' });
      prisma.monitor.update.mockResolvedValue({});

      await service.checkCitation('m1');

      expect(claudeDetector.detect).toHaveBeenCalled();
    });

    it('should use Perplexity detector for PERPLEXITY platform', async () => {
      prisma.monitor.findUnique.mockResolvedValue(mockMonitor('PERPLEXITY'));
      perplexityDetector.detect.mockResolvedValue({ mentioned: true, position: 1, response: 'Found' });
      prisma.monitor.update.mockResolvedValue({});

      await service.checkCitation('m1');

      expect(perplexityDetector.detect).toHaveBeenCalled();
    });

    it('should use Gemini detector for GEMINI platform', async () => {
      prisma.monitor.findUnique.mockResolvedValue(mockMonitor('GEMINI'));
      geminiDetector.detect.mockResolvedValue({ mentioned: false, position: null, response: 'No mention' });
      prisma.monitor.update.mockResolvedValue({});

      await service.checkCitation('m1');

      expect(geminiDetector.detect).toHaveBeenCalled();
    });

    it('should throw NotFoundException for invalid monitor id', async () => {
      prisma.monitor.findUnique.mockResolvedValue(null);

      await expect(service.checkCitation('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDashboard', () => {
    it('should return summary for all 4 platforms', async () => {
      prisma.site.findMany.mockResolvedValue([{ id: 's1' }]);
      prisma.monitor.findMany.mockResolvedValue([
        { platform: 'CHATGPT', mentioned: true },
        { platform: 'CHATGPT', mentioned: false },
        { platform: 'CLAUDE', mentioned: true },
      ]);

      const result = await service.getDashboard('u1');

      expect(result.summary).toHaveLength(4);
      const chatgpt = result.summary.find((s: any) => s.platform === 'CHATGPT');
      expect(chatgpt.total).toBe(2);
      expect(chatgpt.mentioned).toBe(1);
      expect(chatgpt.rate).toBe(50);
    });

    it('should return empty summary when no monitors exist', async () => {
      prisma.site.findMany.mockResolvedValue([]);
      prisma.monitor.findMany.mockResolvedValue([]);

      const result = await service.getDashboard('u1');

      expect(result.summary.every((s: any) => s.total === 0)).toBe(true);
      expect(result.recentChecks).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('should create a monitor record', async () => {
      prisma.monitor.create.mockResolvedValue({ id: 'm1', siteId: 's1', platform: 'CHATGPT', query: 'test query' });

      const result = await service.create({ siteId: 's1', platform: 'CHATGPT', query: 'test query' });

      expect(result.id).toBe('m1');
      expect(prisma.monitor.create).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a monitor record', async () => {
      prisma.monitor.delete.mockResolvedValue({ id: 'm1' });

      await service.remove('m1');

      expect(prisma.monitor.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });
  });
});
