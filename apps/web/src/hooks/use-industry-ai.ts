import { useQuery, useMutation } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

// ─── Types ───

interface RankingSite {
  id: string;
  name: string;
  url: string;
  bestScore: number;
  tier: string | null;
  mentionRate: number;
  mentionedCount: number;
  totalChecks: number;
  byPlatform: Record<string, { total: number; mentioned: number; rate: number }>;
  avgSentiment: number | null;
}

interface RankingResponse {
  industry: string;
  totalBrands: number;
  avgMentionRate: number;
  weekOf: string;
  ranking: RankingSite[];
}

interface ImpressionResult {
  question: string;
  category: string;
  mentioned: boolean;
  position: number | null;
  response: string;
  sentiment: string | null;
}

interface ImpressionResponse {
  site: {
    id: string;
    name: string;
    url: string;
    industry: string | null;
    bestScore: number;
    tier: string | null;
  };
  overallMentionRate: number;
  mentionedCount: number;
  totalChecks: number;
  byPlatform: Record<string, ImpressionResult[]>;
  weekOf: string;
}

interface TrendPoint {
  weekOf: string;
  mentionRate: number;
  mentionedCount: number;
  totalChecks: number;
  byPlatform: Record<string, { total: number; mentioned: number; rate: number }>;
}

interface ComparisonSite {
  id: string;
  name: string;
  url: string;
  bestScore: number;
  tier: string | null;
  industry: string | null;
  mentionRate: number;
  byPlatform: Record<string, { total: number; mentioned: number; rate: number }> | null;
}

interface ComparisonResponse {
  siteA: ComparisonSite;
  siteB: ComparisonSite;
  comparisons: Array<{
    platform: string;
    question: string;
    response: string;
  }>;
  weekOf: string;
}

interface IndustrySite {
  id: string;
  name: string;
  url: string;
  bestScore: number;
  tier: string | null;
  mentionRate: number | null;
  mentionedCount: number | null;
}

// ─── Hooks ───

export function useIndustryAiRanking(industry: string, platform?: string) {
  return useQuery({
    queryKey: ['industry-ai', 'ranking', industry, platform],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (platform) params.set('platform', platform);
      const { data } = await apiClient.get<RankingResponse>(
        `/industry-ai/${industry}/ranking?${params}`,
      );
      return data;
    },
    enabled: !!industry,
  });
}

export function useIndustryAiSites(industry: string) {
  return useQuery({
    queryKey: ['industry-ai', 'sites', industry],
    queryFn: async () => {
      const { data } = await apiClient.get<IndustrySite[]>(
        `/industry-ai/${industry}/sites`,
      );
      return data;
    },
    enabled: !!industry,
  });
}

export function useBrandImpression(siteId: string) {
  return useQuery({
    queryKey: ['industry-ai', 'impression', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<ImpressionResponse>(
        `/industry-ai/site/${siteId}/impression`,
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export function useCitationTrend(siteId: string, weeks = 12) {
  return useQuery({
    queryKey: ['industry-ai', 'trend', siteId, weeks],
    queryFn: async () => {
      const { data } = await apiClient.get<TrendPoint[]>(
        `/industry-ai/site/${siteId}/trend?weeks=${weeks}`,
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export function useBrandComparison(industry: string, siteAId: string, siteBId: string) {
  return useQuery({
    queryKey: ['industry-ai', 'compare', industry, siteAId, siteBId],
    queryFn: async () => {
      const { data } = await apiClient.get<ComparisonResponse>(
        `/industry-ai/${industry}/compare?a=${siteAId}&b=${siteBId}`,
      );
      return data;
    },
    enabled: !!industry && !!siteAId && !!siteBId,
  });
}

export function useRunComparison() {
  return useMutation({
    mutationFn: async (body: { industry: string; siteAId: string; siteBId: string }) => {
      const { data } = await apiClient.post(`/industry-ai/${body.industry}/compare`, {
        siteAId: body.siteAId,
        siteBId: body.siteBId,
      });
      return data;
    },
  });
}
