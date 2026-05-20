'use client'

import { useEffect } from 'react'
import apiClient from '@/lib/api-client'

const STORAGE_KEY = 'geovault_affiliate_ref'
const VISITOR_KEY = 'geovault_affiliate_visitor'
const COOKIE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

function getVisitorId() {
  let visitorId = localStorage.getItem(VISITOR_KEY)
  if (!visitorId) {
    visitorId = `gv_${crypto.randomUUID()}`
    localStorage.setItem(VISITOR_KEY, visitorId)
  }
  return visitorId
}

export function getStoredAffiliateRef() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { code?: string; visitorId?: string; timestamp?: number }
    if (!parsed.code || !parsed.visitorId || !parsed.timestamp) return null
    if (Date.now() - parsed.timestamp > COOKIE_WINDOW_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function clearStoredAffiliateRef() {
  if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
}

export default function AffiliateTracker() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('aff')?.trim()
    if (!code) return

    const visitorId = getVisitorId()
    const payload = { code, visitorId, timestamp: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))

    apiClient.post(
      '/affiliate/track-click',
      {
        affiliateCode: code,
        visitorId,
        landingPage: window.location.href,
      },
      { suppressGlobalErrorToast: true },
    ).catch(() => {})
  }, [])

  return null
}
