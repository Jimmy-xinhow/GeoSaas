import type { Metadata } from 'next'
import PublicFooter from '@/components/layout/public-footer'
import PublicNavbar from '@/components/layout/public-navbar'

export const metadata: Metadata = {
  title: 'GEO 技術準備度品牌目錄',
  description: '探索公開網站的 GEO 技術準備度與行業分類；分數不是第三方 AI 平台的認證。',
}

export default function DirectoryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-900">
      <PublicNavbar />
      <main>{children}</main>
      <PublicFooter />
    </div>
  )
}
