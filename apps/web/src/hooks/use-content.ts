import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface ContentItem {
  id: string;
  title: string;
  type: string;
  status: string;
  body?: string;
  siteId?: string;
  createdAt: string;
  updatedAt: string;
}

interface GenerateContentPayload {
  type: 'FAQ' | 'ARTICLE';
  siteId: string;
  keywords?: string[];
  language?: string;
}

interface UpdateContentPayload {
  id: string;
  title?: string;
  body?: string;
  status?: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED';
}

export function useContents() {
  return useQuery({
    queryKey: ['contents'],
    queryFn: async () => {
      const { data } = await apiClient.get<ContentItem[]>('/contents');
      return data;
    },
  });
}

export function useContent(id: string) {
  return useQuery({
    queryKey: ['contents', id],
    queryFn: async () => {
      const { data } = await apiClient.get<ContentItem>(`/contents/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useGenerateContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: GenerateContentPayload) => {
      const { data } = await apiClient.post<ContentItem>(
        '/contents/generate',
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] });
    },
  });
}

export function useUpdateContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: UpdateContentPayload) => {
      const { data: result } = await apiClient.put<ContentItem>(
        `/contents/${id}`,
        data
      );
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] });
    },
  });
}

export function useDeleteContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/contents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] });
    },
  });
}
