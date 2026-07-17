import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export type OfficialArticleStatus =
  | 'draft'
  | 'generating'
  | 'quality_failed'
  | 'approved'
  | 'export_ready'
  | 'archived';

export interface OfficialQualityReport {
  passed: boolean;
  score: number;
  minimumScore: number;
  scorePassed?: boolean;
  requiredPassed?: boolean;
  requiredChecks?: string[];
  failedRequiredChecks?: string[];
  advisoryFailedChecks?: string[];
  attempts?: number;
  finalAttempt?: number;
  checks: Record<string, boolean>;
  charLength: number;
  similarityScore: number;
  similarityThreshold: number;
  matchedArticleId: string | null;
  unsupportedSpecificClaims?: string[];
  failedReasons: string[];
}

export interface OfficialSiteArticle {
  id: string;
  slug: string;
  title: string;
  description: string;
  content?: string;
  status: OfficialArticleStatus;
  targetQuestion?: string | null;
  targetKeywords: string[];
  publishBaseUrl?: string | null;
  canonicalUrl?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  articleSchema?: Record<string, unknown> | null;
  faqSchema?: Record<string, unknown> | null;
  qualityReport?: OfficialQualityReport | null;
  similarityScore?: number | null;
  rejectionReason?: string | null;
  publishedUrl?: string | null;
  generatedAt?: string | null;
  approvedAt?: string | null;
  lastVerifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  sourceArticle?: {
    id: string;
    slug: string;
    title: string;
    description: string;
    createdAt: string;
  } | null;
}

export interface OfficialArticleSource {
  id: string;
  slug: string;
  title: string;
  description: string;
  targetKeywords: string[];
  createdAt: string;
  platformUrl: string;
}

export interface OfficialArticleRecommendation {
  topic: string;
  angle: string;
  suggestedSlug: string;
  publishBaseUrl: string;
  canonicalUrl: string;
  reasoning: string;
  sourceArticleId?: string;
  sourceArticle?: Pick<OfficialArticleSource, 'id' | 'slug' | 'title' | 'description' | 'targetKeywords'>;
  firstPartyReadiness: {
    ready: boolean;
    confidenceScore: number;
    minimumConfidenceScore: number;
    missingFacts: string[];
  };
  dataUsed: {
    verifiedFacts: number;
    qaPairs: number;
    recentPlatformTopics: number;
    existingOfficialArticles: number;
    scanIndicators: number;
    reportAvailable: boolean;
  };
}

export interface OfficialPublishPackage {
  officialSite: { name: string; url: string; publishBaseUrl?: string | null; canonicalUrl: string };
  article: {
    id: string;
    slug: string;
    title: string;
    description: string;
    status: OfficialArticleStatus;
    targetKeywords: string[];
  };
  formats: {
    markdown: string;
    cmsHtml: string;
    jsonLd: string;
    jsonLdScript: string;
    metaTags: string;
  };
  files: Array<{ name: string; purpose: string; content: string }>;
  crawlerGuidance: { requiresBackendSourceEdit: boolean; explanation: string };
}

export interface OfficialVerificationReport {
  passed: boolean;
  checkedUrl: string;
  statusCode: number | null;
  finalUrl: string | null;
  checks: Record<string, boolean>;
  error?: string | null;
  checkedAt: string;
}

export function useOfficialSiteArticles(siteId: string) {
  return useQuery({
    queryKey: ['official-site-articles', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<OfficialSiteArticle[]>(
        `/sites/${siteId}/official-articles`,
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export function useOfficialArticleSources(siteId: string) {
  return useQuery({
    queryKey: ['official-site-article-sources', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<OfficialArticleSource[]>(
        `/sites/${siteId}/official-articles/sources`,
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export function useOfficialArticleRecommendation(siteId: string) {
  return useQuery({
    queryKey: ['official-site-article-recommendation', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<OfficialArticleRecommendation>(
        `/sites/${siteId}/official-articles/recommendation`,
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export function useOfficialSiteArticle(siteId: string, articleId: string | null) {
  return useQuery({
    queryKey: ['official-site-article', siteId, articleId],
    queryFn: async () => {
      const { data } = await apiClient.get<OfficialSiteArticle>(
        `/sites/${siteId}/official-articles/${articleId}`,
      );
      return data;
    },
    enabled: !!siteId && !!articleId,
  });
}

export function useGenerateOfficialSiteArticle(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      topic?: string;
      angle?: string;
      topicDirection?: string;
      sourceArticleId?: string;
      publishBaseUrl?: string;
      slug?: string;
      canonicalUrl?: string;
    }) => {
      const { data } = await apiClient.post<OfficialSiteArticle>(
        `/sites/${siteId}/official-articles/generate`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['official-site-articles', siteId] });
      queryClient.invalidateQueries({ queryKey: ['official-site-article-recommendation', siteId] });
      queryClient.invalidateQueries({ queryKey: ['geo-growth-plan', siteId] });
    },
  });
}

export function useApproveOfficialSiteArticle(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (articleId: string) => {
      const { data } = await apiClient.post<OfficialSiteArticle>(
        `/sites/${siteId}/official-articles/${articleId}/approve`,
      );
      return data;
    },
    onSuccess: (_, articleId) => {
      queryClient.invalidateQueries({ queryKey: ['official-site-articles', siteId] });
      queryClient.invalidateQueries({ queryKey: ['official-site-article', siteId, articleId] });
      queryClient.invalidateQueries({ queryKey: ['geo-growth-plan', siteId] });
    },
  });
}

export function useOfficialPublishPackage(
  siteId: string,
  articleId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['official-site-publish-package', siteId, articleId],
    queryFn: async () => {
      const { data } = await apiClient.get<OfficialPublishPackage>(
        `/sites/${siteId}/official-articles/${articleId}/publish-package`,
      );
      return data;
    },
    enabled: !!siteId && !!articleId && enabled,
  });
}

export function useVerifyOfficialSiteArticle(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ articleId, url }: { articleId: string; url: string }) => {
      const { data } = await apiClient.post<{
        id: string;
        status: OfficialArticleStatus;
        publishedUrl: string;
        lastVerifiedAt: string;
        verificationReport: OfficialVerificationReport;
      }>(
        `/sites/${siteId}/official-articles/${articleId}/verify`,
        { url },
      );
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['official-site-articles', siteId] });
      queryClient.invalidateQueries({ queryKey: ['official-site-article', siteId, variables.articleId] });
      queryClient.invalidateQueries({ queryKey: ['geo-growth-plan', siteId] });
    },
  });
}
