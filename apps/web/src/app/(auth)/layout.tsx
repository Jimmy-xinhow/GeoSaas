'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useAuthStore from '@/stores/auth-store'

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
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm text-muted-foreground">載入中...</p>
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
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-blue-600 to-indigo-700 items-center justify-center">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white mb-4">Geovault</h1>
          <p className="text-xl text-blue-100">讓 AI 優先推薦你的品牌</p>
          <div className="mt-8 flex justify-center gap-3">
            <div className="h-2 w-2 rounded-full bg-white/40" />
            <div className="h-2 w-2 rounded-full bg-white/60" />
            <div className="h-2 w-2 rounded-full bg-white" />
          </div>
        </div>
      </div>

      {/* Right side - form */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-6">
        {children}
      </div>
    </div>
  )
}
