import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

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

export function useTriggerScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (siteId: string) => {
      const { data } = await apiClient.post<Scan>(
        `/sites/${siteId}/scans`
      );
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
      return data;
    },
    enabled: !!scanId,
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
