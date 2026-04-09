'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBrandImpression, useCitationTrend } from '@/hooks/use-industry-ai';
import { INDUSTRIES } from '@geovault/shared';
import { Bot, ArrowLeft, TrendingUp, ThumbsUp, ThumbsDown, Minus, MessageSquare, BarChart3, ExternalLink } from 'lucide-react';
import PublicNavbar from '@/components/layout/public-navbar';

const PLATFORM_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  CHATGPT: { label: 'ChatGPT', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  CLAUDE: { label: 'Claude', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  PERPLEXITY: { label: 'Perplexity', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  GEMINI: { label: 'Gemini', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  COPILOT: { label: 'Copilot', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
};

function SentimentIcon({ sentiment }: { sentiment: string | null }) {
  if (sentiment === 'positive') return <ThumbsUp className="h-4 w-4 text-green-500" />;
  if (sentiment === 'negative') return <ThumbsDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (sentiment === 'positive') return <Badge className="bg-green-100 text-green-700">正面</Badge>;
  if (sentiment === 'negative') return <Badge className="bg-red-100 text-red-700">負面</Badge>;
  return <Badge variant="outline" className="text-gray-500">中性</Badge>;
}

export default function BrandDetailClient({ params }: { params: { industry: string; siteId: string } }) {
  const { industry, siteId } = params;
  const { data, isLoading } = useBrandImpression(siteId);
  const { data: trend } = useCitationTrend(siteId, 12);

  const industryLabel = INDUSTRIES.find((i) => i.value === industry)?.label || industry;

  if (isLoading) {
    return (
      <>
        <PublicNavbar />
        <div className="max-w-5xl mx-auto px-4 py-12">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  const site = data?.site;
  const platforms = Object.keys(PLATFORM_CONFIG);

  return (
    <>
      <PublicNavbar />
      <div className="min-h-screen bg-gray-50">
        {/* Hero */}
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white py-12">
          <div className="max-w-5xl mx-auto px-4">
            <Link href={`/industry/${industry}`} className="text-indigo-200 hover:text-white text-sm flex items-center gap-1 mb-4">
              <ArrowLeft className="h-4 w-4" /> 回到{industryLabel}排行榜
            </Link>
            <div className="flex items-start justify-between">
              <div>
                <Badge className="bg-white/20 text-white mb-3">AI 品牌印象分析</Badge>
                <h1 className="text-3xl font-bold mb-2">{site?.name || '品牌'}</h1>
                <p className="text-indigo-200 text-sm">{site?.url}</p>
              </div>
              <div className="text-right">
                <p className="text-5xl font-bold">{data?.overallMentionRate || 0}%</p>
                <p className="text-indigo-200 text-sm">AI 引用率</p>
                <p className="text-xs text-indigo-300 mt-1">
                  {data?.mentionedCount || 0} / {data?.totalChecks || 0} 次被提及
                </p>
              </div>
            </div>

            <div className="flex gap-6 mt-6">
              <div className="bg-white/10 rounded-lg px-4 py-2">
                <p className="text-2xl font-bold">{site?.bestScore || 0}</p>
                <p className="text-xs text-indigo-200">GEO 分數</p>
              </div>
              <div className="bg-white/10 rounded-lg px-4 py-2">
                <p className="text-2xl font-bold capitalize">{site?.tier || '—'}</p>
                <p className="text-xs text-indigo-200">等級</p>
              </div>
              <div className="bg-white/10 rounded-lg px-4 py-2">
                <p className="text-2xl font-bold">{industryLabel}</p>
                <p className="text-xs text-indigo-200">產業</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          {/* 5 Platform Cards */}
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bot className="h-5 w-5" /> 5 大 AI 平台怎麼說
          </h2>

          {!data || Object.keys(data.byPlatform).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">尚無 AI 測試數據</p>
                <p className="text-sm mt-1">數據將在每週一自動更新</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {platforms.map((p) => {
                const config = PLATFORM_CONFIG[p];
                const results = data.byPlatform[p] || [];
                const mentioned = results.filter((r) => r.mentioned).length;
                const total = results.length;
                const rate = total > 0 ? Math.round((mentioned / total) * 100) : 0;
                const primaryResult = results.find((r) => r.mentioned) || results[0];

                return (
                  <Card key={p} className={`border ${config.bg}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className={`text-base ${config.color}`}>
                          {config.label}
                        </CardTitle>
                        <Badge className={rate > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                          {rate > 0 ? `${rate}% 引用` : '未提及'}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs">
                        {mentioned}/{total} 次測試被提及
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {primaryResult ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <SentimentIcon sentiment={primaryResult.sentiment} />
                            <SentimentBadge sentiment={primaryResult.sentiment} />
                          </div>
                          <p className="text-xs text-gray-500 italic">
                            問：{primaryResult.question}
                          </p>
                          <p className="text-sm text-gray-700 line-clamp-6">
                            {primaryResult.response?.startsWith('[Error]')
                              ? '無法取得回應'
                              : primaryResult.response?.slice(0, 300)}
                            {(primaryResult.response?.length || 0) > 300 && '...'}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">尚無測試結果</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Citation Trend */}
          {trend && trend.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" /> AI 引用趨勢
                </CardTitle>
                <CardDescription>每週 AI 引用率變化</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-32">
                  {trend.map((point, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-gray-500">{point.mentionRate}%</span>
                      <div
                        className="w-full bg-blue-500 rounded-t transition-all"
                        style={{ height: `${Math.max(4, point.mentionRate)}%` }}
                      />
                      <span className="text-[10px] text-gray-400">
                        {new Date(point.weekOf).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Link href={`/directory/${siteId}`}>
              <Button variant="outline">
                <BarChart3 className="h-4 w-4 mr-2" /> 查看 GEO 完整報告
              </Button>
            </Link>
            <Link href={site?.url || '#'} target="_blank">
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-2" /> 訪問官網
              </Button>
            </Link>
          </div>

          {/* Source */}
          <p className="text-xs text-gray-400 text-center py-4">
            資料來源：<Link href="https://geovault.app" className="text-blue-500 hover:underline">Geovault</Link> 平台 AI 搜尋測試數據
            · 更新週期：每週一 · 測試涵蓋 ChatGPT、Claude、Perplexity、Gemini、Copilot
          </p>
        </div>
      </div>
    </>
  );
}
