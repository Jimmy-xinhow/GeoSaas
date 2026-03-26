import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  locale: string;
  readTime: string;
  createdAt: string;
  content?: string;
  site?: {
    name: string;
    url: string;
    bestScore: number;
    industry?: string;
  } | null;
}

export interface BlogListResult {
  items: BlogArticle[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function useBlogArticles(params: { page?: number; category?: string } = {}) {
  return useQuery({
    queryKey: ['blog', 'articles', params],
    queryFn: async () => {
      const { data } = await apiClient.get<BlogListResult>('/blog/articles', { params });
      return data;
    },
  });
}

export function useBlogArticle(slug: string) {
  return useQuery({
    queryKey: ['blog', 'article', slug],
    queryFn: async () => {
      const { data } = await apiClient.get<BlogArticle>(`/blog/articles/${slug}`);
      return data;
    },
    enabled: !!slug,
  });
}
