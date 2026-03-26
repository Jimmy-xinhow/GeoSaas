import { useMutation } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

interface IndexNowResult {
  engine: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

interface SubmitResponse {
  url: string;
  results: IndexNowResult[];
}

export function useSubmitIndexNow() {
  return useMutation({
    mutationFn: async (url: string): Promise<SubmitResponse> => {
      const res = await apiClient.post('/indexnow/submit', { url });
      return res.data;
    },
  });
}

export function useSubmitBatchIndexNow() {
  return useMutation({
    mutationFn: async (urls: string[]): Promise<{ count: number; results: IndexNowResult[] }> => {
      const res = await apiClient.post('/indexnow/submit-batch', { urls });
      return res.data;
    },
  });
}
