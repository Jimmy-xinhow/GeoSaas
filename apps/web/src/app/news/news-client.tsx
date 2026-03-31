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
  'ai-seo': 'bg-blue-900/50 text-blue-300',
  'ai-news': 'bg-purple-900/50 text-purple-300',
  'geo-updates': 'bg-green-900/50 text-green-300',
  industry: 'bg-orange-900/50 text-orange-300',
};

export default function NewsClient() {
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
    <>
      {/* Breadcrumb */}
      <nav className="max-w-4xl mx-auto px-6 pt-6" aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-sm text-gray-400">
          <li><Link href="/" className="hover:text-white">首頁</Link></li>
          <li className="text-gray-600">/</li>
          <li className="text-white">AI News</li>
        </ol>
      </nav>

      {/* Hero */}
      <section className="py-10 text-center">
        <h1 className="flex items-center justify-center gap-2 text-3xl font-bold text-white">
          <Newspaper className="h-8 w-8 text-blue-400" />
          AI News
        </h1>
        <p className="mt-3 text-gray-400 max-w-xl mx-auto">
          AI SEO 產業最新動態、趨勢分析、技術更新
        </p>
      </section>

      {/* Category Filter */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.key ?? 'all'}
              onClick={() => { setCategory(cat.key); setPage(1); }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === cat.key
                  ? 'bg-white text-gray-900'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
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
              <div key={i} className="h-28 bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="text-center py-16">
            <Newspaper className="h-12 w-12 text-gray-600 mx-auto" />
            <h3 className="mt-4 text-lg font-semibold text-white">尚無新聞</h3>
            <p className="text-gray-400 mt-1">稍後再來查看最新動態</p>
          </div>
        ) : (
          data.items.map((article) => (
            <a
              key={article.id}
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-gray-800 rounded-xl p-5 border border-gray-700 hover:shadow-md hover:shadow-gray-900/50 transition-shadow group"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[article.category] || 'bg-gray-700 text-gray-300'}`}>
                      {CATEGORY_LABELS[article.category] || article.category}
                    </span>
                    <span className="text-xs text-gray-500">{article.sourceName}</span>
                    <span className="text-xs text-gray-500">{new Date(article.publishedAt).toLocaleDateString('zh-TW')}</span>
                  </div>
                  <h2 className="font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-2">
                    {article.title}
                  </h2>
                  <p className="mt-1 text-sm text-gray-400 line-clamp-2">{article.summary}</p>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-500 shrink-0 mt-1 group-hover:text-blue-400" />
              </div>
            </a>
          ))
        )}

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="flex items-center gap-1 text-sm text-blue-400 disabled:text-gray-600">
              <ChevronLeft className="h-4 w-4" /> 上一頁
            </button>
            <span className="text-sm text-gray-400">{page} / {data.totalPages}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.totalPages} className="flex items-center gap-1 text-sm text-blue-400 disabled:text-gray-600">
              下一頁 <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>
    </>
  );
}
