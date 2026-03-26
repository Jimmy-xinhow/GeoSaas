import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface DirectorySite {
  id: string;
  name: string;
  url: string;
  industry: string | null;
  tier: string | null;
  bestScore: number;
  bestScoreAt: string | null;
  createdAt: string;
}

export interface DirectoryListResult {
  items: DirectorySite[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DirectoryStats {
  totalSites: number;
  avgScore: number;
  tierDistribution: Record<string, number>;
}

export interface DirectoryQueryParams {
  search?: string;
  industry?: string;
  tier?: string;
  minScore?: number;
  page?: number;
  limit?: number;
}

export function useDirectory(params: DirectoryQueryParams = {}) {
  return useQuery({
    queryKey: ['directory', params],
    queryFn: async () => {
      const { data } = await apiClient.get<DirectoryListResult>('/directory', {
        params,
      });
      return data;
    },
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['directory', 'leaderboard'],
    queryFn: async () => {
      const { data } = await apiClient.get<DirectorySite[]>(
        '/directory/leaderboard',
      );
      return data;
    },
  });
}

export function useDirectoryStats() {
  return useQuery({
    queryKey: ['directory', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get<DirectoryStats>('/directory/stats');
      return data;
    },
  });
}

export function useNewcomers() {
  return useQuery({
    queryKey: ['directory', 'newcomers'],
    queryFn: async () => {
      const { data } = await apiClient.get<DirectorySite[]>(
        '/directory/newcomers',
      );
      return data;
    },
  });
}

export interface RankedSite extends DirectorySite {
  todayVisits?: number;
  totalVisits?: number;
  lastScanScore?: number;
  lastScanAt?: string;
}

export function useTodayHottest() {
  return useQuery({
    queryKey: ['directory', 'today-hottest'],
    queryFn: async () => {
      const { data } = await apiClient.get<RankedSite[]>('/directory/today-hottest');
      return data;
    },
  });
}

export function useMostCrawled() {
  return useQuery({
    queryKey: ['directory', 'most-crawled'],
    queryFn: async () => {
      const { data } = await apiClient.get<RankedSite[]>('/directory/most-crawled');
      return data;
    },
  });
}

export function useRecentlyActive() {
  return useQuery({
    queryKey: ['directory', 'recently-active'],
    queryFn: async () => {
      const { data } = await apiClient.get<RankedSite[]>('/directory/recently-active');
      return data;
    },
  });
}

export interface ProgressStar {
  id: string;
  name: string;
  url: string;
  industry: string | null;
  tier: string | null;
  firstScore: number;
  bestScore: number;
  improvement: number;
  scanCount: number;
  daysToImprove: number;
}

export function useProgressStars() {
  return useQuery({
    queryKey: ['directory', 'progress-stars'],
    queryFn: async () => {
      const { data } = await apiClient.get<ProgressStar[]>('/directory/progress-stars');
      return data;
    },
  });
}

export interface IndustryStats {
  industry: string;
  totalSites: number;
  avgScore: number;
  maxScore: number;
  topSites: { id: string; name: string; url: string; tier: string | null; bestScore: number }[];
}

export interface IndustryOverview {
  industry: string;
  count: number;
  avgScore: number;
}

export function useIndustryStats(industry: string) {
  return useQuery({
    queryKey: ['directory', 'industry', industry],
    queryFn: async () => {
      const { data } = await apiClient.get<IndustryStats>(`/directory/industry/${industry}`);
      return data;
    },
    enabled: !!industry,
  });
}

export function useAllIndustryStats() {
  return useQuery({
    queryKey: ['directory', 'industry-stats'],
    queryFn: async () => {
      const { data } = await apiClient.get<IndustryOverview[]>('/directory/industry-stats');
      return data;
    },
  });
}

export interface PlatformStats {
  totalSites: number;
  totalScans: number;
  totalCrawlerVisits: number;
  crawlerVisits24h: number;
  activeBots: number;
}

export function usePlatformStats() {
  return useQuery({
    queryKey: ['directory', 'platform-stats'],
    queryFn: async () => {
      const { data } = await apiClient.get<PlatformStats>('/directory/platform-stats');
      return data;
    },
    refetchInterval: 60000, // refresh every minute
  });
}

export interface CrawlerFeedItem {
  id: string;
  botName: string;
  botOrg: string;
  url: string;
  statusCode: number;
  visitedAt: string;
  site: {
    name: string;
    url: string;
    industry: string | null;
  };
}

export interface CrawlerFeedResult {
  feed: CrawlerFeedItem[];
  stats: {
    last24h: number;
    activeBots: { name: string; count: number }[];
  };
}

export function useCrawlerFeed() {
  return useQuery({
    queryKey: ['directory', 'crawler-feed'],
    queryFn: async () => {
      const { data } = await apiClient.get<CrawlerFeedResult>(
        '/directory/crawler-feed',
      );
      return data;
    },
    refetchInterval: 30000,
  });
}

export interface DirectorySiteDetail {
  id: string;
  name: string;
  url: string;
  industry: string | null;
  tier: string | null;
  bestScore: number;
  bestScoreAt: string | null;
  profile: Record<string, any> | null;
  createdAt: string;
  latestScan: {
    id: string;
    totalScore: number;
    completedAt: string;
    results: {
      indicator: string;
      score: number;
      status: string;
      suggestion: string | null;
    }[];
  } | null;
  qas: {
    id: string;
    question: string;
    answer: string;
    category: string | null;
  }[];
  scoreTrend: { date: string; score: number }[];
  badges: { badge: string; label: string; awardedAt: string }[];
  crawlerActivity: {
    totalVisits: number;
    bots: {
      name: string;
      org: string;
      visitCount: number;
      lastVisit: string;
    }[];
  };
}

export function useSiteDetail(siteId: string) {
  return useQuery({
    queryKey: ['directory', 'site', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<DirectorySiteDetail>(
        `/directory/${siteId}`,
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export function useTogglePublic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      siteId,
      isPublic,
      industry,
    }: {
      siteId: string;
      isPublic: boolean;
      industry?: string;
    }) => {
      const { data } = await apiClient.patch(`/sites/${siteId}/directory`, {
        isPublic,
        industry,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directory'] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}
