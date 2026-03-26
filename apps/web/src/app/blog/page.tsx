'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, BarChart3 } from 'lucide-react';
import { getAllPosts } from '@/content/blog/posts';
import { useBlogArticles } from '@/hooks/use-blog';

const CATEGORY_COLORS: Record<string, string> = {
  '入門教學': 'bg-blue-100 text-blue-700',
  '技術指南': 'bg-purple-100 text-purple-700',
  'AI 趨勢': 'bg-orange-100 text-orange-700',
  analysis: 'bg-green-100 text-green-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  analysis: 'AI 分析報告',
};

export default function BlogPage() {
  const staticPosts = getAllPosts();
  const [page, setPage] = useState(1);
  const { data: apiArticles } = useBlogArticles({ page });

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="flex items-center justify-between p-4 px-6 lg:px-12 bg-white border-b border-gray-100 sticky top-0 z-50">
        <Link href="/" className="text-xl font-bold text-gray-900">
          GEO SaaS
        </Link>
        <div className="flex items-center gap-6">
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
      <section className="py-16 text-center bg-gradient-to-b from-gray-50 to-white">
        <h1 className="text-4xl font-bold text-gray-900">GEO SaaS Blog</h1>
        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
          AI SEO 優化知識、最新趨勢、網站分析報告
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-12 space-y-10">
        {/* AI Analysis Articles (from API) */}
        {apiArticles && apiArticles.items.length > 0 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <BarChart3 className="h-5 w-5 text-green-600" />
              AI 能見度分析報告
              <span className="text-sm font-normal text-gray-500">
                ({apiArticles.total} 篇)
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {apiArticles.items.map((article) => (
                <Link key={article.id} href={`/blog/${article.slug}`}>
                  <article className="group border rounded-xl p-5 hover:shadow-lg transition-shadow cursor-pointer h-full">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                      <span className="px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                        {CATEGORY_LABELS[article.category] || article.category}
                      </span>
                      <span>{new Date(article.createdAt).toLocaleDateString('zh-TW')}</span>
                    </div>
                    <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                      {article.title}
                    </h3>
                    <p className="mt-1 text-gray-600 text-sm line-clamp-2">
                      {article.description}
                    </p>
                    {article.site && (
                      <div className="mt-2 text-xs text-gray-400">
                        GEO 分數: {article.site.bestScore}/100
                      </div>
                    )}
                  </article>
                </Link>
              ))}
            </div>
            {apiArticles.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="text-sm text-blue-600 disabled:text-gray-300"
                >
                  上一頁
                </button>
                <span className="text-sm text-gray-500">
                  {page} / {apiArticles.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= apiArticles.totalPages}
                  className="text-sm text-blue-600 disabled:text-gray-300"
                >
                  下一頁
                </button>
              </div>
            )}
          </div>
        )}

        {/* Static Knowledge Posts */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900">知識文章</h2>
          {staticPosts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`}>
              <article className="group border rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer">
                <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      CATEGORY_COLORS[post.category] || 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {post.category}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {post.readTime}
                  </span>
                  <span>{new Date(post.date).toLocaleDateString('zh-TW')}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {post.title}
                </h3>
                <p className="mt-2 text-gray-600 text-sm line-clamp-2">
                  {post.description}
                </p>
                <span className="inline-flex items-center gap-1 mt-4 text-sm text-blue-600 font-medium">
                  閱讀全文
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </span>
              </article>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
