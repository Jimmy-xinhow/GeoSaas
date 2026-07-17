import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SitesService } from './sites.service';

export type GeoGrowthStageKey =
  | 'diagnose'
  | 'technical'
  | 'knowledge'
  | 'content'
  | 'measurement';

export type GeoGrowthStageStatus = 'completed' | 'current' | 'upcoming';

export interface GeoGrowthStage {
  key: GeoGrowthStageKey;
  order: number;
  title: string;
  description: string;
  outcome: string;
  status: GeoGrowthStageStatus;
  href: string;
  cta: string;
  evidence: string[];
}

export interface GeoGrowthPlan {
  site: { id: string; name: string; url: string };
  progress: number;
  currentStageKey: GeoGrowthStageKey | 'maintain';
  nextAction: {
    stageKey: GeoGrowthStageKey | 'maintain';
    title: string;
    description: string;
    href: string;
    cta: string;
    action: 'navigate' | 'scan';
  };
  stages: GeoGrowthStage[];
  quality: {
    standard: 'high';
    factConfidence: number;
    minimumFactConfidence: number;
    latestArticleScore: number | null;
    officialMinimumScore: number;
    passedAttempts30d: number;
    autoRepairAttempts30d: number;
    officialApprovedCount: number;
    officialFailedCount: number;
    platformPublishedCount: number;
  };
  signals: {
    latestScanScore: number | null;
    latestScanAt: string | null;
    technicalIssues: number;
    qaCount: number;
    hasLlmsTxt: boolean;
    querySetCount: number;
    latestReportAt: string | null;
    crawlerVisits: number;
  };
  generatedAt: string;
}

const OFFICIAL_MINIMUM_SCORE = 82;
const MINIMUM_FACT_CONFIDENCE = 70;

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasText(...values: unknown[]): boolean {
  return values.some((value) => typeof value === 'string' && value.trim().length > 0);
}

function hasArrayText(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => String(item).trim().length > 0);
}

function qualityScore(value: unknown): number | null {
  const report = recordValue(value);
  const score = Number(report.score);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
}

