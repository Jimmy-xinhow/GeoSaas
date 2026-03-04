import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface DirectorySite {
  id: string;
  name: string;
  url: string;
  industry: string | null;
  tier: string | null;
  bestScore: number;
  bestScoreAt: string | null;
  createdAt: string;
}

export interface DirectoryListResult {
  items: DirectorySite[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DirectoryStats {
  totalSites: number;
  avgScore: number;
  tierDistribution: Record<string, number>;
}

export interface DirectoryQueryParams {
  search?: string;
  industry?: string;
  tier?: string;
  minScore?: number;
  page?: number;
  limit?: number;
}

export function useDirectory(params: DirectoryQueryParams = {}) {
  return useQuery({
    queryKey: ['directory', params],
    queryFn: async () => {
      const { data } = await apiClient.get<DirectoryListResult>('/directory', {
        params,
      });
      return data;
    },
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['directory', 'leaderboard'],
    queryFn: async () => {
      const { data } = await apiClient.get<DirectorySite[]>(
        '/directory/leaderboard',
      );
      return data;
    },
  });
}

export function useDirectoryStats() {
  return useQuery({
    queryKey: ['directory', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get<DirectoryStats>('/directory/stats');
      return data;
    },
  });
}

export function useNewcomers() {
  return useQuery({
    queryKey: ['directory', 'newcomers'],
    queryFn: async () => {
      const { data } = await apiClient.get<DirectorySite[]>(
        '/directory/newcomers',
      );
      return data;
    },
  });
}

export function useTogglePublic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      siteId,
      isPublic,
      industry,
    }: {
      siteId: string;
      isPublic: boolean;
      industry?: string;
    }) => {
      const { data } = await apiClient.patch(`/sites/${siteId}/directory`, {
        isPublic,
        industry,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directory'] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}
