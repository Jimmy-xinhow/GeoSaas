import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface QaItem {
  id: string;
  siteId: string;
  question: string;
  answer: string;
  category?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQaPayload {
  question: string;
  answer: string;
  category?: string;
}

export interface UpdateQaPayload {
  question?: string;
  answer?: string;
  sortOrder?: number;
}

export function useKnowledge(siteId: string) {
  return useQuery({
    queryKey: ['knowledge', siteId],
    queryFn: async () => {
      const { data } = await apiClient.get<QaItem[]>(
        `/sites/${siteId}/knowledge`,
      );
      return data;
    },
    enabled: !!siteId,
  });
}

export function useCreateQa(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateQaPayload) => {
      const { data } = await apiClient.post<QaItem>(
        `/sites/${siteId}/knowledge`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', siteId] });
    },
  });
}

const BATCH_CHUNK_SIZE = 50;

export function useBatchCreateQa(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (items: CreateQaPayload[]) => {
      let lastResult: QaItem[] = [];
      for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
        const chunk = items.slice(i, i + BATCH_CHUNK_SIZE);
        const { data } = await apiClient.post<QaItem[]>(
          `/sites/${siteId}/knowledge/batch`,
          { items: chunk },
        );
        lastResult = data;
      }
      return lastResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', siteId] });
    },
  });
}

export function useUpdateQa(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      qaId,
      ...payload
    }: UpdateQaPayload & { qaId: string }) => {
      const { data } = await apiClient.put<QaItem>(
        `/sites/${siteId}/knowledge/${qaId}`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', siteId] });
    },
  });
}

export function useDeleteQa(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (qaId: string) => {
      await apiClient.delete(`/sites/${siteId}/knowledge/${qaId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', siteId] });
    },
  });
}

export interface GeneratedQa {
  question: string;
  answer: string;
  category: string;
}

export function useAiGenerateQa(siteId: string) {
  return useMutation({
    mutationFn: async (excludeQuestions?: string[]) => {
      const { data } = await apiClient.post<GeneratedQa[]>(
        `/sites/${siteId}/knowledge/ai-generate`,
        { excludeQuestions },
      );
      return data;
    },
  });
}
