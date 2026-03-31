'use client';

import { useState } from 'react';
import Link from 'next/link';
import PublicNavbar from '@/components/layout/public-navbar';
import { ArrowRight, Clock, BarChart3 } from 'lucide-react';
import { getAllPosts } from '@/content/blog/posts';
import { useBlogArticles } from '@/hooks/use-blog';

const CATEGORY_COLORS: Record<string, string> = {
  '入門教學': 'bg-blue-500/20 text-blue-300',
  '技術指南': 'bg-purple-500/20 text-purple-300',
  'AI 趨勢': 'bg-orange-500/20 text-orange-300',
  analysis: 'bg-green-500/20 text-green-300',
};

const CATEGORY_LABELS: Record<string, string> = {
  analysis: 'AI 分析報告',
};

export default function BlogClient() {
  const staticPosts = getAllPosts();
  const [page, setPage] = useState(1);
  const { data: apiArticles } = useBlogArticles({ page });

  return (
    <>
      {/* Breadcrumb */}
      <nav className="max-w-4xl mx-auto px-6 pt-6" aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-sm text-gray-400">
          <li><Link href="/" className="hover:text-white">首頁</Link></li>
          <li className="text-gray-600">/</li>
          <li className="text-white">Blog</li>
        </ol>
      </nav>

      {/* Hero */}
      <section className="py-12 text-center">
        <h1 className="text-4xl font-bold text-white">Geovault Blog</h1>
        <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
          AI SEO 優化知識、最新趨勢、網站分析報告
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-12 space-y-10">
        {/* AI Analysis Articles (from API) */}
        {apiArticles && apiArticles.items.length > 0 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <BarChart3 className="h-5 w-5 text-green-400" />
              AI 能見度分析報告
              <span className="text-sm font-normal text-gray-400">
                ({apiArticles.total} 篇)
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {apiArticles.items.map((article) => (
                <Link key={article.id} href={`/blog/${article.slug}`}>
                  <article className="group bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 hover:bg-white/10 transition-all cursor-pointer h-full">
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                      <span className="px-2 py-0.5 rounded-full font-medium bg-green-500/20 text-green-300">
                        {CATEGORY_LABELS[article.category] || article.category}
                      </span>
                      <span>{new Date(article.createdAt).toLocaleDateString('zh-TW')}</span>
                    </div>
                    <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-2">
                      {article.title}
                    </h3>
                    <p className="mt-1 text-gray-400 text-sm line-clamp-2">
                      {article.description}
                    </p>
                    {article.site && (
                      <div className="mt-2 text-xs text-gray-500">
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
                  className="text-sm text-blue-400 disabled:text-gray-600"
                >
                  上一頁
                </button>
                <span className="text-sm text-gray-400">
                  {page} / {apiArticles.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= apiArticles.totalPages}
                  className="text-sm text-blue-400 disabled:text-gray-600"
                >
                  下一頁
                </button>
              </div>
            )}
          </div>
        )}

        {/* Static Knowledge Posts */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white">知識文章</h2>
          {staticPosts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`}>
              <article className="group bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all cursor-pointer">
                <div className="flex items-center gap-3 text-sm text-gray-400 mb-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      CATEGORY_COLORS[post.category] || 'bg-white/10 text-gray-300'
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
                <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">
                  {post.title}
                </h3>
                <p className="mt-2 text-gray-400 text-sm line-clamp-2">
                  {post.description}
                </p>
                <span className="inline-flex items-center gap-1 mt-4 text-sm text-blue-400 font-medium">
                  閱讀全文
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </span>
              </article>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
