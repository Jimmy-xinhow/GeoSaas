'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Award, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSuccessCases, useFeaturedCases } from '@/hooks/use-cases';
import PublicNavbar from '@/components/layout/public-navbar';

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  chatgpt: { label: 'ChatGPT', color: 'bg-green-100 text-green-700' },
  claude: { label: 'Claude', color: 'bg-orange-100 text-orange-700' },
  perplexity: { label: 'Perplexity', color: 'bg-blue-100 text-blue-700' },
  gemini: { label: 'Gemini', color: 'bg-purple-100 text-purple-700' },
  copilot: { label: 'Copilot', color: 'bg-cyan-100 text-cyan-700' },
  other: { label: '其他', color: 'bg-gray-100 text-gray-700' },
};

export default function CasesPage() {
  const [page, setPage] = useState(1);
  const [platform, setPlatform] = useState<string | undefined>();
  const { data: featured } = useFeaturedCases();
  const { data: cases, isLoading } = useSuccessCases({ page, aiPlatform: platform });

  return (
    <div className="min-h-screen bg-white">
      <PublicNavbar />

      <section className="py-12 text-center bg-gradient-to-b from-yellow-50 to-white">
        <h1 className="flex items-center justify-center gap-2 text-3xl font-bold text-gray-900">
          <Award className="h-8 w-8 text-yellow-500" />
          GEO 成功案例
        </h1>
        <p className="mt-3 text-gray-600 max-w-xl mx-auto">
          真實品牌被 AI 引用的故事 — 看看他們如何做到的
        </p>
      </section>

      {/* Featured carousel */}
      {featured && featured.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">精選案例</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
            {featured.map((c) => (
              <Link key={c.id} href={`/cases/${c.id}`} className="snap-start">
                <Card className="w-[280px] shrink-0 hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className={PLATFORM_CONFIG[c.aiPlatform]?.color || 'bg-gray-100'}>
                        {PLATFORM_CONFIG[c.aiPlatform]?.label || c.aiPlatform}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-sm line-clamp-2">{c.title}</h3>
                    <p className="text-xs text-gray-500 line-clamp-1">「{c.queryUsed}」</p>
                    {c.beforeGeoScore != null && c.afterGeoScore != null && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-red-400 font-bold">{c.beforeGeoScore}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-green-600 font-bold">{c.afterGeoScore}</span>
                        <span className="text-xs text-green-600">
                          (+{c.afterGeoScore - c.beforeGeoScore})
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Filter + List */}
      <section className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex flex-wrap gap-2 mb-6">
          {[{ key: undefined, label: '全部' }, ...Object.entries(PLATFORM_CONFIG).map(([k, v]) => ({ key: k, label: v.label }))].map((p) => (
            <button
              key={p.key ?? 'all'}
              onClick={() => { setPlatform(p.key); setPage(1); }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                platform === p.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !cases || cases.items.length === 0 ? (
          <div className="text-center py-16 max-w-lg mx-auto">
            <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl p-10 border border-yellow-100">
              <Award className="h-16 w-16 text-yellow-500 mx-auto" />
              <h3 className="mt-6 text-2xl font-bold text-gray-900">你的品牌被 AI 引用了嗎？</h3>
              <p className="text-gray-600 mt-3 leading-relaxed">
                如果你的品牌曾經被 ChatGPT、Claude、Copilot、Perplexity 或 Gemini 提及或推薦，歡迎提交你的成功案例！
              </p>
              <p className="text-gray-500 mt-2 text-sm">
                經審核通過後，我們會為你的品牌生成一篇 AI 分析文章，增加更多曝光機會。
              </p>
              <Link href="/register">
                <button className="mt-6 bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors">
                  免費註冊並提交案例
                </button>
              </Link>
              <p className="text-xs text-gray-400 mt-4">
                目前已有 {cases?.total ?? 0} 個品牌正在等待審核
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {cases.items.map((c) => (
              <Link key={c.id} href={`/cases/${c.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={PLATFORM_CONFIG[c.aiPlatform]?.color || 'bg-gray-100'}>
                          {PLATFORM_CONFIG[c.aiPlatform]?.label || c.aiPlatform}
                        </Badge>
                        {c.tags.slice(0, 3).map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                      <h3 className="font-bold text-gray-900">{c.title}</h3>
                      <p className="text-sm text-gray-500 truncate mt-1">「{c.queryUsed}」</p>
                    </div>
                    {c.beforeGeoScore != null && c.afterGeoScore != null && (
                      <div className="text-center shrink-0">
                        <div className="text-sm text-gray-500">{c.beforeGeoScore} → {c.afterGeoScore}</div>
                        <div className="text-xs font-bold text-green-600">+{c.afterGeoScore - c.beforeGeoScore}</div>
                      </div>
                    )}
                    <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {cases && cases.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-6">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-500">{page} / {cases.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= cases.totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
