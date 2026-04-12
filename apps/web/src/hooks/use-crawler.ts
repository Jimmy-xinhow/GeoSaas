import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface BotStat {
  botName: string;
  count: number;
  lastVisit: string;
}

export interface CrawlerVisit {
  id: string;
  botName: string;
  botOrg: string;
  url: string;
  statusCode: number | null;
  visitedAt: string;
}

export interface CrawlerDashboard {
  totalVisits: number;
  last24h: number;
  uniqueBots: number;
  robotsStatus: string;
  botStats: BotStat[];
  recentVisits: CrawlerVisit[];
  hasToken: boolean;
}

export interface DailyCrawlerStat {
  date: string;
  total: number;
  bots: Record<string, number>;
}

export interface RobotsCheckResult {
  robotsTxt: string | null;
  allowedBots: Record<string, boolean> | null;
  sitemapUrls: string[] | null;
  checkedAt: string | null;
}

export interface SnippetResult {
  snippet: string;
  token: string;
}

export function useCrawlerDashboard(siteId: string) {
  return useQuery({
    queryKey: ['crawler', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<CrawlerDashboard>(
        `/sites/${siteId}/crawler`,
      );
      return data;
    },
    enabled: !!siteId,
    refetchInterval: 30000, // 30s auto-refresh
  });
}

export function useCrawlerStats(siteId: string) {
  return useQuery({
    queryKey: ['crawler', siteId, 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get<DailyCrawlerStat[]>(
        `/sites/${siteId}/crawler/stats`,
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export function useCrawlerRobots(siteId: string) {
  return useQuery({
    queryKey: ['crawler', siteId, 'robots'],
    queryFn: async () => {
      const { data } = await apiClient.get<RobotsCheckResult>(
        `/sites/${siteId}/crawler/robots`,
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export function useCrawlerSnippet(siteId: string) {
  return useQuery({
    queryKey: ['crawler', siteId, 'snippet'],
    queryFn: async () => {
      const { data } = await apiClient.get<SnippetResult>(
        `/crawler/snippet/${siteId}`,
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export interface VerifyResult {
  installed: boolean;
  verified?: boolean;
  message: string;
  snippetFound: boolean;
  reportsReceived: number;
  lastReport: string | null;
  details?: string;
}

export function useVerifyInstallation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (siteId: string) => {
      const { data } = await apiClient.post<VerifyResult>(
        `/sites/${siteId}/crawler/verify`,
      );
      return data;
    },
    onSuccess: (_, siteId) => {
      queryClient.invalidateQueries({ queryKey: ['crawler', siteId] });
    },
  });
}

export function useRegenerateToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (siteId: string) => {
      const { data } = await apiClient.post<SnippetResult>(
        `/sites/${siteId}/crawler/token/regenerate`,
      );
      return data;
    },
    onSuccess: (_, siteId) => {
      queryClient.invalidateQueries({ queryKey: ['crawler', siteId] });
    },
  });
}
