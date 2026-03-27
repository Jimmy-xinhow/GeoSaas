import type { Metadata } from 'next'
import PublicNavbar from '@/components/layout/public-navbar'

export const metadata: Metadata = {
  title: 'GEO 目錄 — AI SEO 優化網站排行榜',
  description: '探索已通過 GEO 優化認證的網站，查看排行榜和行業分類。',
}

export default function DirectoryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <PublicNavbar />
      <main>{children}</main>
    </div>
  )
}
