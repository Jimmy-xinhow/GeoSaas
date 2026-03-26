import { useMutation, useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface GuestScanResult {
  id: string;
  url: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  totalScore: number;
  results: {
    totalScore: number;
    indicators: Record<
      string,
      {
        score: number;
        status: 'pass' | 'warning' | 'fail';
        details: Record<string, any>;
        suggestion?: string;
        autoFixable: boolean;
      }
    >;
  } | null;
  createdAt: string;
  completedAt: string | null;
}

export function useGuestScan() {
  return useMutation({
    mutationFn: async (url: string) => {
      const { data } = await apiClient.post<{
        id: string;
        url: string;
        status: string;
        remaining: number;
      }>('/guest-scan', { url });
      return data;
    },
  });
}

export function useGuestScanStatus(scanId: string | null) {
  return useQuery({
    queryKey: ['guest-scan', scanId],
    queryFn: async () => {
      const { data } = await apiClient.get<GuestScanResult>(
        `/guest-scan/${scanId}`,
      );
      return data;
    },
    enabled: !!scanId,
    refetchInterval: (query) => {
      const scan = query.state.data;
      if (!scan) return 3000;
      if (scan.status === 'PENDING' || scan.status === 'RUNNING') return 2000;
      return false;
    },
  });
}
