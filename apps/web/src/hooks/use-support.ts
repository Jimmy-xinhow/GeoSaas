import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import apiClient from '@/lib/api-client';

export interface SupportConversation {
  id: string;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  subject: string;
  category: string;
  status: 'open' | 'waiting_admin' | 'waiting_user' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  channel: 'ticket' | 'message' | 'realtime';
  planSnapshot: string;
  assignedAdminId?: string | null;
  assignedAdminName?: string | null;
  lastMessageAt: string;
  closedAt?: string | null;
  createdAt: string;
  latestMessage?: string | null;
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  senderId?: string | null;
  senderName?: string | null;
  senderRole: 'user' | 'admin' | 'ai' | 'system';
  body: string;
  isAi: boolean;
  createdAt: string;
}

export interface CreateSupportConversationPayload {
  subject: string;
  message: string;
  category?: string;
  siteId?: string;
}

export interface SupportKnowledgeItem {
  id: string;
  title: string;
  category: string;
  question?: string | null;
  answer: string;
  tags: string[];
  enabled: boolean;
  priority: number;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertSupportKnowledgePayload {
  title: string;
  category: string;
  question?: string;
  answer: string;
  tags?: string[];
  enabled?: boolean;
  priority?: number;
}

export function useSupportConversations() {
  return useQuery({
    queryKey: ['support', 'conversations'],
    queryFn: async () => {
      const { data } = await apiClient.get<SupportConversation[]>('/support/conversations');
      return data;
    },
    refetchInterval: 10000,
  });
}

export function useSupportMessages(conversationId?: string) {
  return useQuery({
    queryKey: ['support', 'messages', conversationId],
    queryFn: async () => {
      const { data } = await apiClient.get<SupportMessage[]>(
        `/support/conversations/${conversationId}/messages`,
      );
      return data;
    },
    enabled: !!conversationId,
    refetchInterval: conversationId ? 5000 : false,
  });
}

export function useCreateSupportConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateSupportConversationPayload) => {
      const { data } = await apiClient.post<SupportConversation>('/support/conversations', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support', 'conversations'] });
    },
  });
}

export function useSendSupportMessage(conversationId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { data } = await apiClient.post<SupportMessage>(
        `/support/conversations/${conversationId}/messages`,
        { body },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support', 'messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['support', 'conversations'] });
    },
  });
}

export function useAdminSupportConversations(params: { status?: string; priority?: string } = {}) {
  return useQuery({
    queryKey: ['admin-support', 'conversations', params],
    queryFn: async () => {
      const { data } = await apiClient.get<SupportConversation[]>('/admin/support/conversations', { params });
      return data;
    },
    refetchInterval: 10000,
  });
}

export function useAdminSupportMessages(conversationId?: string) {
  return useQuery({
    queryKey: ['admin-support', 'messages', conversationId],
    queryFn: async () => {
      const { data } = await apiClient.get<SupportMessage[]>(
        `/admin/support/conversations/${conversationId}/messages`,
      );
      return data;
    },
    enabled: !!conversationId,
    refetchInterval: conversationId ? 5000 : false,
  });
}

export function useAdminSendSupportMessage(conversationId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { data } = await apiClient.post<SupportMessage>(
        `/admin/support/conversations/${conversationId}/messages`,
        { body },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support'] });
    },
  });
}

export function useAssignSupportConversation(conversationId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.patch<SupportConversation>(
        `/admin/support/conversations/${conversationId}/assign`,
        {},
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support'] });
    },
  });
}

export function useCloseSupportConversation(conversationId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.patch<SupportConversation>(
        `/admin/support/conversations/${conversationId}/close`,
        {},
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support'] });
      queryClient.invalidateQueries({ queryKey: ['support'] });
    },
  });
}

export function useSummarizeSupportConversation(conversationId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(
        `/admin/support/conversations/${conversationId}/summarize`,
        {},
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support'] });
    },
  });
}

export function useAdminSupportKnowledge(includeDisabled = true) {
  return useQuery({
    queryKey: ['admin-support', 'knowledge', includeDisabled],
    queryFn: async () => {
      const { data } = await apiClient.get<SupportKnowledgeItem[]>('/admin/support/knowledge', {
        params: { includeDisabled },
      });
      return data;
    },
  });
}

export function useCreateSupportKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpsertSupportKnowledgePayload) => {
      const { data } = await apiClient.post<SupportKnowledgeItem>('/admin/support/knowledge', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support', 'knowledge'] });
    },
  });
}

export function useUpdateSupportKnowledge(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpsertSupportKnowledgePayload) => {
      const { data } = await apiClient.patch<SupportKnowledgeItem>(`/admin/support/knowledge/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support', 'knowledge'] });
    },
  });
}

export function useToggleSupportKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { data } = await apiClient.patch<SupportKnowledgeItem>(
        `/admin/support/knowledge/${id}/enabled`,
        { enabled },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support', 'knowledge'] });
    },
  });
}

export function useSupportRealtime(conversationId?: string, admin = false) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!conversationId && !admin) return;

    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!baseUrl) return;

    const socket = io(`${baseUrl}/support`, {
      transports: ['websocket', 'polling'],
      auth: { token: localStorage.getItem('token') },
    });

    if (admin) {
      socket.emit('support:admin:join');
      socket.on('support:admin:updated', () => {
        queryClient.invalidateQueries({ queryKey: ['admin-support'] });
      });
    }

    if (conversationId) {
      socket.emit('support:join', { conversationId });
      socket.on('support:updated', () => {
        queryClient.invalidateQueries({ queryKey: ['support', 'messages', conversationId] });
        queryClient.invalidateQueries({ queryKey: ['support', 'conversations'] });
        queryClient.invalidateQueries({ queryKey: ['admin-support'] });
      });
    }

    return () => {
      socket.disconnect();
    };
  }, [admin, conversationId, queryClient]);
}
