import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GoogleAuth } from 'google-auth-library';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MeasurementDateRange as DateRange,
  normalizeMeasurementDateRange,
  parseGa4Date,
} from './analytics-sync.utils';
import {
  countCoreGeoFailures,
  getDirectorySiteSeoIssues,
  isIndexablePublicBlogArticle,
  publicIndexableBlogArticleWhere,
} from '../../common/utils/public-data-filter';

const GSC_PROVIDER = 'gsc';
const GA4_PROVIDER = 'ga4';
const DAY_MS = 86_400_000;
const CREATE_BATCH_SIZE = 1_000;
const MIN_ACTIONABLE_GSC_IMPRESSIONS = 10;
const LOW_CTR_THRESHOLD = 0.02;
const GSC_ALL_DIMENSION_VALUE = '(all)';

interface GscApiRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface GscApiResponse {
  rows?: GscApiRow[];
}

interface Ga4DimensionValue {
  value?: string;
}

interface Ga4MetricValue {
  value?: string;
}

interface Ga4ApiRow {
  dimensionValues?: Ga4DimensionValue[];
  metricValues?: Ga4MetricValue[];
}

interface Ga4ApiResponse {
  rows?: Ga4ApiRow[];
  rowCount?: number;
}

interface SearchPageAggregate {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
}

interface SearchQueryPageAggregate extends SearchPageAggregate {
  query: string;
}

interface DynamicPageState {
  indexable: boolean;
  redirectTarget?: string;
}

function numeric(value?: string): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integer(value?: string): number {
  return Math.round(numeric(value));
}

function normalizeLandingPage(value: string): string {
  if (!value || value === '(not set)') return '/';
  try {
    const url = new URL(value, 'https://www.geovault.app');
    return `${url.pathname}${url.search}`;
  } catch {
    return value.startsWith('/') ? value : `/${value}`;
  }
}

