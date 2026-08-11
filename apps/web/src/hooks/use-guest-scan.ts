import { useMutation, useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';

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
      trackEvent('scan_start', { scan_type: 'guest' });
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
      if (data.status === 'COMPLETED' && typeof window !== 'undefined') {
        const key = `geovault_scan_complete_${data.id}`;
        if (!window.sessionStorage.getItem(key)) {
          window.sessionStorage.setItem(key, '1');
          trackEvent('scan_complete', {
            scan_type: 'guest',
            score: data.totalScore,
          });
        }
      }
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
