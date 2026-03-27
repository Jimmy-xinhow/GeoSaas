import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface SuccessCase {
  id: string;
  title: string;
  aiPlatform: string;
  queryUsed: string;
  aiResponse?: string;
  screenshotUrl?: string;
  beforeGeoScore?: number;
  afterGeoScore?: number;
  improvementDays?: number;
  industry?: string;
  tags: string[];
  viewCount: number;
  createdAt: string;
  user?: { name: string };
  site?: { name: string; url: string; bestScore?: number };
  generatedArticle?: { slug: string; title: string; content: string } | null;
}

export interface CaseListResult {
  items: SuccessCase[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function useSuccessCases(params: { aiPlatform?: string; industry?: string; page?: number } = {}) {
  return useQuery({
    queryKey: ['success-cases', params],
    queryFn: async () => {
      const { data } = await apiClient.get<CaseListResult>('/success-cases', { params });
      return data;
    },
  });
}

export function useFeaturedCases() {
  return useQuery({
    queryKey: ['success-cases', 'featured'],
    queryFn: async () => {
      const { data } = await apiClient.get<SuccessCase[]>('/success-cases/featured');
      return data;
    },
  });
}

export function useSuccessCase(id: string) {
  return useQuery({
    queryKey: ['success-cases', id],
    queryFn: async () => {
      const { data } = await apiClient.get<SuccessCase>(`/success-cases/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useSubmitCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: any) => {
      const { data } = await apiClient.post('/success-cases', dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['success-cases'] });
    },
  });
}