@Injectable()
export class AnalyticsSyncService {
  private readonly logger = new Logger(AnalyticsSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  private serviceAccountJson(): string {
    const raw = process.env.GOOGLE_MEASUREMENT_SERVICE_ACCOUNT_JSON;
    if (raw) return raw;
    const encoded = process.env.GOOGLE_MEASUREMENT_SERVICE_ACCOUNT_JSON_BASE64;
    if (encoded) return Buffer.from(encoded, 'base64').toString('utf8');
    throw new ServiceUnavailableException(
      'Google measurement service account is not configured',
    );
  }

  private auth(scopes: string[]): GoogleAuth {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(this.serviceAccountJson()) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        'Google measurement service account JSON is invalid',
      );
    }
    return new GoogleAuth({ credentials, scopes });
  }

  private async markRunning(provider: string, range: DateRange) {
    await this.prisma.analyticsSyncState.upsert({
      where: { provider },
      create: {
        provider,
        status: 'running',
        lastStartedAt: new Date(),
        lastDateFrom: new Date(`${range.startDate}T00:00:00.000Z`),
        lastDateTo: new Date(`${range.endDate}T00:00:00.000Z`),
      },
      update: {
        status: 'running',
        lastStartedAt: new Date(),
        lastDateFrom: new Date(`${range.startDate}T00:00:00.000Z`),
        lastDateTo: new Date(`${range.endDate}T00:00:00.000Z`),
        lastError: null,
      },
    });
  }

  private async markSuccess(provider: string, rowCount: number) {
    await this.prisma.analyticsSyncState.update({
      where: { provider },
      data: {
        // A successful HTTP response with zero facts is not healthy analytics.
        // Keep it observable so a wrong GA4 property/stream cannot masquerade
        // as a completed measurement pipeline.
        status: rowCount > 0 ? 'success' : 'empty',
        lastSuccessAt: new Date(),
        lastRowCount: rowCount,
        lastError: null,
      },
    });
  }

  private async markFailed(provider: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.prisma.analyticsSyncState.upsert({
      where: { provider },
      create: { provider, status: 'failed', lastError: message.slice(0, 4_000) },
      update: { status: 'failed', lastError: message.slice(0, 4_000) },
    });
  }

  async syncSearchConsole(startDate?: string, endDate?: string) {
    const range = normalizeMeasurementDateRange(startDate, endDate);
    const siteUrl = process.env.GSC_SITE_URL || 'https://www.geovault.app/';
    await this.markRunning(GSC_PROVIDER, range);

    try {
      const client = await this.auth([
        'https://www.googleapis.com/auth/webmasters.readonly',
      ]).getClient();
      // GSC suppresses anonymized queries. A query-dimensional response can
      // therefore contain only a fraction of the real clicks/impressions and
      // must never be used as a page total. Fetch page totals and disclosed
      // query evidence independently, then distinguish them with explicit
      // aggregate dimension sentinels in the existing schema.
      const [pageRows, queryRows] = await Promise.all([
        this.fetchSearchConsoleRows(client, siteUrl, range, ['date', 'page']),
        this.fetchSearchConsoleRows(client, siteUrl, range, ['date', 'page', 'query']),
      ]);
      const syncedAt = new Date();
      const pageData = pageRows.flatMap((row) => {
        const keys = row.keys || [];
        if (keys.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(keys[0]) || !keys[1]) return [];
        return [{
          date: new Date(`${keys[0]}T00:00:00.000Z`),
          siteUrl,
          page: keys[1] || '',
          query: '',
          country: GSC_ALL_DIMENSION_VALUE,
          device: GSC_ALL_DIMENSION_VALUE,
          searchType: 'web',
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0,
          dataState: 'all',
          syncedAt,
        }];
      });
      const queryData = queryRows.flatMap((row) => {
        const keys = row.keys || [];
        if (
          keys.length < 3
          || !/^\d{4}-\d{2}-\d{2}$/.test(keys[0])
          || !keys[1]
          || !keys[2]
        ) return [];
        return [{
          date: new Date(`${keys[0]}T00:00:00.000Z`),
          siteUrl,
          page: keys[1],
          query: keys[2],
          country: GSC_ALL_DIMENSION_VALUE,
          device: GSC_ALL_DIMENSION_VALUE,
          searchType: 'web',
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0,
          dataState: 'all',
          syncedAt,
        }];
      });
      const data = [...pageData, ...queryData];

      await this.prisma.$transaction(async (tx) => {
        await tx.searchPerformanceDaily.deleteMany({
          where: {
            siteUrl,
            date: {
              gte: new Date(`${range.startDate}T00:00:00.000Z`),
              lte: new Date(`${range.endDate}T00:00:00.000Z`),
            },
          },
        });
        for (let index = 0; index < data.length; index += CREATE_BATCH_SIZE) {
          await tx.searchPerformanceDaily.createMany({
            data: data.slice(index, index + CREATE_BATCH_SIZE),
            skipDuplicates: true,
          });
        }
      }, { timeout: 120_000 });
      await this.markSuccess(GSC_PROVIDER, data.length);
      return {
        provider: GSC_PROVIDER,
        ...range,
        rowCount: data.length,
        pageRowCount: pageData.length,
        queryRowCount: queryData.length,
      };
    } catch (error) {
      await this.markFailed(GSC_PROVIDER, error);
      throw error;
    }
  }

  private async fetchSearchConsoleRows(
    client: { request<T>(args: Record<string, unknown>): Promise<{ data: T }> },
    siteUrl: string,
    range: DateRange,
    dimensions: string[],
  ): Promise<GscApiRow[]> {
    const rows: GscApiRow[] = [];
    const rowLimit = 25_000;
    for (let startRow = 0; ; startRow += rowLimit) {
      const response = await client.request<GscApiResponse>({
        url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        method: 'POST',
        data: {
          startDate: range.startDate,
          endDate: range.endDate,
          dimensions,
          dataState: 'all',
          type: 'web',
          rowLimit,
          startRow,
        },
      });
      const nextRows = response.data.rows || [];
      rows.push(...nextRows);
      if (nextRows.length < rowLimit) break;
    }
    return rows;
  }

  async syncGa4(startDate?: string, endDate?: string) {
    const range = normalizeMeasurementDateRange(startDate, endDate);
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      throw new ServiceUnavailableException('GA4_PROPERTY_ID is not configured');
    }
    await this.markRunning(GA4_PROVIDER, range);

    try {
      const client = await this.auth([
        'https://www.googleapis.com/auth/analytics.readonly',
      ]).getClient();
      const [landingRows, eventRows] = await Promise.all([
        this.fetchGa4Rows(client, propertyId, range, [
          'date',
          'landingPagePlusQueryString',
          'sessionSource',
          'sessionMedium',
        ], [
          'sessions',
          'activeUsers',
          'newUsers',
          'engagedSessions',
          'engagementRate',
          'averageSessionDuration',
          'screenPageViews',
          'eventCount',
          'keyEvents',
        ]),
        this.fetchGa4Rows(client, propertyId, range, [
          'date',
          'eventName',
        ], [
          'eventCount',
          'totalUsers',
          'keyEvents',
        ]),
      ]);

      const syncedAt = new Date();
      const landingData = landingRows.flatMap((row) => {
        const dimensions = row.dimensionValues || [];
        const metrics = row.metricValues || [];
        const dateValue = dimensions[0]?.value || '';
        if (!/^\d{8}$/.test(dateValue)) return [];
        return [{
          date: parseGa4Date(dateValue),
          propertyId,
          landingPage: normalizeLandingPage(dimensions[1]?.value || '/'),
          source: dimensions[2]?.value || '(direct)',
          medium: dimensions[3]?.value || '(none)',
          sessions: integer(metrics[0]?.value),
          activeUsers: integer(metrics[1]?.value),
          newUsers: integer(metrics[2]?.value),
          engagedSessions: integer(metrics[3]?.value),
          engagementRate: numeric(metrics[4]?.value),
          avgSessionDuration: numeric(metrics[5]?.value),
          screenPageViews: integer(metrics[6]?.value),
          eventCount: integer(metrics[7]?.value),
          keyEvents: numeric(metrics[8]?.value),
          syncedAt,
        }];
      });
      const eventData = eventRows.flatMap((row) => {
        const dimensions = row.dimensionValues || [];
        const metrics = row.metricValues || [];
        const dateValue = dimensions[0]?.value || '';
        const eventName = dimensions[1]?.value || '';
        if (!/^\d{8}$/.test(dateValue) || !eventName || eventName === '(not set)') return [];
        return [{
          date: parseGa4Date(dateValue),
          propertyId,
          eventName,
          eventCount: integer(metrics[0]?.value),
          totalUsers: integer(metrics[1]?.value),
          keyEvents: numeric(metrics[2]?.value),
          syncedAt,
        }];
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.ga4LandingPageDaily.deleteMany({
          where: {
            propertyId,
            date: {
              gte: new Date(`${range.startDate}T00:00:00.000Z`),
              lte: new Date(`${range.endDate}T00:00:00.000Z`),
            },
          },
        });
        await tx.ga4EventDaily.deleteMany({
          where: {
            propertyId,
            date: {
              gte: new Date(`${range.startDate}T00:00:00.000Z`),
              lte: new Date(`${range.endDate}T00:00:00.000Z`),
            },
          },
        });
        for (let index = 0; index < landingData.length; index += CREATE_BATCH_SIZE) {
          await tx.ga4LandingPageDaily.createMany({
            data: landingData.slice(index, index + CREATE_BATCH_SIZE),
            skipDuplicates: true,
          });
        }
        for (let index = 0; index < eventData.length; index += CREATE_BATCH_SIZE) {
          await tx.ga4EventDaily.createMany({
            data: eventData.slice(index, index + CREATE_BATCH_SIZE),
            skipDuplicates: true,
          });
        }
      }, { timeout: 120_000 });
      const rowCount = landingData.length + eventData.length;
      await this.markSuccess(GA4_PROVIDER, rowCount);
      return {
        provider: GA4_PROVIDER,
        ...range,
        rowCount,
        landingPageRowCount: landingData.length,
        eventRowCount: eventData.length,
      };
    } catch (error) {
      await this.markFailed(GA4_PROVIDER, error);
      throw error;
    }
  }

  private async fetchGa4Rows(
    client: { request<T>(args: Record<string, unknown>): Promise<{ data: T }> },
    propertyId: string,
    range: DateRange,
    dimensions: string[],
    metrics: string[],
  ): Promise<Ga4ApiRow[]> {
    const rows: Ga4ApiRow[] = [];
    const limit = 100_000;
    for (let offset = 0; ; offset += limit) {
      const response = await client.request<Ga4ApiResponse>({
        url: `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
        method: 'POST',
        data: {
          dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
          dimensions: dimensions.map((name) => ({ name })),
          metrics: metrics.map((name) => ({ name })),
          limit: String(limit),
          offset: String(offset),
          keepEmptyRows: false,
        },
      });
      const nextRows = response.data.rows || [];
      rows.push(...nextRows);
      if (nextRows.length < limit || rows.length >= (response.data.rowCount || 0)) break;
    }
    return rows;
  }

  async syncAll(startDate?: string, endDate?: string) {
    const [gsc, ga4] = await Promise.allSettled([
      this.syncSearchConsole(startDate, endDate),
      this.syncGa4(startDate, endDate),
    ]);
    const serialize = (result: PromiseSettledResult<unknown>) =>
      result.status === 'fulfilled'
        ? { ok: true, result: result.value }
        : { ok: false, error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
    return { gsc: serialize(gsc), ga4: serialize(ga4) };
  }

  async status() {
    const [states, gscRows, ga4Rows, ga4EventRows, ga4Events] = await Promise.all([
      this.prisma.analyticsSyncState.findMany({ orderBy: { provider: 'asc' } }),
      this.prisma.searchPerformanceDaily.aggregate({
        _count: true,
        _min: { date: true },
        _max: { date: true },
      }),
      this.prisma.ga4LandingPageDaily.aggregate({
        _count: true,
        _min: { date: true },
        _max: { date: true },
      }),
      this.prisma.ga4EventDaily.aggregate({
        _count: true,
        _min: { date: true },
        _max: { date: true },
      }),
      this.prisma.ga4EventDaily.groupBy({
        by: ['eventName'],
        _sum: { eventCount: true, keyEvents: true },
      }),
    ]);
    return {
      configured: {
        serviceAccount: Boolean(
          process.env.GOOGLE_MEASUREMENT_SERVICE_ACCOUNT_JSON ||
          process.env.GOOGLE_MEASUREMENT_SERVICE_ACCOUNT_JSON_BASE64,
        ),
        gscSiteUrl: process.env.GSC_SITE_URL || null,
        ga4PropertyId: process.env.GA4_PROPERTY_ID || null,
      },
      rowCounts: {
        gsc: gscRows._count,
        ga4: ga4Rows._count,
        ga4Events: ga4EventRows._count,
      },
      coverage: {
        gsc: { from: gscRows._min.date, to: gscRows._max.date },
        ga4: { from: ga4Rows._min.date, to: ga4Rows._max.date },
        ga4Events: { from: ga4EventRows._min.date, to: ga4EventRows._max.date },
      },
      ga4Events: ga4Events
        .map((row) => ({
          eventName: row.eventName,
          eventCount: row._sum.eventCount || 0,
          keyEvents: row._sum.keyEvents || 0,
        }))
        .sort((a, b) => b.eventCount - a.eventCount),
      states,
    };
  }

  async opportunities(days = 28) {
    const safeDays = Number.isFinite(days)
      ? Math.max(1, Math.min(Math.trunc(days), 93))
      : 28;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const since = new Date(today.getTime() - (safeDays - 1) * DAY_MS);
    const [searchPages, searchQueries, gaPages] = await Promise.all([
      this.prisma.$queryRaw<SearchPageAggregate[]>(Prisma.sql`
        SELECT
          "page",
          SUM("clicks")::double precision AS "clicks",
          SUM("impressions")::double precision AS "impressions",
          COALESCE(
            SUM("position" * "impressions") / NULLIF(SUM("impressions"), 0),
            0
          )::double precision AS "position"
        FROM "search_performance_daily"
        WHERE "date" >= ${since}
          AND "query" = ''
          AND "country" = '(all)'
          AND "device" = '(all)'
        GROUP BY "page"
        HAVING SUM("impressions") > 0
        ORDER BY SUM("impressions") DESC
        LIMIT 100
      `),
      this.prisma.$queryRaw<SearchQueryPageAggregate[]>(Prisma.sql`
        SELECT
          "page",
          "query",
          SUM("clicks")::double precision AS "clicks",
          SUM("impressions")::double precision AS "impressions",
          COALESCE(
            SUM("position" * "impressions") / NULLIF(SUM("impressions"), 0),
            0
          )::double precision AS "position"
        FROM "search_performance_daily"
        WHERE "date" >= ${since}
          AND "query" <> ''
          AND "country" = '(all)'
          AND "device" = '(all)'
        GROUP BY "page", "query"
        HAVING SUM("impressions") > 0
        ORDER BY SUM("impressions") DESC
        LIMIT 1000
      `),
      this.prisma.ga4LandingPageDaily.groupBy({
        by: ['landingPage'],
        where: { date: { gte: since } },
        _sum: { sessions: true, engagedSessions: true, keyEvents: true },
      }),
    ]);
    const dynamicPageStates = await this.getDynamicPageIndexability(
      searchPages.map((row) => row.page),
    );
    const gaByPath = new Map<string, {
      sessions: number;
      engagedSessions: number;
      keyEvents: number;
    }>();
    for (const row of gaPages) {
      const path = normalizeLandingPage(row.landingPage).split('?')[0];
      const aggregate = gaByPath.get(path) || {
        sessions: 0,
        engagedSessions: 0,
        keyEvents: 0,
      };
      aggregate.sessions += Number(row._sum.sessions || 0);
      aggregate.engagedSessions += Number(row._sum.engagedSessions || 0);
      aggregate.keyEvents += Number(row._sum.keyEvents || 0);
      gaByPath.set(path, aggregate);
    }
    const queriesByPage = new Map<string, SearchQueryPageAggregate[]>();
    for (const row of searchQueries) {
      const rows = queriesByPage.get(row.page) || [];
      rows.push(row);
      queriesByPage.set(row.page, rows);
    }

    const queue = searchPages.map((row) => {
      const clicks = Number(row.clicks || 0);
      const impressions = Number(row.impressions || 0);
      const position = Number(row.position || 0);
      const ctr = impressions > 0 ? clicks / impressions : 0;
      const path = normalizeLandingPage(row.page).split('?')[0];
      const pageState = dynamicPageStates.get(path);
      const currentlyIndexable = pageState?.indexable !== false;
      const redirectTarget = pageState?.redirectTarget || null;
      const reasonCodes: string[] = [];
      const hasActionableSearchSample = impressions >= MIN_ACTIONABLE_GSC_IMPRESSIONS;
      if (redirectTarget) {
        reasonCodes.push('redirected_to_canonical');
      } else if (!currentlyIndexable) {
        reasonCodes.push('not_currently_indexable');
      }
      if (
        currentlyIndexable
        && clicks === 0
        && hasActionableSearchSample
        && position > 0
        && position <= 20
      ) {
        reasonCodes.push('high_impressions_zero_clicks');
      }
      if (
        currentlyIndexable
        && hasActionableSearchSample
        && position > 20
        && position <= 50
      ) {
        reasonCodes.push('ranking_beyond_page_two');
      }
      if (
        currentlyIndexable
        && hasActionableSearchSample
        && position > 0
        && position <= 10
        && ctr < LOW_CTR_THRESHOLD
      ) {
        reasonCodes.push('page_one_low_ctr');
      }
      if (
        currentlyIndexable
        && hasActionableSearchSample
        && position > 10
        && position <= 20
      ) {
        reasonCodes.push('page_two_ranking');
      }
      const ga4 = gaByPath.get(path) || null;
      if (
        currentlyIndexable
        && ga4
        && Number(ga4.sessions || 0) >= 10
        && Number(ga4.engagedSessions || 0) / Number(ga4.sessions || 1) < 0.4
      ) {
        reasonCodes.push('low_engagement');
      }
      const priority = !currentlyIndexable
        ? 'monitor'
        : (
            reasonCodes.includes('high_impressions_zero_clicks')
            && (
              reasonCodes.includes('page_one_low_ctr')
              || reasonCodes.includes('page_two_ranking')
            )
          )
          ? 'high'
          : reasonCodes.length > 0
            ? 'medium'
            : 'monitor';
      return {
        page: row.page,
        clicks,
        impressions,
        ctr,
        position,
        currentlyIndexable,
        redirectTarget,
        priority,
        reasonCodes,
        suggestedAction: this.opportunityAction(reasonCodes),
        topQueries: (queriesByPage.get(row.page) || [])
          .sort((a, b) => Number(b.impressions) - Number(a.impressions))
          .slice(0, 5)
          .map((query) => ({
            query: query.query,
            clicks: Number(query.clicks || 0),
            impressions: Number(query.impressions || 0),
            ctr: Number(query.impressions || 0) > 0
              ? Number(query.clicks || 0) / Number(query.impressions)
              : 0,
            position: Number(query.position || 0),
          })),
        ga4,
      };
    });

    const priorityRank: Record<string, number> = { high: 0, medium: 1, monitor: 2 };
    return queue.sort((a, b) =>
      priorityRank[a.priority] - priorityRank[b.priority]
      || b.impressions - a.impressions,
    );
  }

  private opportunityAction(reasonCodes: string[]): string {
    if (reasonCodes.includes('redirected_to_canonical')) {
      return '舊網址目前已永久轉址至替代文章；等待搜尋訊號整併，不在舊網址重複改文案。';
    }
    if (reasonCodes.includes('not_currently_indexable')) {
      return '目前頁面不符合公開索引門檻；先確認應退役或補齊公開證據，不做 CTR 文案優化。';
    }
    if (reasonCodes.includes('high_impressions_zero_clicks')) {
      return '核對主要查詢意圖，調整 title、description 與首屏證據摘要後追蹤 CTR。';
    }
    if (reasonCodes.includes('page_one_low_ctr')) {
      return '核對搜尋摘要是否直接回答主要查詢，並調整 title、description 與首屏證據摘要。';
    }
    if (reasonCodes.includes('page_two_ranking')) {
      return '補強與主要查詢直接相關的可驗證內容、內部連結與結構化資料。';
    }
    if (reasonCodes.includes('ranking_beyond_page_two')) {
      return '先核對搜尋意圖與內容事實，再補強可驗證主題內容、內部連結與來源，而不是只改搜尋摘要。';
    }
    if (reasonCodes.includes('low_engagement')) {
      return '檢查落地頁首屏是否回答查詢，並補強下一步導覽與轉換事件。';
    }
    return '持續累積資料，暫不做無差別重寫。';
  }

  private async getDynamicPageIndexability(
    pages: string[],
  ): Promise<Map<string, DynamicPageState>> {
    const result = new Map<string, DynamicPageState>();
    const blogRefs: Array<{ path: string; candidates: string[] }> = [];
    const directoryRefs: Array<{ path: string; siteId: string }> = [];

    for (const page of pages) {
      const path = normalizeLandingPage(page).split('?')[0];
      const blogMatch = path.match(/^\/blog\/([^/]+)$/);
      if (blogMatch) {
        try {
          blogRefs.push({
            path,
            candidates: [...new Set([
              blogMatch[1],
              decodeURIComponent(blogMatch[1]),
            ])],
          });
        } catch {
          result.set(path, { indexable: false });
        }
        continue;
      }
      const directoryMatch = path.match(/^\/directory\/([^/]+)$/);
      if (
        directoryMatch
        && directoryMatch[1] !== 'industry'
        && directoryMatch[1] !== 'industries'
      ) {
        directoryRefs.push({ path, siteId: directoryMatch[1] });
      }
    }

    const blogSlugs = [...new Set(blogRefs.flatMap((ref) => ref.candidates))];
    const directoryIds = [...new Set(directoryRefs.map((ref) => ref.siteId))];
    const [knownBlogs, indexableBlogs, directorySites] = await Promise.all([
      blogSlugs.length > 0
        ? this.prisma.blogArticle.findMany({
            where: {
              OR: [
                { slug: { in: blogSlugs } },
                { aliasSlugs: { hasSome: blogSlugs } },
              ],
            },
            select: { slug: true, aliasSlugs: true },
          })
        : Promise.resolve([]),
      blogSlugs.length > 0
        ? this.prisma.blogArticle.findMany({
            where: publicIndexableBlogArticleWhere({
              published: true,
              OR: [
                { slug: { in: blogSlugs } },
                { aliasSlugs: { hasSome: blogSlugs } },
              ],
            }),
            select: {
              slug: true,
              aliasSlugs: true,
              title: true,
              description: true,
              templateType: true,
              site: { select: { name: true, url: true } },
            },
          })
        : Promise.resolve([]),
      directoryIds.length > 0
        ? this.prisma.site.findMany({
            where: { id: { in: directoryIds }, isPublic: true },
            select: {
              id: true,
              name: true,
              url: true,
              industry: true,
              bestScore: true,
              bestScoreAt: true,
              profile: true,
              scans: {
                where: { status: 'COMPLETED' },
                orderBy: { completedAt: 'desc' },
                take: 1,
                select: {
                  completedAt: true,
                  results: { select: { indicator: true, status: true } },
                },
              },
              _count: { select: { qas: true, blogArticles: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const qualityIndexableBlogs = indexableBlogs.filter((article) =>
      isIndexablePublicBlogArticle(article),
    );
    for (const ref of blogRefs) {
      const directIndexable = qualityIndexableBlogs.find((article) =>
        ref.candidates.includes(article.slug),
      );
      const redirectArticle = qualityIndexableBlogs.find((article) =>
        (article.aliasSlugs || []).some((alias) => ref.candidates.includes(alias)),
      );
      const knownArticle = knownBlogs.find((article) =>
        ref.candidates.includes(article.slug)
        || (article.aliasSlugs || []).some((alias) => ref.candidates.includes(alias)),
      );

      if (directIndexable) {
        result.set(ref.path, { indexable: true });
      } else if (redirectArticle) {
        result.set(ref.path, {
          indexable: false,
          redirectTarget: `/blog/${encodeURIComponent(redirectArticle.slug)}`,
        });
      } else if (knownArticle) {
        result.set(ref.path, { indexable: false });
      } else if (ref.candidates.some((candidate) => this.isGeneratedBlogSlug(candidate))) {
        // A generated URL that no longer maps to a durable article is a 404,
        // not a CTR opportunity. Unknown human-readable slugs may still be
        // static frontend posts, so only fail closed for generator signatures.
        result.set(ref.path, { indexable: false });
      }
    }

    const indexableDirectoryIds = new Set(
      directorySites
        .filter((site) => getDirectorySiteSeoIssues({
          ...site,
          latestScanCompletedAt: site.scans[0]?.completedAt,
          qasCount: site._count.qas,
          blogArticlesCount: site._count.blogArticles,
          coreGeoFailuresCount: countCoreGeoFailures(site.scans[0]),
        }).length === 0)
        .map((site) => site.id),
    );
    for (const ref of directoryRefs) {
      result.set(ref.path, { indexable: indexableDirectoryIds.has(ref.siteId) });
    }

    return result;
  }

  private isGeneratedBlogSlug(slug: string): boolean {
    return /^cm[a-z0-9]{8,}-/i.test(slug)
      || /(?:^|[-_])(?:geo[-_]overview|score[-_]breakdown|competitor[-_]comparison|improvement[-_]tips|industry[-_]benchmark|brand[-_]reputation)(?:[-_]|$)/i.test(slug)
      || /-(?:brand-showcase|brand-profile|faq-deepdive)-/i.test(slug);
  }

  @Cron('15 4 * * *')
  async scheduledSync() {
    if (process.env.MEASUREMENT_SYNC_DISABLED === '1') return;
    const range = normalizeMeasurementDateRange(undefined, undefined, 3);
    const result = await this.syncAll(range.startDate, range.endDate);
    this.logger.log(`Measurement sync finished: ${JSON.stringify(result)}`);
  }
}
