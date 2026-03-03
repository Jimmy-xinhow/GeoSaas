import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

interface Site {
  id: string;
  url: string;
  name: string;
  status: string;
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
