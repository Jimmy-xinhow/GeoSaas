import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export type AffiliateTierKey = 'standard' | 'gold' | 'platinum'

export type AffiliateSettings = {
  applicationEnabled: boolean
  autoApproveApplications: boolean
  tierRates: Record<AffiliateTierKey, number>
  cookieWindowDays: number
  minWithdrawalAmount: number
  commissionLockDays: number
  allowBankTransfer: boolean
  allowPlatformCredits: boolean
  annualTaxThreshold: number
  programTerms: string
  landingPageIntro: string
}

export function useAffiliateStatus() {
  return useQuery({
    queryKey: ['affiliate', 'status'],
    queryFn: async () => {
      const { data } = await apiClient.get('/affiliate/my-status')
      return data
    },
  })
}

export function useAffiliateDashboard(enabled = true) {
  return useQuery({
    queryKey: ['affiliate', 'dashboard'],
    queryFn: async () => {
      const { data } = await apiClient.get('/affiliate/dashboard')
      return data
    },
    enabled,
  })
}

export function useApplyAffiliate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await apiClient.post('/affiliate/apply', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affiliate'] })
    },
  })
}

export function useRequestAffiliateWithdrawal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { amount: number; type: 'bank_transfer' | 'platform_credits' }) => {
      const { data } = await apiClient.post('/affiliate/withdrawals', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affiliate'] })
    },
  })
}

export function useAdminAffiliates(status?: string) {
  return useQuery({
    queryKey: ['admin', 'affiliates', status],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/affiliates', { params: { status: status || undefined } })
      return data
    },
  })
}

export function useAdminAffiliateOverview() {
  return useQuery({
    queryKey: ['admin', 'affiliates', 'overview'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/affiliates/overview')
      return data
    },
  })
}

export function useAdminAffiliateSettings() {
  return useQuery({
    queryKey: ['admin', 'affiliates', 'settings'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/affiliates/settings')
      return data as { settings: AffiliateSettings; tiers: Array<{ key: AffiliateTierKey; label: string }> }
    },
  })
}

export function useUpdateAffiliateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: AffiliateSettings & { applyTierRatesToExisting?: boolean }) => {
      const { data } = await apiClient.patch('/admin/affiliates/settings', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'affiliates'] })
    },
  })
}

export function useAdminAffiliateCommissions(affiliateId?: string) {
  return useQuery({
    queryKey: ['admin', 'affiliates', 'commissions', affiliateId],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/affiliates/commissions', {
        params: { affiliateId: affiliateId || undefined },
      })
      return data
    },
  })
}

export function useAdminAffiliateWithdrawals(status?: string) {
  return useQuery({
    queryKey: ['admin', 'affiliates', 'withdrawals', status],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/affiliates/withdrawals', {
        params: { status: status || undefined },
      })
      return data
    },
  })
}

export function useProcessAffiliateWithdrawal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string
      payload: { decision: 'completed' | 'rejected'; note?: string; rejectionReason?: string }
    }) => {
      const { data } = await apiClient.patch(`/admin/affiliates/withdrawals/${id}`, payload)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'affiliates'] }),
  })
}

export function useSuspendAffiliate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.patch(`/admin/affiliates/${id}/suspend`)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'affiliates'] }),
  })
}

export function useReviewAffiliate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const { data } = await apiClient.patch(`/admin/affiliates/${id}/review`, payload)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'affiliates'] }),
  })
}

export function useUpdateAffiliateTier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tier }: { id: string; tier: 'standard' | 'gold' | 'platinum' }) => {
      const { data } = await apiClient.patch(`/admin/affiliates/${id}/tier`, { tier })
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'affiliates'] }),
  })
}
