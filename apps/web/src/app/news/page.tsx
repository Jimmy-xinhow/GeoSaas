'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Newspaper, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNewsList } from '@/hooks/use-news';

const CATEGORY_LABELS: Record<string, string> = {
  'ai-seo': 'AI SEO',
  'ai-news': 'AI 動態',
  'geo-updates': 'GEO 趨勢',
  industry: '產業新聞',
};

const CATEGORY_COLORS: Record<string, string> = {
  'ai-seo': 'bg-blue-100 text-blue-700',
  'ai-news': 'bg-purple-100 text-purple-700',
  'geo-updates': 'bg-green-100 text-green-700',
  industry: 'bg-orange-100 text-orange-700',
};

export default function NewsPage() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<string | undefined>();
  const { data, isLoading } = useNewsList({ page, category });

  const categories = [
    { key: undefined, label: '全部' },
    { key: 'ai-seo', label: 'AI SEO' },
    { key: 'ai-news', label: 'AI 動態' },
    { key: 'geo-updates', label: 'GEO 趨勢' },
    { key: 'industry', label: '產業新聞' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="flex items-center justify-between p-4 px-6 lg:px-12 bg-white border-b border-gray-100 sticky top-0 z-50">
        <Link href="/" className="text-xl font-bold text-gray-900">
          Geovault
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/blog" className="text-sm text-gray-600 hover:text-gray-900">
            Blog
          </Link>
          <Link href="/directory" className="text-sm text-gray-600 hover:text-gray-900">
            目錄
          </Link>
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">
            登入
          </Link>
          <Link
            href="/register"
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            免費開始
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-12 text-center bg-white border-b">
        <h1 className="flex items-center justify-center gap-2 text-3xl font-bold text-gray-900">
          <Newspaper className="h-8 w-8 text-blue-600" />
          AI News
        </h1>
        <p className="mt-3 text-gray-600 max-w-xl mx-auto">
          AI SEO 產業最新動態、趨勢分析、技術更新
        </p>
      </section>

      {/* Category Filter */}
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.key ?? 'all'}
              onClick={() => {
                setCategory(cat.key);
                setPage(1);
              }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === cat.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* News List */}
      <section className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-28 bg-white rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="text-center py-16">
            <Newspaper className="h-12 w-12 text-gray-300 mx-auto" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">尚無新聞</h3>
            <p className="text-gray-500 mt-1">稍後再來查看最新動態</p>
          </div>
        ) : (
          data.items.map((article) => (
            <a
              key={article.id}
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white rounded-xl p-5 border hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        CATEGORY_COLORS[article.category] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {CATEGORY_LABELS[article.category] || article.category}
                    </span>
                    <span className="text-xs text-gray-400">
                      {article.sourceName}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(article.publishedAt).toLocaleDateString('zh-TW')}
                    </span>
                  </div>
                  <h2 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                    {article.title}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                    {article.summary}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400 shrink-0 mt-1 group-hover:text-blue-600" />
              </div>
            </a>
          ))
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 text-sm text-blue-600 disabled:text-gray-300"
            >
              <ChevronLeft className="h-4 w-4" />
              上一頁
            </button>
            <span className="text-sm text-gray-500">
              {page} / {data.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= data.totalPages}
              className="flex items-center gap-1 text-sm text-blue-600 disabled:text-gray-300"
            >
              下一頁
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
