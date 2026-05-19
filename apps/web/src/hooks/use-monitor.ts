import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

interface MonitorDashboard {
  platforms: Array<{
    name: string;
    rate: number;
    trend: 'up' | 'down' | 'stable';
    trendValue: string;
  }>;
  queries: Array<{
    id: string;
    siteId: string;
    siteName: string;
    siteUrl: string;
    query: string;
    platform: string;
    cited: boolean;
    position?: number | null;
    status?: 'error' | 'pending' | 'checked';
    errorMessage?: string;
    response?: string;
    lastCheck: string | null;
  }>;
}

interface Monitor {
  id: string;
  siteId: string;
  platform: string;
  query: string;
  cited: boolean;
  lastCheck: string;
  createdAt: string;
}

export function useMonitorDashboard() {
  return useQuery({
    queryKey: ['monitors', 'dashboard'],
    queryFn: async () => {
      const { data } = await apiClient.get<MonitorDashboard>(
        '/monitors/dashboard'
      );
      return data;
    },
  });
}

export function useSiteMonitors(siteId: string) {
  return useQuery({
    queryKey: ['monitors', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<Monitor[]>(
        `/sites/${siteId}/monitors`
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export function useCreateMonitor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      siteId: string;
      platform: string;
      query: string;
    }) => {
      const { data } = await apiClient.post<Monitor>(
        `/sites/${payload.siteId}/monitors`,
        { platform: payload.platform, query: payload.query },
        { suppressGlobalErrorToast: true },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitors'] });
    },
  });
}

export function useCheckCitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<Monitor>(
        `/monitors/${id}/check`,
        undefined,
        { suppressGlobalErrorToast: true },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitors'] });
    },
  });
}

export function useDeleteMonitor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/monitors/${id}`, { suppressGlobalErrorToast: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitors'] });
    },
  });
}
