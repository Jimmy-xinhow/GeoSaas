import type { Metadata } from 'next'

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
      {/* Public header */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-gray-900">
            GEO SaaS
          </a>
          <nav className="flex items-center gap-6">
            <a
              href="/directory"
              className="text-sm font-medium text-blue-600"
            >
              目錄
            </a>
            <a
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              登入
            </a>
            <a
              href="/register"
              className="text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              免費註冊
            </a>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
