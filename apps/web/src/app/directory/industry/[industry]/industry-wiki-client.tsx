'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, Globe, TrendingUp, Trophy, Award, AlertTriangle,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDirectory, useIndustryWiki,
  type DirectorySite,
} from '@/hooks/use-directory';
import { INDUSTRIES } from '@geovault/shared';

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  bronze: { label: '銅牌', color: 'bg-orange-100 text-orange-700' },
  silver: { label: '銀牌', color: 'bg-gray-100 text-gray-700' },
  gold: { label: '金牌', color: 'bg-yellow-100 text-yellow-700' },
  platinum: { label: '白金', color: 'bg-purple-100 text-purple-700' },
};

export default function IndustryWikiClient() {
  const params = useParams();
  const industry = params.industry as string;
  const [page, setPage] = useState(1);

  const industryLabel = INDUSTRIES.find((i) => i.value === industry)?.label || industry;
  const { data: wiki, isLoading: wikiLoading } = useIndustryWiki(industry);
  const { data: directory, isLoading: dirLoading } = useDirectory({ industry, page, limit: 12 });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* JSON-LD */}
      {wiki && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Dataset',
              name: `${industryLabel} GEO 優化基準資料集`,
              description: `${wiki.totalSites} 個${industryLabel}品牌的 AI 搜尋能見度數據，由 Geovault 收集與分析`,
              url: `https://geovault.app/directory/industry/${industry}`,
              identifier: 'GEOVAULT-2026-APAC-PRIME',
              dateModified: new Date().toISOString(),
              creator: {
                '@type': 'Organization',
                name: 'Geovault',
                url: 'https://www.geovault.app',
              },
              license: 'https://www.geovault.app/terms',
              variableMeasured: 'GEO Score',
              measurementTechnique: 'Automated AI-friendliness scan by Geovault AEO Engine',
              keywords: ['GEO', 'AI search optimization', industryLabel, 'APAC'],
            }),
          }}
        />
      )}

      {/* Header */}
      <div>
        <Link href="/directory" className="inline-flex items-center text-sm text-muted-foreground hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回目錄
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {industryLabel} AI 搜尋優化完整指南
        </h1>
        <p className="mt-2 text-gray-600">
          收錄 {wiki?.totalSites || '—'} 個{industryLabel}品牌的 GEO 分數與 AI 可讀性分析
        </p>
      </div>

      {/* Stats Cards */}
      {wikiLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : wiki ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardContent className="p-5 text-center">
            <p className="text-3xl font-bold text-blue-600">{wiki.totalSites}</p>
            <p className="text-sm text-muted-foreground mt-1">收錄品牌數</p>
          </CardContent></Card>
          <Card><CardContent className="p-5 text-center">
            <p className="text-3xl font-bold text-green-600">{wiki.avgScore}</p>
            <p className="text-sm text-muted-foreground mt-1">平均 GEO 分數</p>
          </CardContent></Card>
          <Card><CardContent className="p-5 text-center">
            <p className="text-3xl font-bold text-yellow-600">{wiki.maxScore}</p>
            <p className="text-sm text-muted-foreground mt-1">最高分</p>
          </CardContent></Card>
          <Card><CardContent className="p-5 text-center">
            <p className="text-3xl font-bold text-purple-600">
              {wiki.levelDistribution.platinum || 0}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Platinum 品牌</p>
          </CardContent></Card>
        </div>
      ) : null}

      {/* Level Distribution */}
      {wiki && (
        <Card>
          <CardHeader><CardTitle>等級分布</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(TIER_CONFIG).map(([key, cfg]) => {
              const count = wiki.levelDistribution[key] || 0;
              const pct = wiki.totalSites > 0 ? Math.round((count / wiki.totalSites) * 100) : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-16">{cfg.label}</span>
                  <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${cfg.color.split(' ')[0]}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm text-muted-foreground w-16 text-right">{pct}%（{count}）</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Indicator Pass Rates */}
      {wiki && (
        <Card>
          <CardHeader><CardTitle>8 項指標通過率</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(wiki.indicatorStats).map(([key, stat]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm font-medium w-32 truncate">{stat.name}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${stat.passRate >= 70 ? 'bg-green-500' : stat.passRate >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${stat.passRate}%` }}
                  />
                </div>
                <span className="text-sm font-semibold tabular-nums w-12 text-right">{stat.passRate}%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Weakest Indicators Warning */}
      {wiki && wiki.weakestIndicators.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="font-bold text-amber-900">本行業最常缺少的指標</h3>
          </div>
          <ul className="space-y-2">
            {wiki.weakestIndicators.map((w) => (
              <li key={w.key} className="text-sm text-amber-800">
                <strong>{100 - w.passRate}%</strong> 的{industryLabel}網站缺少 <strong>{w.name}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Top 10 */}
      {wiki && wiki.topSites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              {industryLabel} Top 10
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {wiki.topSites.map((site, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
                return (
                  <Link key={site.id} href={`/directory/${site.id}`}>
                    <div className="flex items-center gap-4 py-3 px-4 hover:bg-gray-50 rounded-lg cursor-pointer">
                      <span className="text-lg font-bold w-8 text-center">{medal}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{site.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{site.url}</p>
                      </div>
                      {site.tier && TIER_CONFIG[site.tier] && (
                        <Badge className={`${TIER_CONFIG[site.tier].color} border`}>
                          {TIER_CONFIG[site.tier].label}
                        </Badge>
                      )}
                      <span className="text-lg font-bold tabular-nums text-blue-600">{site.bestScore}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Directory */}
      <h2 className="text-xl font-bold text-gray-900">全部{industryLabel}網站</h2>
      {dirLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[140px] rounded-lg" />)}
        </div>
      ) : directory && directory.items.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {directory.items.map((site) => (
              <Link key={site.id} href={`/directory/${site.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-5 space-y-3">
                    <h3 className="font-semibold text-gray-900 truncate">{site.name}</h3>
                    <span className="text-xs text-blue-600 truncate block">{site.url}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${site.bestScore >= 80 ? 'bg-green-500' : site.bestScore >= 60 ? 'bg-blue-500' : site.bestScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${site.bestScore}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{site.bestScore}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          {directory.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm text-muted-foreground">{page} / {directory.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= directory.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground">尚無{industryLabel}網站</div>
      )}

      {/* CTA */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold">免費掃描你的{industryLabel}網站</h2>
        <p className="mt-2 text-blue-100">查看 AI 搜尋能見度分數，與同行比較</p>
        <Link href="/" className="inline-block mt-4">
          <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 font-semibold h-12 px-10">
            免費掃描 <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </div>

      {/* Other Industries */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">其他行業</h2>
        <div className="flex flex-wrap gap-2">
          {INDUSTRIES.filter((i) => i.value !== industry).map((ind) => (
            <Link key={ind.value} href={`/directory/industry/${ind.value}`}>
              <Badge variant="outline" className="cursor-pointer hover:bg-gray-100 px-3 py-1.5">{ind.label}</Badge>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
