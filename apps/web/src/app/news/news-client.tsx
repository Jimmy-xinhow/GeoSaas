'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Newspaper, ChevronLeft, ChevronRight, ArrowLeft, Clock } from 'lucide-react';
import { useNewsList, useNewsDetail } from '@/hooks/use-news';

const CATEGORY_LABELS: Record<string, string> = {
  'ai-seo': 'AI SEO',
  'ai-news': 'AI 動態',
  'ai-search': 'AI 搜尋趨勢',
  'geo-strategy': 'GEO 策略',
  'geo-updates': 'GEO 趨勢',
  'brand-ai': '品牌 AI 行銷',
  'tech-update': '技術更新',
  'case-study': '案例分析',
  industry: '產業洞察',
};

const CATEGORY_COLORS: Record<string, string> = {
  'ai-seo': 'bg-blue-500/20 text-blue-400',
  'ai-news': 'bg-purple-500/20 text-purple-400',
  'ai-search': 'bg-cyan-500/20 text-cyan-400',
  'geo-strategy': 'bg-green-500/20 text-green-400',
  'geo-updates': 'bg-green-500/20 text-green-400',
  'brand-ai': 'bg-orange-500/20 text-orange-400',
  'tech-update': 'bg-indigo-500/20 text-indigo-400',
  'case-study': 'bg-yellow-500/20 text-yellow-400',
  industry: 'bg-pink-500/20 text-pink-400',
};

function markdownToHtml(md: string): string {
  return md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-black/30 rounded-lg p-4 border border-white/10 overflow-x-auto my-4"><code class="text-sm text-green-400">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded text-sm text-gray-200">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-white mt-6 mb-3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-white mt-8 mb-4">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-white mt-8 mb-4">$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">$1</a>')
    .replace(/^(\d+)\.\s+(.+)$/gm, '<li class="text-gray-300 ml-4 list-decimal">$2</li>')
    .replace(/^-\s+(.+)$/gm, '<li class="text-gray-300 ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, '</p><p class="text-gray-300 leading-relaxed mb-4">')
    .replace(/^(?!<[hluop])(.*\S.*)$/gm, (line) => (line.startsWith('<') ? line : `<p class="text-gray-300 leading-relaxed mb-4">${line}</p>`))
    .replace(/<p class="text-gray-300 leading-relaxed mb-4"><\/p>/g, '')
    .replace(/<p class="text-gray-300 leading-relaxed mb-4">(<h[123])/g, '$1')
    .replace(/(<\/h[123]>)<\/p>/g, '$1')
    .replace(/<p class="text-gray-300 leading-relaxed mb-4">(<li)/g, '$1')
    .replace(/(<\/li>)<\/p>/g, '$1')
    .replace(/<p class="text-gray-300 leading-relaxed mb-4">(<pre)/g, '$1')
    .replace(/(<\/pre>)<\/p>/g, '$1');
}

function getPlainPreview(md: string): string {
  return md
    .replace(/^##?\s.+\n*/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*\->\n`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export default function NewsClient() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<string | undefined>();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const { data, isLoading } = useNewsList({ page, category });
  const { data: detail } = useNewsDetail(selectedSlug || '');

  const categories = [
    { key: undefined, label: '全部' },
    { key: 'ai-search', label: 'AI 搜尋趨勢' },
    { key: 'geo-strategy', label: 'GEO 策略' },
    { key: 'brand-ai', label: '品牌 AI 行銷' },
    { key: 'tech-update', label: '技術更新' },
    { key: 'case-study', label: '案例分析' },
    { key: 'industry', label: '產業洞察' },
  ];

  // ─── Article Detail View ───
  if (selectedSlug && detail) {
    return (
      <article className="max-w-3xl mx-auto px-6 py-8">
        <button
          onClick={() => setSelectedSlug(null)}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回新聞列表
        </button>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${CATEGORY_COLORS[detail.category] || 'bg-white/10 text-gray-300'}`}>
            {CATEGORY_LABELS[detail.category] || detail.category}
          </span>
          <span className="flex items-center gap-1 text-xs text-yellow-200/60">
            <Clock className="h-3 w-3" />
            {new Date(detail.publishedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <span className="text-xs text-yellow-200/40">Geovault 原創分析</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-8">{detail.title}</h1>

        {/* Article content */}
        <div
          className="max-w-none"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(detail.summary) }}
        />

        {/* Bottom CTA */}
        <div className="mt-12 p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl text-center">
          <p className="text-white font-semibold">想讓你的品牌也被 AI 推薦？</p>
          <p className="text-sm text-gray-400 mt-1">免費掃描你的網站，看看 AI 能見度分數</p>
          <Link href="/" className="inline-block mt-3 bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
            免費掃描
          </Link>
        </div>
      </article>
    );
  }

  // ─── News List View ───
  return (
    <>
      <nav className="max-w-4xl mx-auto px-6 pt-6" aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-sm text-gray-400">
          <li><Link href="/" className="hover:text-white">首頁</Link></li>
          <li className="text-gray-600">/</li>
          <li className="text-white">AI News</li>
        </ol>
      </nav>

      <section className="py-10 text-center">
        <h1 className="flex items-center justify-center gap-2 text-3xl font-bold text-white">
          <Newspaper className="h-8 w-8 text-blue-400" />
          AI News
        </h1>
        <p className="mt-3 text-gray-400 max-w-xl mx-auto">
          AI 搜尋趨勢分析、GEO 優化策略、品牌 AI 行銷洞察 — Geovault 原創觀點
        </p>
      </section>

      <div className="max-w-4xl mx-auto px-6">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.key ?? 'all'}
              onClick={() => { setCategory(cat.key); setPage(1); }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === cat.key
                  ? 'bg-white text-gray-900'
                  : 'bg-white/10 text-gray-400 hover:bg-white/15'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <section className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-28 bg-white/10 rounded-xl animate-pulse" />
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
            <button
              key={article.id}
              onClick={() => setSelectedSlug(article.slug)}
              className="block w-full text-left bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[article.category] || 'bg-white/10 text-gray-300'}`}>
                      {CATEGORY_LABELS[article.category] || article.category}
                    </span>
                    <span className="text-xs text-yellow-200/60">Geovault 原創分析</span>
                    <span className="text-xs text-yellow-200/40">{new Date(article.publishedAt).toLocaleDateString('zh-TW')}</span>
                  </div>
                  <h2 className="font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-2">
                    {article.title}
                  </h2>
                  <p className="mt-1.5 text-sm text-gray-400 line-clamp-2">
                    {getPlainPreview(article.summary)}...
                  </p>
                </div>
                <div className="text-blue-400 text-xs shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  閱讀全文 →
                </div>
              </div>
            </button>
          ))
        )}

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="flex items-center gap-1 text-sm text-blue-400 disabled:text-gray-600">
              <ChevronLeft className="h-4 w-4" /> 上一頁
            </button>
            <span className="text-sm text-yellow-200/60">{page} / {data.totalPages}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.totalPages} className="flex items-center gap-1 text-sm text-blue-400 disabled:text-gray-600">
              下一頁 <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>
    </>
  );
}
