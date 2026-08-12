import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';

export interface ScanResultItem {
  id: string;
  scanId: string;
  indicator: string;
  score: number;
  status: 'pass' | 'warning' | 'fail';
  details: Record<string, any>;
  suggestion?: string;
  autoFixable: boolean;
  generatedCode?: string | null;
}

export interface Scan {
  id: string;
  siteId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  totalScore: number;
  createdAt: string;
  completedAt?: string | null;
  results?: ScanResultItem[];
}

function markAuthenticatedScanStarted(scan: Scan) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`geovault_scan_started_${scan.id}`, '1');
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

function trackAuthenticatedScanCompletion(scan: Scan) {
  if (typeof window === 'undefined' || scan.status !== 'COMPLETED') return;
  const startedKey = `geovault_scan_started_${scan.id}`;
  const completedKey = `geovault_scan_complete_${scan.id}`;
  try {
    if (
      !window.sessionStorage.getItem(startedKey)
      || window.sessionStorage.getItem(completedKey)
    ) return;
    if (trackEvent('scan_complete', {
      scan_type: 'authenticated',
      site_id: scan.siteId,
      score: scan.totalScore,
    })) {
      window.sessionStorage.setItem(completedKey, '1');
    }
    window.sessionStorage.removeItem(startedKey);
  } catch {
    // The scan result remains functional even when analytics storage fails.
  }
}

export interface DeepAnalysisPage {
  url: string;
  status: 'ok' | 'failed';
  statusCode?: number;
  title?: string;
  jsonLdScripts: number;
  schemaTypes: string[];
  hasFaqSchema: boolean;
  faqQuestionCount: number;
  hasArticleSchema: boolean;
  hasVisibleQuestionText: boolean;
  error?: string;
}

export interface DeepAnalysisResult {
  analyzedAt: string;
  requiredPlan: 'PRO';
  pageLimit: number;
  site: { id: string; name: string; url: string };
  summary: {
    pagesAnalyzed: number;
    pagesFailed: number;
    jsonLdPages: number;
    faqSchemaPages: number;
    faqQuestionCount: number;
    articleSchemaPages: number;
    visibleQuestionTextPages: number;
  };
  pages: DeepAnalysisPage[];
  interpretation: string;
}

export function useTriggerScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (siteId: string) => {
      const trackedStart = trackEvent('scan_start', {
        scan_type: 'authenticated',
        site_id: siteId,
      });
      const { data } = await apiClient.post<Scan>(
        `/sites/${siteId}/scans`
      );
      if (trackedStart) markAuthenticatedScanStarted(data);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['scans', data.siteId],
      });
      queryClient.invalidateQueries({
        queryKey: ['sites'],
      });
      queryClient.invalidateQueries({
        queryKey: ['sites', data.siteId],
      });
      queryClient.invalidateQueries({
        queryKey: ['scan-results'],
      });
      queryClient.invalidateQueries({
        queryKey: ['geo-growth-plan', data.siteId],
      });
    },
  });
}

export function useRunDeepAnalysis() {
  return useMutation({
    mutationFn: async (siteId: string) => {
      const { data } = await apiClient.post<DeepAnalysisResult>(
        `/sites/${siteId}/deep-analysis`,
        undefined,
        { suppressGlobalErrorToast: true },
      );
      return data;
    },
  });
}

export function useScanHistory(siteId: string) {
  return useQuery({
    queryKey: ['scans', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<Scan[]>(
        `/sites/${siteId}/scans`
      );
      data.forEach(trackAuthenticatedScanCompletion);
      return data;
    },
    enabled: !!siteId,
    refetchInterval: (query) => {
      const scans = query.state.data;
      if (!scans) return false;
      const hasActiveScan = scans.some(
        (s: Scan) => s.status === 'PENDING' || s.status === 'RUNNING'
      );
      return hasActiveScan ? 3000 : false;
    },
  });
}

export function useScanById(scanId: string) {
  return useQuery({
    queryKey: ['scan', scanId],
    queryFn: async () => {
      const { data } = await apiClient.get<Scan>(
        `/scans/${scanId}`
      );
      trackAuthenticatedScanCompletion(data);
      return data;
    },
    enabled: !!scanId,
  });
}

export interface ScoreTrendPoint {
  date: string;
  score: number;
  site: string;
}

export function useScoreTrend() {
  return useQuery({
    queryKey: ['scans', 'trend'],
    queryFn: async () => {
      const { data } = await apiClient.get<ScoreTrendPoint[]>('/scans/trend');
      return data;
    },
  });
}

export function useScanResults(scanId: string) {
  return useQuery({
    queryKey: ['scan-results', scanId],
    queryFn: async () => {
      const { data } = await apiClient.get<ScanResultItem[]>(
        `/scans/${scanId}/results`
      );
      return data;
    },
    enabled: !!scanId,
  });
}
