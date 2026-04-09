'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useIndustryAiRanking } from '@/hooks/use-industry-ai';
import { INDUSTRIES } from '@geovault/shared';
import { Trophy, TrendingUp, Bot, ArrowRight, BarChart3, Crown, Medal } from 'lucide-react';
import PublicNavbar from '@/components/layout/public-navbar';

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  CHATGPT: { label: 'ChatGPT', color: 'bg-green-100 text-green-700' },
  CLAUDE: { label: 'Claude', color: 'bg-orange-100 text-orange-700' },
  PERPLEXITY: { label: 'Perplexity', color: 'bg-blue-100 text-blue-700' },
  GEMINI: { label: 'Gemini', color: 'bg-red-100 text-red-700' },
  COPILOT: { label: 'Copilot', color: 'bg-purple-100 text-purple-700' },
};

const PLATFORMS = ['CHATGPT', 'CLAUDE', 'PERPLEXITY', 'GEMINI', 'COPILOT'];

function RateBadge({ rate }: { rate: number }) {
  const color = rate >= 60 ? 'bg-green-100 text-green-700' : rate >= 30 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  return <Badge className={`${color} font-bold`}>{rate}%</Badge>;
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-orange-400" />;
  return <span className="text-sm font-mono text-gray-400 w-5 text-center">{rank}</span>;
}

export default function IndustryRankingClient({ params }: { params: { industry: string } }) {
  const { industry } = params;
  const [platform, setPlatform] = useState<string | undefined>(undefined);
  const { data, isLoading } = useIndustryAiRanking(industry, platform);

  const industryLabel = INDUSTRIES.find((i) => i.value === industry)?.label || industry;

  return (
    <>
      <PublicNavbar />
      <div className="min-h-screen bg-gray-50">
        {/* Hero */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white py-16">
          <div className="max-w-5xl mx-auto px-4 text-center">
            <Badge className="bg-white/20 text-white mb-4">AI 品牌推薦排行榜</Badge>
            <h1 className="text-3xl md:text-4xl font-bold mb-3">
              {industryLabel} — AI 搜尋推薦排行
            </h1>
            <p className="text-blue-100 text-lg max-w-2xl mx-auto">
              哪些{industryLabel}品牌最常被 ChatGPT、Claude、Perplexity 等 AI 推薦？
              基於 5 大 AI 平台的真實測試數據。
            </p>
            {data && (
              <div className="flex items-center justify-center gap-8 mt-8">
                <div>
                  <p className="text-3xl font-bold">{data.totalBrands}</p>
                  <p className="text-sm text-blue-200">收錄品牌</p>
                </div>
                <div>
                  <p className="text-3xl font-bold">{data.avgMentionRate}%</p>
                  <p className="text-sm text-blue-200">平均引用率</p>
                </div>
                <div>
                  <p className="text-3xl font-bold">5</p>
                  <p className="text-sm text-blue-200">AI 平台</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          {/* Platform Filter Tabs */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={!platform ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPlatform(undefined)}
                >
                  全部平台
                </Button>
                {PLATFORMS.map((p) => (
                  <Button
                    key={p}
                    variant={platform === p ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPlatform(p)}
                  >
                    <Bot className="h-3 w-3 mr-1" />
                    {PLATFORM_CONFIG[p]?.label || p}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Ranking Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                {platform ? `${PLATFORM_CONFIG[platform]?.label} 引用排行` : 'AI 綜合引用排行'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : !data || data.ranking.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">尚無數據</p>
                  <p className="text-sm mt-1">AI 測試尚未執行，數據將在每週一自動更新</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left text-sm text-gray-500">
                        <th className="pb-3 w-10">#</th>
                        <th className="pb-3">品牌</th>
                        <th className="pb-3 text-center">GEO 分數</th>
                        <th className="pb-3 text-center">AI 引用率</th>
                        {!platform && PLATFORMS.map((p) => (
                          <th key={p} className="pb-3 text-center text-xs">
                            {PLATFORM_CONFIG[p]?.label}
                          </th>
                        ))}
                        <th className="pb-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.ranking.map((site, idx) => (
                        <tr key={site.id} className="hover:bg-gray-50 transition">
                          <td className="py-4">
                            <RankIcon rank={idx + 1} />
                          </td>
                          <td className="py-4">
                            <Link href={`/industry/${industry}/${site.id}`} className="hover:text-blue-600">
                              <p className="font-medium">{site.name}</p>
                              <p className="text-xs text-gray-400 truncate max-w-[200px]">{site.url}</p>
                            </Link>
                          </td>
                          <td className="py-4 text-center">
                            <span className="font-bold text-blue-600">{site.bestScore}</span>
                          </td>
                          <td className="py-4 text-center">
                            <RateBadge rate={site.mentionRate} />
                          </td>
                          {!platform && PLATFORMS.map((p) => (
                            <td key={p} className="py-4 text-center">
                              {site.byPlatform?.[p] ? (
                                <span className={`text-xs font-medium ${site.byPlatform[p].rate > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                                  {site.byPlatform[p].rate}%
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          ))}
                          <td className="py-4">
                            <Link href={`/industry/${industry}/${site.id}`}>
                              <Button variant="ghost" size="sm">
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Compare CTA */}
          <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200">
            <CardContent className="p-6 text-center">
              <h3 className="font-bold text-lg mb-2">想比較兩個品牌？</h3>
              <p className="text-gray-600 text-sm mb-4">
                選擇兩個{industryLabel}品牌，看看 AI 更推薦誰
              </p>
              <Link href={`/industry/${industry}/compare`}>
                <Button>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  品牌 vs 品牌 對比
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
