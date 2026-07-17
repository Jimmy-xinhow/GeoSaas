import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface SiteProfile {
  industry?: string;
  description?: string;
  services?: string;
  targetAudience?: string;
  targetAudiences?: string[];
  notFor?: string[];
  forbidden?: string[];
  location?: string;
  keywords?: string[];
  uniqueValue?: string;
  positioning?: string;
  contactInfo?: string;
  contact?: string;
  dailyContentPaused?: boolean;
}

export interface BrandFactReadiness {
  siteId: string;
  brandName: string;
  industry: string | null;
  url: string;
  location?: string;
  services?: string;
  targetAudiences: string[];
  notFor: string[];
  positioning?: string;
  contact?: string;
  socialLinks: Record<string, string>;
  qaPairs: Array<{ question: string; answer: string }>;
  verifiedFacts: string[];
  missingFacts: string[];
  confidenceScore: number;
  ready: boolean;
}

export interface Site {
  id: string;
  url: string;
  name: string;
  status: string;
  profile?: SiteProfile | null;
  createdAt: string;
  updatedAt: string;
}

export type GeoGrowthStageKey =
  | 'diagnose'
  | 'technical'
  | 'knowledge'
  | 'content'
  | 'measurement';

export interface GeoGrowthStage {
  key: GeoGrowthStageKey;
  order: number;
  title: string;
  description: string;
  outcome: string;
  status: 'completed' | 'current' | 'upcoming';
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

interface CreateSitePayload {
  url: string;
  name: string;
  guestScanId?: string;
}

interface UpdateSitePayload {
  id: string;
  name?: string;
  url?: string;
  profile?: SiteProfile;
}

export function useSites() {
  return useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const { data } = await apiClient.get<Site[]>('/sites');
      return data;
    },
    refetchInterval: (query) => {
      const sites = query.state.data as any[] | undefined;
      if (!sites) return false;
      const hasActiveScan = sites.some(
        (site) => {
          const latestScan = site.scans?.[0];
          return latestScan && (latestScan.status === 'PENDING' || latestScan.status === 'RUNNING');
        }
      );
      return hasActiveScan ? 3000 : false;
    },
  });
}

export function useSite(id: string) {
  return useQuery({
    queryKey: ['sites', id],
    queryFn: async () => {
      const { data } = await apiClient.get<Site>(`/sites/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useGeoGrowthPlan(siteId: string) {
  return useQuery({
    queryKey: ['geo-growth-plan', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<GeoGrowthPlan>(`/sites/${siteId}/growth-plan`);
      return data;
    },
    enabled: !!siteId,
    staleTime: 30_000,
  });
}

export function useBrandFactReadiness(siteId: string) {
  return useQuery({
    queryKey: ['brand-facts', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<BrandFactReadiness>(`/blog/sites/${siteId}/brand-facts`);
      return data;
    },
    enabled: !!siteId,
  });
}

export function useCreateSite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateSitePayload) => {
      const { data } = await apiClient.post<Site>('/sites', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}

export function useDeleteSite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/sites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}

export function useUpdateSite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }: UpdateSitePayload) => {
      const { data } = await apiClient.put<Site>(`/sites/${id}`, payload);
      return data;
    },
    onSuccess: (site) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['sites', site.id] });
      queryClient.invalidateQueries({ queryKey: ['brand-facts', site.id] });
      queryClient.invalidateQueries({ queryKey: ['geo-growth-plan', site.id] });
    },
  });
}

export function useUpdateSiteProfile(siteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: SiteProfile) => {
      const { data } = await apiClient.put<Site>(`/sites/${siteId}`, {
        profile,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', siteId] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['brand-facts', siteId] });
      queryClient.invalidateQueries({ queryKey: ['geo-growth-plan', siteId] });
    },
  });
}
