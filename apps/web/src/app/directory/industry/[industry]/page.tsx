'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Globe,
  TrendingUp,
  Trophy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDirectory,
  useIndustryStats,
  type DirectorySite,
} from '@/hooks/use-directory';
import { INDUSTRIES } from '@geo-saas/shared';

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  bronze: { label: '銅牌', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  silver: { label: '銀牌', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  gold: { label: '金牌', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  platinum: { label: '白金', color: 'bg-purple-100 text-purple-700 border-purple-200' },
};

export default function IndustryPage() {
  const params = useParams();
  const industry = params.industry as string;
  const [page, setPage] = useState(1);

  const industryLabel = INDUSTRIES.find((i) => i.value === industry)?.label || industry;
  const { data: stats, isLoading: statsLoading } = useIndustryStats(industry);
  const { data: directory, isLoading: dirLoading } = useDirectory({
    industry,
    page,
    limit: 12,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Back + Title */}
      <div>
        <Link
          href="/directory"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回目錄
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {industryLabel}行業 — GEO 優化目錄
        </h1>
        <p className="mt-2 text-gray-600">
          探索{industryLabel}行業中已通過 AI SEO 優化的網站
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 bg-blue-100 rounded-full">
              <Globe className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {statsLoading ? <Skeleton className="h-7 w-12" /> : stats?.totalSites || 0}
              </p>
              <p className="text-sm text-muted-foreground">{industryLabel}網站</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 bg-green-100 rounded-full">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {statsLoading ? <Skeleton className="h-7 w-12" /> : stats?.avgScore || 0}
              </p>
              <p className="text-sm text-muted-foreground">平均分數</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-3 bg-yellow-100 rounded-full">
              <Trophy className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {statsLoading ? <Skeleton className="h-7 w-12" /> : stats?.maxScore || 0}
              </p>
              <p className="text-sm text-muted-foreground">最高分數</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Sites */}
      {stats && stats.topSites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              {industryLabel} Top 5
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {stats.topSites.map((site, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
                const tierCfg = site.tier ? TIER_CONFIG[site.tier] : null;
                return (
                  <Link key={site.id} href={`/directory/${site.id}`}>
                    <div className="flex items-center gap-4 py-3 px-4 hover:bg-gray-50 rounded-lg cursor-pointer">
                      <span className="text-lg font-bold w-8 text-center">{medal}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{site.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{site.url}</p>
                      </div>
                      {tierCfg && (
                        <Badge className={`${tierCfg.color} border`}>{tierCfg.label}</Badge>
                      )}
                      <span className="text-lg font-bold tabular-nums text-blue-600">
                        {site.bestScore}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full List */}
      {dirLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-lg" />
          ))}
        </div>
      ) : !directory || directory.items.length === 0 ? (
        <div className="text-center py-12">
          <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">尚無{industryLabel}網站</h3>
          <p className="text-muted-foreground mt-1">目前沒有此行業的公開網站</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {directory.items.map((site) => {
              const tierCfg = site.tier ? TIER_CONFIG[site.tier] : null;
              return (
                <Link key={site.id} href={`/directory/${site.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-gray-900 truncate">{site.name}</h3>
                          <span className="text-xs text-blue-600 truncate block">{site.url}</span>
                        </div>
                        {tierCfg && (
                          <Badge className={`${tierCfg.color} border`}>{tierCfg.label}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              site.bestScore >= 80 ? 'bg-green-500' :
                              site.bestScore >= 60 ? 'bg-blue-500' :
                              site.bestScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${site.bestScore}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold tabular-nums w-8 text-right">
                          {site.bestScore}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          {directory.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                第 {page} / {directory.totalPages} 頁
              </span>
              <Button variant="outline" size="sm" disabled={page >= directory.totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Other Industries */}
      <div className="pt-4">
        <h2 className="text-lg font-bold text-gray-900 mb-3">其他行業</h2>
        <div className="flex flex-wrap gap-2">
          {INDUSTRIES.filter((i) => i.value !== industry).map((ind) => (
            <Link key={ind.value} href={`/directory/industry/${ind.value}`}>
              <Badge variant="outline" className="cursor-pointer hover:bg-gray-100 px-3 py-1.5">
                {ind.label}
              </Badge>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
