import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

interface Publication {
  id: string;
  contentId: string;
  platform: string;
  externalUrl?: string;
  status: string;
  publishedAt?: string;
  content?: {
    title: string;
    type: string;
  };
}

interface PublishPayload {
  contentId: string;
  platforms: string[];
}

export interface PublishPlatformStatus {
  key: string;
  name: string;
  configured: boolean;
  missingEnv: string[];
}

export function usePublications() {
  return useQuery({
    queryKey: ['publications'],
    queryFn: async () => {
      const { data } = await apiClient.get<Publication[]>('/publications');
      return data;
    },
  });
}

export function usePublishPlatforms() {
  return useQuery({
    queryKey: ['publications', 'platforms'],
    queryFn: async () => {
      const { data } = await apiClient.get<PublishPlatformStatus[]>('/publications/platforms');
      return data;
    },
  });
}

export function usePublishContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contentId, platforms }: PublishPayload) => {
      const { data } = await apiClient.post(`/contents/${contentId}/publish`, { platforms });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publications'] });
      queryClient.invalidateQueries({ queryKey: ['contents'] });
    },
  });
}