@Injectable()
export class GeoGrowthPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sitesService: SitesService,
  ) {}

  async getPlan(
    siteId: string,
    userId: string,
    role?: string,
  ): Promise<GeoGrowthPlan> {
    const site = await this.sitesService.findOne(siteId, userId, role);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      latestScan,
      qaCount,
      officialArticles,
      qualityLogs,
      querySetCount,
      monitorQueryCount,
      latestReport,
      latestMonitorCheck,
      crawlerVisits,
      platformPublishedCount,
    ] = await Promise.all([
      this.prisma.scan.findFirst({
        where: { siteId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        select: {
          totalScore: true,
          completedAt: true,
          results: { select: { status: true } },
        },
      }),
      this.prisma.siteQa.count({ where: { siteId } }),
      this.prisma.officialSiteArticle.findMany({
        where: { siteId, status: { not: 'archived' } },
        orderBy: { updatedAt: 'desc' },
        select: { status: true, qualityReport: true, publishedUrl: true },
        take: 30,
      }),
      this.prisma.articleQualityLog.findMany({
        where: { siteId, createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: 'desc' },
        select: { passed: true, totalScore: true },
        take: 100,
      }),
      this.prisma.clientQuerySet.count({ where: { siteId } }),
      this.prisma.monitor.count({ where: { siteId } }),
      this.prisma.monitorReport.findFirst({
        where: { siteId, status: 'completed' },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true },
      }),
      this.prisma.monitor.findFirst({
        where: { siteId, response: { not: null } },
        orderBy: { checkedAt: 'desc' },
        select: { checkedAt: true },
      }),
      this.prisma.crawlerVisit.count({ where: { siteId, isSeeded: false } }),
      this.prisma.blogArticle.count({ where: { siteId, published: true } }),
    ]);

    const profile = recordValue(site.profile);
    const enriched = recordValue(profile._enriched);
    const location = hasText(profile.location, enriched.address);
    const services = hasText(profile.services, enriched.services);
    const positioning = hasText(
      profile.positioning,
      enriched.description,
    );
    const contact = hasText(
      profile.contact,
      enriched.telephone,
      enriched.email,
    );
    const audiences = hasArrayText(profile.targetAudiences)
      || hasText(profile.targetAudience, profile.audience);
    const boundaries = hasArrayText(profile.notFor)
      || hasArrayText(profile.forbidden)
      || hasText(profile.notFor, profile.forbidden);
    const hasLlmsTxt = hasText(site.llmsTxt);
    const factConfidence = Math.max(0, Math.min(100, Math.round(
      (location ? 12 : 0)
      + (services ? 18 : 0)
      + (positioning ? 14 : 0)
      + (contact ? 8 : 0)
      + (audiences ? 10 : 0)
      + (boundaries ? 6 : 0)
      + (qaCount >= 6 ? 18 : qaCount * 3)
      + (hasLlmsTxt ? 6 : 0)
      + (crawlerVisits > 0 ? 8 : 0)
    )));

    const technicalIssues = latestScan?.results.filter((result) => result.status !== 'pass').length ?? 0;
    const hardTechnicalIssues = latestScan?.results.filter((result) => result.status === 'fail').length ?? 0;
    const approvedStatuses = new Set(['approved', 'export_ready']);
    const officialApprovedCount = officialArticles.filter((article) =>
      approvedStatuses.has(article.status) || Boolean(article.publishedUrl),
    ).length;
    const officialFailedCount = officialArticles.filter((article) => article.status === 'quality_failed').length;
    const latestOfficialScore = officialArticles
      .map((article) => qualityScore(article.qualityReport))
      .find((score): score is number => score !== null) ?? null;
    const latestPassedQuality = qualityLogs.find((log) => log.passed)?.totalScore ?? null;
    const latestArticleScore = latestOfficialScore ?? latestPassedQuality;

    const completed: Record<GeoGrowthStageKey, boolean> = {
      diagnose: Boolean(latestScan),
      technical: Boolean(latestScan && latestScan.totalScore >= 80 && hardTechnicalIssues === 0),
      knowledge: factConfidence >= MINIMUM_FACT_CONFIDENCE && services && positioning && audiences && qaCount >= 6,
      content: officialApprovedCount > 0,
      measurement: (querySetCount + monitorQueryCount) > 0
        && Boolean(latestReport?.completedAt || latestMonitorCheck?.checkedAt),
    };

    const stageDefinitions: Array<Omit<GeoGrowthStage, 'status'>> = [
      {
        key: 'diagnose',
        order: 1,
        title: '建立 GEO 基準',
        description: '先掃描網站，找出 AI 與搜尋引擎目前看得到什麼。',
        outcome: '取得分數、缺失項目與可驗證的優化起點。',
        href: `/sites/${siteId}`,
        cta: latestScan ? '查看掃描結果' : '開始第一次掃描',
        evidence: latestScan
          ? [`最新分數 ${latestScan.totalScore}/100`, `${technicalIssues} 個待改善指標`]
          : ['尚未完成網站掃描'],
      },
      {
        key: 'technical',
        order: 2,
        title: '修復機器可讀性',
        description: '依優先順序修復結構化資料、索引訊號與頁面描述。',
        outcome: '讓 AI 爬蟲能讀取、理解並正確定位品牌資訊。',
        href: `/sites/${siteId}/guided-fix`,
        cta: '開始引導修復',
        evidence: latestScan
          ? [`${hardTechnicalIssues} 個失敗項目`, `${Math.max(0, technicalIssues - hardTechnicalIssues)} 個警告項目`]
          : ['需先完成基準掃描'],
      },
      {
        key: 'knowledge',
        order: 3,
        title: '建立可信品牌知識',
        description: '補齊服務、對象、限制、FAQ 與 llms.txt。',
        outcome: '讓系統只根據已確認的第一方資料生成內容。',
        href: `/sites/${siteId}/knowledge`,
        cta: '補齊品牌知識',
        evidence: [`事實完整度 ${factConfidence}/100`, `${qaCount}/6 組必要 FAQ`, hasLlmsTxt ? 'llms.txt 已建立' : 'llms.txt 尚未建立'],
      },
      {
        key: 'content',
        order: 4,
        title: '發布第一方可引用內容',
        description: '生成官網專屬文章，通過品質檢查後再交付發布。',
        outcome: '建立可被 AI 收錄、引用、推薦與摘要的官方來源。',
        href: `/sites/${siteId}/official-content`,
        cta: officialArticles.length > 0 ? '審核官網文章' : '建立官網文章',
        evidence: [`${officialApprovedCount} 篇已核准`, `${officialFailedCount} 篇被品質閘門攔截`],
      },
      {
        key: 'measurement',
        order: 5,
        title: '驗證 AI 引用成效',
        description: '用真實提問追蹤品牌是否被主要 AI 平台提及。',
        outcome: '以報告決定下一輪修復與內容主題，不靠感覺優化。',
        href: (querySetCount + monitorQueryCount) > 0 ? '/monitor/reports' : `/sites/${siteId}/monitor`,
        cta: (querySetCount + monitorQueryCount) > 0 ? '查看或執行驗收' : '建立監測問題',
        evidence: [`${querySetCount + monitorQueryCount} 組監測問題`, latestReport?.completedAt || latestMonitorCheck?.checkedAt ? '已有完成的引用檢測' : '尚無完成的引用檢測'],
      },
    ];

    const firstIncomplete = stageDefinitions.find((stage) => !completed[stage.key]);
    const stages: GeoGrowthStage[] = stageDefinitions.map((stage) => ({
      ...stage,
      status: completed[stage.key]
        ? 'completed'
        : firstIncomplete?.key === stage.key
          ? 'current'
          : 'upcoming',
    }));
    const progress = Math.round(
      (Object.values(completed).filter(Boolean).length / stageDefinitions.length) * 100,
    );

    const scanAgeDays = latestScan?.completedAt
      ? Math.floor((Date.now() - latestScan.completedAt.getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const nextAction = firstIncomplete
      ? {
          stageKey: firstIncomplete.key,
          title: firstIncomplete.title,
          description: firstIncomplete.outcome,
          href: firstIncomplete.href,
          cta: firstIncomplete.cta,
          action: firstIncomplete.key === 'diagnose' ? 'scan' as const : 'navigate' as const,
        }
      : scanAgeDays !== null && scanAgeDays >= 30
        ? {
            stageKey: 'maintain' as const,
            title: '重新掃描並開始下一輪優化',
            description: `距離上次掃描已 ${scanAgeDays} 天，先更新基準再決定新主題。`,
            href: `/sites/${siteId}`,
            cta: '重新掃描',
            action: 'scan' as const,
          }
        : {
            stageKey: 'maintain' as const,
            title: '持續擴充新的第一方主題',
            description: '目前核心流程已完成，下一步依 AI 引用報告建立新的官網內容。',
            href: `/sites/${siteId}/official-content`,
            cta: '規劃下一篇官網文章',
            action: 'navigate' as const,
          };

    return {
      site: { id: site.id, name: site.name, url: site.url },
      progress,
      currentStageKey: firstIncomplete?.key ?? 'maintain',
      nextAction,
      stages,
      quality: {
        standard: 'high',
        factConfidence,
        minimumFactConfidence: MINIMUM_FACT_CONFIDENCE,
        latestArticleScore,
        officialMinimumScore: OFFICIAL_MINIMUM_SCORE,
        passedAttempts30d: qualityLogs.filter((log) => log.passed).length,
        autoRepairAttempts30d: qualityLogs.filter((log) => !log.passed).length,
        officialApprovedCount,
        officialFailedCount,
        platformPublishedCount,
      },
      signals: {
        latestScanScore: latestScan?.totalScore ?? null,
        latestScanAt: latestScan?.completedAt?.toISOString() ?? null,
        technicalIssues,
        qaCount,
        hasLlmsTxt,
        querySetCount: querySetCount + monitorQueryCount,
        latestReportAt: latestReport?.completedAt?.toISOString()
          ?? latestMonitorCheck?.checkedAt?.toISOString()
          ?? null,
        crawlerVisits,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
