'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useAuthStore from '@/stores/auth-store'
import { GeovaultLogoFullDark } from '@/components/logo'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { isAuthenticated, isHydrated, hydrate } = useAuthStore()

  useEffect(() => {
    if (!isHydrated) hydrate()
  }, [isHydrated, hydrate])

  useEffect(() => {
    if (isHydrated && isAuthenticated) {
      router.replace('/dashboard')
    }
  }, [isHydrated, isAuthenticated, router])

  // Show loading spinner while checking auth status
  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm text-gray-400">載入中...</p>
        </div>
      </div>
    )
  }

  // Don't render auth pages if already authenticated (will redirect)
  if (isAuthenticated) {
    return null
  }

  return (
    <div className="relative min-h-screen max-w-full overflow-x-hidden bg-[linear-gradient(135deg,#07111f_0%,#112a55_48%,#0f172a_100%)] text-white">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px] opacity-25" />
      <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-gray-950/70 via-gray-950/25 to-transparent" />
      <div className="relative grid min-h-screen grid-cols-1 items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)_minmax(48px,0.18fr)] lg:px-12 xl:grid-cols-[minmax(0,1fr)_minmax(360px,400px)_minmax(80px,0.24fr)] xl:px-20">
        <div className="hidden lg:block">
          <div className="max-w-3xl">
            <GeovaultLogoFullDark className="h-14 w-auto" />
            <p className="mt-10 text-sm font-semibold uppercase tracking-[0.28em] text-blue-200/70">
              AI Search Visibility
            </p>
            <h1 className="mt-5 max-w-2xl text-5xl font-bold leading-tight tracking-tight xl:text-6xl">
              讓 AI 先理解你，再推薦你的品牌。
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-blue-100/75">
              GEOvault 協助品牌建立 AI 可讀資料、追蹤 5 大 AI 平台可見度，並用自助工具或專人代營運持續補強。
            </p>

            <div className="mt-12 grid max-w-2xl grid-cols-3 gap-3">
              {[
                ['5', 'AI 平台追蹤'],
                ['30', '代營運問題庫'],
                ['月付', '自助或專人'],
              ].map(([value, label]) => (
                <div key={label} className="border-l border-blue-300/30 pl-4">
                  <div className="text-3xl font-bold text-white">{value}</div>
                  <div className="mt-1 text-sm text-blue-100/65">{label}</div>
                </div>
              ))}
            </div>

            <div className="mt-12 max-w-xl rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-semibold text-emerald-200">登入後可管理</p>
              <p className="mt-2 text-sm leading-6 text-blue-100/70">
                網站掃描、AI 修復、品牌知識庫、引用監控、代營運付款與成效審核申請。
              </p>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 justify-center lg:justify-start">
          {children}
        </div>

        <div className="hidden lg:block" />
      </div>
    </div>
  )
}
