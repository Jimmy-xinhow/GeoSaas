import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface SiteProfile {
  industry?: string;
  description?: string;
  services?: string;
  targetAudience?: string;
  location?: string;
  keywords?: string[];
  uniqueValue?: string;
  contactInfo?: string;
}

interface Site {
  id: string;
  url: string;
  name: string;
  status: string;
  profile?: SiteProfile | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateSitePayload {
  url: string;
  name: string;
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
    },
  });
}
