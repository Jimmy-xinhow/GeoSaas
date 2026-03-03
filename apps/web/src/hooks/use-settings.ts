import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  avatarUrl?: string;
  createdAt: string;
}

interface UpdateProfilePayload {
  name?: string;
  email?: string;
}

interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

interface SubscriptionInfo {
  plan: string;
  stripeCustomerId?: string;
  usage: {
    scansThisMonth: number;
    sitesCount: number;
  };
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await apiClient.get<UserProfile>('/auth/me');
      return data;
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateProfilePayload) => {
      const { data } = await apiClient.patch<UserProfile>('/auth/profile', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload: ChangePasswordPayload) => {
      const { data } = await apiClient.post<{ message: string }>('/auth/change-password', payload);
      return data;
    },
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const { data } = await apiClient.get<SubscriptionInfo>('/billing/subscription');
      return data;
    },
  });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: async (plan: string) => {
      const { data } = await apiClient.post<{ url: string }>('/billing/checkout', { plan });
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });
}
