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

export interface ManagedSubscriptionInfo {
  orderNo: string;
  plan: 'MANAGED_BASIC' | 'MANAGED_PRO';
  planLabel: string;
  amount: number;
  paidAt: string | null;
}

export interface ActiveSubscriptionInfo {
  orderNo: string;
  plan: 'STARTER' | 'PRO' | 'MANAGED_BASIC' | 'MANAGED_PRO';
  planLabel: string;
  amount: number;
  paidAt: string | null;
  type: 'self_service' | 'managed';
  billingCycle: BillingCycle;
  periodTimes: string;
  canCancel: boolean;
}

interface SubscriptionInfo {
  plan: string;
  usage: {
    scansThisMonth: number;
    sitesCount: number;
  };
  activeSubscriptions?: ActiveSubscriptionInfo[];
  managedSubscriptions?: ManagedSubscriptionInfo[];
}

interface CheckoutFormData {
  paymentUrl: string;
  MerchantID?: string;
  TradeInfo?: string;
  TradeSha?: string;
  Version?: string;
  MerchantID_?: string;
  PostData_?: string;
  paymentType?: 'MPG' | 'PERIOD';
}

export type BillingCycle = 'monthly' | 'yearly';

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

export function submitNewebPayForm(formData: CheckoutFormData) {
  if (!formData.paymentUrl) {
    throw new Error('Missing NewebPay payment URL');
  }
  if (formData.paymentType === 'PERIOD' && (!formData.MerchantID_ || !formData.PostData_)) {
    throw new Error('Missing NewebPay period payment fields');
  }
  if (formData.paymentType !== 'PERIOD' && (!formData.MerchantID || !formData.TradeInfo || !formData.TradeSha || !formData.Version)) {
    throw new Error('Missing NewebPay MPG payment fields');
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = formData.paymentUrl;
  form.target = '_self';
  form.acceptCharset = 'UTF-8';
  form.style.display = 'none';

  const fields = {
    ...(formData.paymentType === 'PERIOD'
      ? {
          MerchantID_: formData.MerchantID_,
          PostData_: formData.PostData_,
        }
      : {
          MerchantID: formData.MerchantID,
          TradeInfo: formData.TradeInfo,
          TradeSha: formData.TradeSha,
          Version: formData.Version,
        }),
  };

  for (const [name, value] of Object.entries(fields)) {
    if (!value) continue;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: async ({ plan, billingCycle = 'monthly' }: { plan: string; billingCycle?: BillingCycle }) => {
      const { data } = await apiClient.post<CheckoutFormData>('/billing/checkout', { plan, billingCycle });
      return data;
    },
    onSuccess: (data) => {
      submitNewebPayForm(data);
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderNo: string) => {
      const { data } = await apiClient.post<{ message: string; orderNo: string }>(
        '/billing/subscription/cancel',
        { orderNo, acceptedTerminationNotice: true },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

export interface CreditBalance {
  credits: number;
  freeGenerations: {
    used: number;
    total: number;
    remaining: number;
    resetsAt: string | null;
  };
  expiringSoon: number;
  transactions: Array<{
    type: string;
    amount: number;
    balance: number;
    description: string;
    expiresAt: string | null;
    createdAt: string;
  }>;
}

export function useCredits() {
  return useQuery({
    queryKey: ['credits'],
    queryFn: async () => {
      const { data } = await apiClient.get<CreditBalance>('/billing/credits');
      return data;
    },
  });
}

export function useCreditCheckout() {
  return useMutation({
    mutationFn: async (points: number) => {
      const { data } = await apiClient.post<CheckoutFormData>('/billing/credits/checkout', { points });
      return data;
    },
    onSuccess: (data) => {
      submitNewebPayForm(data);
    },
  });
}

export function useManagedCheckout() {
  return useMutation({
    mutationFn: async ({
      plan,
      billingCycle = 'monthly',
    }: {
      plan: 'MANAGED_BASIC' | 'MANAGED_PRO';
      billingCycle?: BillingCycle;
    }) => {
      const { data } = await apiClient.post<CheckoutFormData>('/billing/managed/checkout', {
        plan,
        billingCycle,
        acceptedTerms: true,
        termsVersion: 'managed-service-2026-05-19',
      });
      return data;
    },
    onSuccess: (data) => {
      submitNewebPayForm(data);
    },
  });
}

export interface ManagedRefundRequestPayload {
  orderNo: string;
  plan: 'MANAGED_BASIC' | 'MANAGED_PRO';
  requestedResolution: 'refund' | 'extension';
  basis: string;
  acceptedReviewTerms: boolean;
}

export function useManagedRefundRequest() {
  return useMutation({
    mutationFn: async (payload: ManagedRefundRequestPayload) => {
      const { data } = await apiClient.post<{ requestId: string; message: string }>(
        '/billing/managed/refund-request',
        payload,
      );
      return data;
    },
  });
}
