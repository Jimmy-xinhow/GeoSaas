import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface CmsConnection {
  id: string;
  provider: string;
  status: string;
  apiBaseUrl?: string | null;
  tokenLast4: string;
  capabilities: string[];
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SiteFixAction {
  id: string;
  type: string;
  title: string;
  status: string;
  payload: Record<string, unknown>;
  generatedCode?: string | null;
  error?: string | null;
  pluginAppliedAt?: string | null;
}

export interface SiteFixRun {
  id: string;
  status: string;
  mode: string;
  summary?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  actions: SiteFixAction[];
}

export interface CmsFixStatus {
  connection: CmsConnection | null;
  latestRun: SiteFixRun | null;
}

export interface ConnectWordPressResponse {
  connection: CmsConnection;
  install: {
    siteId: string;
    apiUrl: string;
    token: string;
  };
}

export function useCmsFixStatus(siteId: string) {
  return useQuery({
    queryKey: ['cms-fix', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<CmsFixStatus>(`/cms-fix/sites/${siteId}/status`);
      return data;
    },
    refetchInterval: (query) => {
      const data = query.state.data as CmsFixStatus | undefined;
      const status = data?.latestRun?.status;
      return status === 'dispatched' || status === 'partially_applied' ? 5000 : false;
    },
    enabled: Boolean(siteId),
  });
}

export function useConnectWordPress(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { apiBaseUrl?: string }) => {
      const { data } = await apiClient.post<ConnectWordPressResponse>(
        `/cms-fix/sites/${siteId}/wordpress/connect`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-fix', siteId] });
    },
  });
}

export function useCreateCmsFixPlan(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<SiteFixRun>(`/cms-fix/sites/${siteId}/plan`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-fix', siteId] });
    },
  });
}

export function useDispatchCmsFixRun(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const { data } = await apiClient.post<CmsFixStatus>(
        `/cms-fix/sites/${siteId}/runs/${runId}/dispatch`,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-fix', siteId] });
    },
  });
}
