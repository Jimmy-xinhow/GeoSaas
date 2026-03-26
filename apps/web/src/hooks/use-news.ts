import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  summary: string;
  sourceUrl: string;
  sourceName: string;
  category: string;
  imageUrl?: string;
  publishedAt: string;
}

export interface NewsListResult {
  items: NewsArticle[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function useNewsList(params: { page?: number; category?: string } = {}) {
  return useQuery({
    queryKey: ['news', 'list', params],
    queryFn: async () => {
      const { data } = await apiClient.get<NewsListResult>('/news', { params });
      return data;
    },
  });
}

export function useLatestNews(limit = 5) {
  return useQuery({
    queryKey: ['news', 'latest', limit],
    queryFn: async () => {
      const { data } = await apiClient.get<NewsArticle[]>('/news/latest', { params: { limit } });
      return data;
    },
  });
}
