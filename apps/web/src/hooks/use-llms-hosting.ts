import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

interface LlmsTxtData {
  content: string;
}

export function useLlmsTxt(siteId: string) {
  return useQuery({
    queryKey: ['llms-txt', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<LlmsTxtData>(
        `/sites/${siteId}/llms-txt`,
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export function useUpdateLlmsTxt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ siteId, content }: { siteId: string; content: string }) => {
      const { data } = await apiClient.put(`/sites/${siteId}/llms-txt`, { content });
      return data;
    },
    onSuccess: (_, { siteId }) => {
      queryClient.invalidateQueries({ queryKey: ['llms-txt', siteId] });
    },
  });
}

export function useGenerateLlmsTxtHosting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (siteId: string) => {
      const { data } = await apiClient.post<LlmsTxtData>(
        `/sites/${siteId}/llms-txt/generate`,
      );
      return data;
    },
    onSuccess: (_, siteId) => {
      queryClient.invalidateQueries({ queryKey: ['llms-txt', siteId] });
    },
  });
}
