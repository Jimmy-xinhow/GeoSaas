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
    hydrate()
  }, [hydrate])

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
    <div className="min-h-screen flex">
      {/* Left side - branding */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 items-center justify-center relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="relative text-center">
          <GeovaultLogoFullDark className="h-14 w-auto mb-4 mx-auto" />
          <p className="text-xl text-blue-200/80">讓 AI 優先推薦你的品牌</p>
          <div className="mt-8 flex justify-center gap-3">
            <div className="h-2 w-2 rounded-full bg-white/20" />
            <div className="h-2 w-2 rounded-full bg-white/40" />
            <div className="h-2 w-2 rounded-full bg-white/70" />
          </div>
        </div>
      </div>

      {/* Right side - form */}
      <div className="flex-1 flex items-center justify-center bg-gray-900 p-6">
        {children}
      </div>
    </div>
  )
}
