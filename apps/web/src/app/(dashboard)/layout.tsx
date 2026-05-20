'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useAuthStore from '@/stores/auth-store'
import Sidebar from '@/components/layout/sidebar'
import Header from '@/components/layout/header'
import ErrorBoundary from '@/components/error-boundary'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { isAuthenticated, isHydrated, hydrate } = useAuthStore()

  useEffect(() => {
    // Only hydrate on cold tabs / page reloads. A fresh login() already
    // writes the canonical user/token into the store and flips isHydrated,
    // so hitting /auth/me again would pointlessly race the just-issued token.
    if (!isHydrated) hydrate()
  }, [isHydrated, hydrate])

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isHydrated, isAuthenticated, router])

  // Show loading spinner while checking auth status
  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    )
  }

  // Don't render dashboard content if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="flex min-h-screen max-w-full overflow-x-hidden bg-gray-900">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <Header />
        <div className="dashboard-main flex-1 min-w-0 overflow-auto overflow-x-hidden p-4 sm:p-6 bg-gray-900 text-white">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>
    </div>
  )
}
