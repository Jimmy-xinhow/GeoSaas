import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GoogleAuth } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MeasurementDateRange as DateRange,
  normalizeMeasurementDateRange,
  parseGa4Date,
} from './analytics-sync.utils';

const GSC_PROVIDER = 'gsc';
const GA4_PROVIDER = 'ga4';
const DAY_MS = 86_400_000;
const CREATE_BATCH_SIZE = 1_000;

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
        status: 'success',
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
      const rows: GscApiRow[] = [];
      const rowLimit = 25_000;

      for (let startRow = 0; ; startRow += rowLimit) {
        const response = await client.request<GscApiResponse>({
          url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
          method: 'POST',
          data: {
            startDate: range.startDate,
            endDate: range.endDate,
            dimensions: ['date', 'page', 'query', 'country', 'device'],
            dataState: 'all',
            type: 'web',
            rowLimit,
            startRow,
          },
        });
        const pageRows = response.data.rows || [];
        rows.push(...pageRows);
        if (pageRows.length < rowLimit) break;
      }

      const data = rows.flatMap((row) => {
        const keys = row.keys || [];
        if (keys.length < 5 || !/^\d{4}-\d{2}-\d{2}$/.test(keys[0])) return [];
        return [{
          date: new Date(`${keys[0]}T00:00:00.000Z`),
          siteUrl,
          page: keys[1] || '',
          query: keys[2] || '',
          country: keys[3] || '',
          device: keys[4] || '',
          searchType: 'web',
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0,
          dataState: 'all',
          syncedAt: new Date(),
        }];
      });

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
      return { provider: GSC_PROVIDER, ...range, rowCount: data.length };
    } catch (error) {
      await this.markFailed(GSC_PROVIDER, error);
      throw error;
    }
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
      const rows: Ga4ApiRow[] = [];
      const limit = 100_000;

      for (let offset = 0; ; offset += limit) {
        const response = await client.request<Ga4ApiResponse>({
          url: `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
          method: 'POST',
          data: {
            dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
            dimensions: [
              { name: 'date' },
              { name: 'landingPagePlusQueryString' },
              { name: 'sessionSource' },
              { name: 'sessionMedium' },
            ],
            metrics: [
              { name: 'sessions' },
              { name: 'activeUsers' },
              { name: 'newUsers' },
              { name: 'engagedSessions' },
              { name: 'engagementRate' },
              { name: 'averageSessionDuration' },
              { name: 'screenPageViews' },
              { name: 'eventCount' },
              { name: 'keyEvents' },
            ],
            limit: String(limit),
            offset: String(offset),
            keepEmptyRows: false,
          },
        });
        const pageRows = response.data.rows || [];
        rows.push(...pageRows);
        if (pageRows.length < limit || rows.length >= (response.data.rowCount || 0)) break;
      }

      const data = rows.flatMap((row) => {
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
          syncedAt: new Date(),
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
        for (let index = 0; index < data.length; index += CREATE_BATCH_SIZE) {
          await tx.ga4LandingPageDaily.createMany({
            data: data.slice(index, index + CREATE_BATCH_SIZE),
            skipDuplicates: true,
          });
        }
      }, { timeout: 120_000 });
      await this.markSuccess(GA4_PROVIDER, data.length);
      return { provider: GA4_PROVIDER, ...range, rowCount: data.length };
    } catch (error) {
      await this.markFailed(GA4_PROVIDER, error);
      throw error;
    }
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
    const [states, gscRows, ga4Rows] = await Promise.all([
      this.prisma.analyticsSyncState.findMany({ orderBy: { provider: 'asc' } }),
      this.prisma.searchPerformanceDaily.count(),
      this.prisma.ga4LandingPageDaily.count(),
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
      rowCounts: { gsc: gscRows, ga4: ga4Rows },
      states,
    };
  }

  async opportunities(days = 28) {
    const safeDays = Number.isFinite(days)
      ? Math.max(1, Math.min(Math.trunc(days), 93))
      : 28;
    const since = new Date(Date.now() - safeDays * DAY_MS);
    const [searchPages, gaPages] = await Promise.all([
      this.prisma.searchPerformanceDaily.groupBy({
        by: ['page'],
        where: { date: { gte: since } },
        _sum: { clicks: true, impressions: true },
        _avg: { position: true },
        orderBy: { _sum: { impressions: 'desc' } },
        take: 100,
      }),
      this.prisma.ga4LandingPageDaily.groupBy({
        by: ['landingPage'],
        where: { date: { gte: since } },
        _sum: { sessions: true, engagedSessions: true, keyEvents: true },
      }),
    ]);
    const gaByPath = new Map(
      gaPages.map((row) => [row.landingPage.split('?')[0], row._sum]),
    );
    return searchPages.map((row) => {
      const clicks = row._sum.clicks || 0;
      const impressions = row._sum.impressions || 0;
      const path = normalizeLandingPage(row.page).split('?')[0];
      return {
        page: row.page,
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        position: row._avg.position || 0,
        ga4: gaByPath.get(path) || null,
      };
    });
  }

  @Cron('15 4 * * *')
  async scheduledSync() {
    if (process.env.MEASUREMENT_SYNC_DISABLED === '1') return;
    const range = normalizeMeasurementDateRange(undefined, undefined, 3);
    const result = await this.syncAll(range.startDate, range.endDate);
    this.logger.log(`Measurement sync finished: ${JSON.stringify(result)}`);
  }
}
