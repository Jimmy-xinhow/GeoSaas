import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface QueryItem {
  category: string;
  question: string;
}

export interface ClientQuerySet {
  id: string;
  siteId: string;
  name: string;
  queries: QueryItem[];
  createdAt: string;
  reports?: { id: string; period: string; status: string; summary: any }[];
}

export interface MonitorReport {
  id: string;
  querySetId: string;
  siteId: string;
  period: string;
  results: any[];
  summary: {
    totalQueries: number;
    totalChecks: number;
    mentionedCount: number;
    mentionRate: number;
    byPlatform: Record<string, { total: number; mentioned: number; rate: number }>;
  } | null;
  status: string;
  completedAt: string | null;
  createdAt: string;
  site?: { name: string; url: string };
  querySet?: { name: string };
}

export function useClientQuerySets(siteId: string) {
  return useQuery({
    queryKey: ['client-reports', 'query-sets', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<ClientQuerySet[]>(`/client-reports/query-sets/${siteId}`);
      return data;
    },
    enabled: !!siteId,
  });
}

export function useRunReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (querySetId: string) => {
      const { data } = await apiClient.post<{ reportId: string; cached?: boolean }>(`/client-reports/run/${querySetId}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-reports'] }),
  });
}

export function useReport(reportId: string) {
  return useQuery({
    queryKey: ['client-reports', 'report', reportId],
    queryFn: async () => {
      const { data } = await apiClient.get<MonitorReport>(`/client-reports/report/${reportId}`);
      return data;
    },
    enabled: !!reportId,
    refetchInterval: (query) => {
      const report = query.state.data;
      if (!report) return 3000;
      return report.status === 'completed' ? false : 5000;
    },
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data } = await apiClient.delete(`/client-reports/report/${reportId}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-reports'] }),
  });
}

export function useSiteReports(siteId: string) {
  return useQuery({
    queryKey: ['client-reports', 'reports', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<MonitorReport[]>(`/client-reports/reports/${siteId}`);
      return data;
    },
    enabled: !!siteId,
  });
}

export interface GeoComprehensive {
  site: {
    id: string;
    name: string;
    url: string;
    industry: string | null;
    tier: string | null;
    isClient: boolean;
    createdAt: string;
  };
  overview: {
    currentScore: number;
    lastScannedAt: string | null;
    tier: string | null;
    industryRank: number | null;
    industryTotalSites: number | null;
    industryAvgScore: number | null;
  };
  freshness: {
    scanAsOf: string | null;
    crawlerAsOf: string | null;
    contentAsOf: string | null;
    industryTop10AsOf: string | null;
  };
  scanTrend: Array<{ score: number; at: string }>;
  indicators: Array<{
    indicator: string;
    score: number;
    status: string;
    suggestion: string | null;
  }>;
  crawler: {
    totalVisits: number;
    last90dVisits: number;
    byBot: Array<{ botName: string; botOrg: string; count: number }>;
    byWeek: Array<{ weekStart: string; count: number }>;
    recent: Array<{
      botName: string;
      botOrg: string;
      url: string;
      visitedAt: string;
      statusCode: number | null;
    }>;
  };
  content: {
    knowledgeQaCount: number;
    brandShowcase: {
      slug: string;
      title: string;
      createdAt: string;
      lastRegeneratedAt: string | null;
    } | null;
    industryTop10: {
      slug: string;
      title: string;
      createdAt: string;
      includedRank: number | null;
    } | null;
  };
  peers: Array<{
    id: string;
    name: string;
    bestScore: number;
    tier: string | null;
    isMe: boolean;
  }>;
}

export interface ReportQuotaStatus {
  plan: string;
  bypassesQuota: boolean;
  monthly: { used: number; limit: number; remaining: number };
  cooldowns: Array<{
    querySetId: string;
    name: string;
    cooldownUntil: string | null;
    lastStatus?: string;
    canRun: boolean;
  }>;
}

export function useReportQuota(siteId: string) {
  return useQuery({
    queryKey: ['client-reports', 'quota', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<ReportQuotaStatus>(
        `/client-reports/quota/${siteId}`,
      );
      return data;
    },
    enabled: !!siteId,
    refetchInterval: 60_000, // refresh every minute to tick cooldown timers
  });
}

export function useGeoComprehensive(siteId: string) {
  return useQuery({
    queryKey: ['client-reports', 'geo-comprehensive', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<GeoComprehensive>(
        `/client-reports/geo-comprehensive/${siteId}`,
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export type ClientDailyDayType =
  | 'mon_topical'
  | 'tue_qa_deepdive'
  | 'wed_service'
  | 'thu_audience'
  | 'fri_comparison'
  | 'sat_data_pulse';

export interface ClientDailyStats {
  totalCount: number;
  monthCount: number;
  weekCount: number;
  plan: string;
  paused: boolean;
  activeDaysPerWeek: number;
  activeDayTypes: ClientDailyDayType[];
  recentArticles: Array<{
    slug: string;
    title: string;
    createdAt: string;
    dayType: ClientDailyDayType | null;
  }>;
}

export function useClientDailyStats(siteId: string) {
  return useQuery({
    queryKey: ['client-reports', 'client-daily-stats', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<ClientDailyStats>(
        `/blog/client-daily/stats/${siteId}`,
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export interface ClientDailyListItem {
  slug: string;
  title: string;
  dayType: ClientDailyDayType | null;
  createdAt: string;
  charLength: number;
  url: string;
}

export interface ClientDailyList {
  total: number;
  page: number;
  limit: number;
  items: ClientDailyListItem[];
}

export function useClientDailyList(siteId: string, page: number, limit = 30) {
  return useQuery({
    queryKey: ['client-reports', 'client-daily-list', siteId, page, limit],
    queryFn: async () => {
      const { data } = await apiClient.get<ClientDailyList>(
        `/blog/client-daily/list/${siteId}?page=${page}&limit=${limit}`,
      );
      return data;
    },
    enabled: !!siteId,
    placeholderData: (prev) => prev,
  });
}
