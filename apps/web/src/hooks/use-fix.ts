import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

// ── Response shape from the Fix API ──

export interface FixGenerateResponse {
  code: string;
  language: string;
}

export interface ApplyFixResponse {
  id: string;
  indicator: string;
  generatedCode: string;
  message: string;
}

// ── DTO types matching the backend DTOs ──

export interface GenerateJsonLdPayload {
  type: string;
  name: string;
  url: string;
  description?: string;
  logo?: string;
  email?: string;
  phone?: string;
  address?: string;
  priceRange?: string;
  openingHours?: any;
}

export interface GenerateOgTagsPayload {
  title: string;
  description: string;
  url: string;
  image?: string;
  type?: string;
}

export interface GenerateLlmsTxtPayload {
  title: string;
  description: string;
  url: string;
  links?: { title: string; url: string }[];
}

export interface GenerateFaqSchemaPayload {
  faqs: { question: string; answer: string }[];
}

export interface ApplyFixPayload {
  scanResultId: string;
  generatedCode: string;
}

// ── Hooks ──

export function useGenerateJsonLd() {
  return useMutation({
    mutationFn: async (payload: GenerateJsonLdPayload) => {
      const { data } = await apiClient.post<FixGenerateResponse>(
        '/fix/json-ld/generate',
        payload,
      );
      return data;
    },
  });
}

export function useGenerateLlmsTxt() {
  return useMutation({
    mutationFn: async (payload: GenerateLlmsTxtPayload) => {
      const { data } = await apiClient.post<FixGenerateResponse>(
        '/fix/llms-txt/generate',
        payload,
      );
      return data;
    },
  });
}

export function useGenerateOgTags() {
  return useMutation({
    mutationFn: async (payload: GenerateOgTagsPayload) => {
      const { data } = await apiClient.post<FixGenerateResponse>(
        '/fix/og-tags/generate',
        payload,
      );
      return data;
    },
  });
}

export function useGenerateFaqSchema() {
  return useMutation({
    mutationFn: async (payload: GenerateFaqSchemaPayload) => {
      const { data } = await apiClient.post<FixGenerateResponse>(
        '/fix/faq-schema/generate',
        payload,
      );
      return data;
    },
  });
}

export function useApplyFix() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ scanResultId, generatedCode }: ApplyFixPayload) => {
      const { data } = await apiClient.patch<ApplyFixResponse>(
        `/fix/${scanResultId}/apply`,
        { generatedCode },
      );
      return data;
    },
    onSuccess: (data) => {
      // Invalidate scan results so the UI reflects the applied fix
      queryClient.invalidateQueries({
        queryKey: ['scan-results'],
      });
      queryClient.invalidateQueries({
        queryKey: ['scan'],
      });
    },
  });
}
