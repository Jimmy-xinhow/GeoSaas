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
      const { data } = await apiClient.post<{ reportId: string }>(`/client-reports/run/${querySetId}`);
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
