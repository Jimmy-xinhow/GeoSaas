'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Award, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSuccessCases, useFeaturedCases } from '@/hooks/use-cases';
import PublicNavbar from '@/components/layout/public-navbar';

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  chatgpt: { label: 'ChatGPT', color: 'bg-green-500/20 text-green-400' },
  claude: { label: 'Claude', color: 'bg-orange-500/20 text-orange-400' },
  perplexity: { label: 'Perplexity', color: 'bg-blue-500/20 text-blue-400' },
  gemini: { label: 'Gemini', color: 'bg-purple-500/20 text-purple-400' },
  copilot: { label: 'Copilot', color: 'bg-cyan-500/20 text-cyan-400' },
  other: { label: '其他', color: 'bg-gray-500/20 text-gray-400' },
};

/* ─── Auto-scrolling Carousel ─── */
function FeaturedCarousel({ items }: { items: any[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) el.addEventListener('scroll', checkScroll);
    return () => el?.removeEventListener('scroll', checkScroll);
  }, [items]);

  // Auto scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || items.length <= 3) return;
    const interval = setInterval(() => {
      if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 10) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: 300, behavior: 'smooth' });
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [items]);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });
  };

  return (
    <div className="relative group">
      {/* Left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-gray-800/80 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-gray-800/80 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-700"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
      {/* Left fade */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-gray-900 to-transparent z-[5] pointer-events-none" />
      )}
      {/* Right fade */}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-gray-900 to-transparent z-[5] pointer-events-none" />
      )}

      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 scroll-smooth scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {items.map((c) => (
          <Link key={c.id} href={`/cases/${c.id}`} className="snap-start">
            <Card className="w-[300px] shrink-0 bg-white/5 backdrop-blur-sm border border-white/10 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/10 transition-all cursor-pointer">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className={PLATFORM_CONFIG[c.aiPlatform]?.color || 'bg-white/10'}>
                    {PLATFORM_CONFIG[c.aiPlatform]?.label || c.aiPlatform}
                  </Badge>
                  {c.featuredAt && (
                    <Badge className="bg-yellow-500/20 text-yellow-400 text-[10px]">精選</Badge>
                  )}
                </div>
                <h3 className="font-semibold text-sm text-white line-clamp-2">{c.title}</h3>
                <p className="text-xs text-yellow-200/60 line-clamp-1">「{c.queryUsed}」</p>
                {c.beforeGeoScore != null && c.afterGeoScore != null && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-red-400 font-bold">{c.beforeGeoScore}</span>
                    <span className="text-yellow-200/40">→</span>
                    <span className="text-green-400 font-bold">{c.afterGeoScore}</span>
                    <span className="text-xs text-green-400">
                      (+{c.afterGeoScore - c.beforeGeoScore})
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function CasesPage() {
  const [page, setPage] = useState(1);
  const [platform, setPlatform] = useState<string | undefined>();
  const { data: featured } = useFeaturedCases();
  const { data: cases, isLoading } = useSuccessCases({ page, aiPlatform: platform });

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <PublicNavbar />

      <section className="py-12 text-center bg-gradient-to-b from-gray-800 to-gray-900">
        <h1 className="flex items-center justify-center gap-2 text-3xl font-bold text-white">
          <Award className="h-8 w-8 text-yellow-500" />
          GEO 成功案例
        </h1>
        <p className="mt-3 text-yellow-200/60 max-w-xl mx-auto">
          真實品牌被 AI 引用的故事 — 看看他們如何做到的
        </p>
      </section>

      {/* Featured carousel */}
      {featured && featured.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-8">
          <h2 className="text-lg font-bold text-white mb-4">精選案例</h2>
          <FeaturedCarousel items={featured} />
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
                platform === p.key ? 'bg-white text-gray-900' : 'bg-white/10 text-gray-400 hover:bg-white/15'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 bg-white/10 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !cases || cases.items.length === 0 ? (
          <div className="text-center py-16 max-w-lg mx-auto">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-10 border border-white/10">
              <Award className="h-16 w-16 text-yellow-500 mx-auto" />
              <h3 className="mt-6 text-2xl font-bold text-white">你的品牌被 AI 引用了嗎？</h3>
              <p className="text-yellow-200/60 mt-3 leading-relaxed">
                如果你的品牌曾經被 ChatGPT、Claude、Copilot、Perplexity 或 Gemini 提及或推薦，歡迎提交你的成功案例！
              </p>
              <p className="text-yellow-200/40 mt-2 text-sm">
                經審核通過後，我們會為你的品牌生成一篇 AI 分析文章，增加更多曝光機會。
              </p>
              <Link href="/register">
                <button className="mt-6 bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors">
                  免費註冊並提交案例
                </button>
              </Link>
              <p className="text-xs text-yellow-200/40 mt-4">
                目前已有 {cases?.total ?? 0} 個品牌正在等待審核
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {cases.items.map((c) => (
              <Link key={c.id} href={`/cases/${c.id}`}>
                <Card className="bg-white/5 backdrop-blur-sm border border-white/10 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/10 transition-all cursor-pointer">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={PLATFORM_CONFIG[c.aiPlatform]?.color || 'bg-white/10'}>
                          {PLATFORM_CONFIG[c.aiPlatform]?.label || c.aiPlatform}
                        </Badge>
                        {c.tags.slice(0, 3).map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                      <h3 className="font-bold text-white">{c.title}</h3>
                      <p className="text-sm text-yellow-200/60 truncate mt-1">「{c.queryUsed}」</p>
                    </div>
                    {c.beforeGeoScore != null && c.afterGeoScore != null && (
                      <div className="text-center shrink-0">
                        <div className="text-sm text-yellow-200/60">{c.beforeGeoScore} → {c.afterGeoScore}</div>
                        <div className="text-xs font-bold text-green-400">+{c.afterGeoScore - c.beforeGeoScore}</div>
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
            <span className="text-sm text-yellow-200/60">{page} / {cases.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= cases.totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
