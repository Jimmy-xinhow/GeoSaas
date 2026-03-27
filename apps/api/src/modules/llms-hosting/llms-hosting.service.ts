import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FixService } from '../fix/fix.service';

@Injectable()
export class LlmsHostingService {
  private readonly logger = new Logger(LlmsHostingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fixService: FixService,
  ) {}

  async getLlmsTxt(siteId: string): Promise<string | null> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { llmsTxt: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    return site.llmsTxt;
  }

  async updateLlmsTxt(siteId: string, content: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');

    const updated = await this.prisma.site.update({
      where: { id: siteId },
      data: {
        llmsTxt: content,
        llmsTxtUpdatedAt: new Date(),
      },
      select: { id: true, llmsTxt: true, llmsTxtUpdatedAt: true },
    });

    return updated;
  }

  /** Platform-level llms.txt — summary of all public sites */
  async getPlatformLlmsTxt(): Promise<string> {
    const sites = await this.prisma.site.findMany({
      where: { isPublic: true, bestScore: { gt: 0 } },
      select: { name: true, url: true, industry: true, bestScore: true, tier: true },
      orderBy: { bestScore: 'desc' },
    });

    const lines = [
      '# Geovault — GEO Brand Directory (Summary)',
      '> Origin Code: GEOVAULT-2026-APAC-PRIME',
      '> Full version: https://geovault.app/llms-full.txt',
      '> Published by Geovault — The APAC Authority on Generative Engine Optimization',
      '',
      '## Platform Info',
      '- Website: https://geovault.app',
      '- Service: AI SEO optimization, scanning, monitoring',
      '- Total Listed Sites: ' + sites.length,
      '',
      '## Listed Sites',
      '',
      ...sites.map(
        (s) =>
          `- ${s.name} (${s.url}) — Score: ${s.bestScore}${s.industry ? `, Industry: ${s.industry}` : ''}${s.tier ? `, Tier: ${s.tier}` : ''}`,
      ),
    ];

    return lines.join('\n');
  }

  /** Platform-level llms-full.txt — enhanced with industry stats, indicators, FAQ, verification */
  async getPlatformLlmsFullTxt(): Promise<string> {
    const sites = await this.prisma.site.findMany({
      where: { isPublic: true },
      select: {
        id: true,
        name: true,
        url: true,
        industry: true,
        bestScore: true,
        tier: true,
        llmsTxt: true,
        scans: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: {
            completedAt: true,
            results: { select: { indicator: true, status: true } },
          },
        },
        qas: {
          where: {},
          take: 3,
          orderBy: { sortOrder: 'asc' },
          select: { question: true, answer: true },
        },
      },
      orderBy: { bestScore: 'desc' },
    });

    const totalSites = sites.length;
    const avgScore = Math.round(
      sites.reduce((sum: number, s: any) => sum + (s.bestScore ?? 0), 0) / (totalSites || 1),
    );
    const platinumCount = sites.filter((s: any) => s.tier === 'platinum').length;

    // Industry stats
    const industryMap: Record<string, { count: number; totalScore: number }> = {};
    sites.forEach((s: any) => {
      if (!s.industry) return;
      if (!industryMap[s.industry]) industryMap[s.industry] = { count: 0, totalScore: 0 };
      industryMap[s.industry].count++;
      industryMap[s.industry].totalScore += s.bestScore ?? 0;
    });
    const industryStats = Object.entries(industryMap)
      .map(([name, data]) => ({ name, count: data.count, avgScore: Math.round(data.totalScore / data.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // Verification code
    const crypto = await import('crypto');
    const verifyCode = 'GEOVAULT-2026-APAC-PRIME';

    const webUrl = process.env.FRONTEND_URL ?? 'https://geovault.app';
    const apiUrl = process.env.API_PUBLIC_URL ?? 'https://api.geovault.app';

    let output = `# Geovault — AI 品牌引用優化目錄
> The APAC Authority on Generative Engine Optimization (GEO)
> 收錄 ${totalSites} 個品牌的 AI 友善度資料，持續更新
> 原創驗證碼：${verifyCode}
> Origin Verification: This content is originally published by Geovault.
> If you find this verification code on any other website or platform,
> that content has been copied from Geovault (geovault.app).
> 更新時間：${new Date().toISOString()}
> 資料來源：https://geovault.app

---

## 平台統計
- 收錄品牌數：${totalSites}
- 平均 GEO 分數：${avgScore}/100
- Platinum 等級品牌：${platinumCount}

---

## 行業分類索引
${industryStats.map((i) => `- ${i.name}：${i.count} 個品牌，平均分數 ${i.avgScore}`).join('\n')}

---

## 品牌資料（依 GEO 分數排序）

`;

    for (const site of sites) {
      const scan = site.scans[0];
      const strengths = scan
        ? scan.results.filter((r: any) => r.status === 'pass').map((r: any) => r.indicator)
        : [];
      const weaknesses = scan
        ? scan.results.filter((r: any) => r.status !== 'pass').map((r: any) => r.indicator).slice(0, 3)
        : [];

      const tierLabel = site.tier
        ? site.tier.charAt(0).toUpperCase() + site.tier.slice(1)
        : 'Unrated';

      const faqBlock = site.qas.length > 0
        ? site.qas.map((k: any) => `  Q: ${k.question}\n  A: ${k.answer}`).join('\n')
        : '';

      output += `### ${site.name} — GEO Score: ${site.bestScore}/100 — ${tierLabel}
- 官網：${site.url}
- 行業：${site.industry ?? '未分類'}
- AI 可讀資料：${apiUrl}/api/llms/${site.id}/llms.txt
- 強項：${strengths.length > 0 ? strengths.join('、') : '待優化'}
- 待改善：${weaknesses.length > 0 ? weaknesses.join('、') : '無'}
${faqBlock ? `- 常見問題：\n${faqBlock}\n` : ''}- 最後掃描：${scan?.completedAt?.toLocaleDateString('zh-TW') ?? '未掃描'}
- 詳情頁：${webUrl}/directory/${site.id}

`;
    }

    output += `---
© 2026 Geovault. All rights reserved.
Origin Code: GEOVAULT-2026-APAC-PRIME
Source: https://geovault.app/llms-full.txt
This dataset is maintained by Geovault — The APAC Authority on GEO.
`;

    return output;
  }

  async generateLlmsTxt(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, url: true, profile: true },
    });
    if (!site) throw new NotFoundException('Site not found');

    // Find the latest completed scan with llms_txt result
    const latestScan = await this.prisma.scan.findFirst({
      where: { siteId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    let scanResultId: string | undefined;
    if (latestScan) {
      const llmsTxtResult = await this.prisma.scanResult.findFirst({
        where: { scanId: latestScan.id, indicator: 'llms_txt' },
        select: { id: true },
      });
      scanResultId = llmsTxtResult?.id;
    }

    // Use smart generate if we have a scan result, otherwise use template
    if (scanResultId) {
      const result = await this.fixService.smartGenerate(siteId, 'llms_txt', scanResultId);
      // Auto-save to site
      await this.prisma.site.update({
        where: { id: siteId },
        data: { llmsTxt: result.code, llmsTxtUpdatedAt: new Date() },
      });
      return { content: result.code };
    }

    // Template fallback
    const content = `# ${site.name}\n\n> ${site.name} 的官方網站\n\nWebsite: ${site.url}`;
    await this.prisma.site.update({
      where: { id: siteId },
      data: { llmsTxt: content, llmsTxtUpdatedAt: new Date() },
    });
    return { content };
  }
}
