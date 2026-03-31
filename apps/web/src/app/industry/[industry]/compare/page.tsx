'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useIndustryAiSites, useBrandComparison, useRunComparison } from '@/hooks/use-industry-ai';
import { INDUSTRIES } from '@geovault/shared';
import { ArrowLeft, ArrowLeftRight, Bot, Zap, Loader2 } from 'lucide-react';
import PublicNavbar from '@/components/layout/public-navbar';

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  CHATGPT: { label: 'ChatGPT', color: 'bg-green-100 text-green-700' },
  CLAUDE: { label: 'Claude', color: 'bg-orange-100 text-orange-700' },
  PERPLEXITY: { label: 'Perplexity', color: 'bg-blue-100 text-blue-700' },
  GEMINI: { label: 'Gemini', color: 'bg-red-100 text-red-700' },
  COPILOT: { label: 'Copilot', color: 'bg-purple-100 text-purple-700' },
};

export default function ComparePage({ params }: { params: { industry: string } }) {
  const { industry } = params;
  const [siteAId, setSiteAId] = useState('');
  const [siteBId, setSiteBId] = useState('');
  const { data: sites } = useIndustryAiSites(industry);
  const { data: comparison, isLoading: loadingComparison, refetch } = useBrandComparison(industry, siteAId, siteBId);
  const runMutation = useRunComparison();

  const industryLabel = INDUSTRIES.find((i) => i.value === industry)?.label || industry;

  const handleCompare = async () => {
    if (!siteAId || !siteBId) return;
    try {
      await runMutation.mutateAsync({ industry, siteAId, siteBId });
      refetch();
    } catch (err) {
      console.error('Comparison failed:', err);
    }
  };

  return (
    <>
      <PublicNavbar />
      <div className="min-h-screen bg-gray-50">
        {/* Hero */}
        <div className="bg-gradient-to-br from-purple-600 to-pink-600 text-white py-12">
          <div className="max-w-5xl mx-auto px-4">
            <Link href={`/industry/${industry}`} className="text-purple-200 hover:text-white text-sm flex items-center gap-1 mb-4">
              <ArrowLeft className="h-4 w-4" /> 回到{industryLabel}排行榜
            </Link>
            <Badge className="bg-white/20 text-white mb-3">品牌 vs 品牌</Badge>
            <h1 className="text-3xl font-bold mb-2">
              {industryLabel}品牌 AI 推薦對比
            </h1>
            <p className="text-purple-200">
              選擇兩個品牌，看看 5 大 AI 平台更推薦誰
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          {/* Brand Selector */}
          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium mb-2">品牌 A</label>
                  <select
                    value={siteAId}
                    onChange={(e) => setSiteAId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">選擇品牌...</option>
                    {sites?.filter((s) => s.id !== siteBId).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.bestScore}分)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-center">
                  <ArrowLeftRight className="h-6 w-6 text-gray-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">品牌 B</label>
                  <select
                    value={siteBId}
                    onChange={(e) => setSiteBId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">選擇品牌...</option>
                    {sites?.filter((s) => s.id !== siteAId).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.bestScore}分)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="text-center mt-4">
                <Button
                  onClick={handleCompare}
                  disabled={!siteAId || !siteBId || runMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {runMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> AI 比較中...</>
                  ) : (
                    <><Zap className="h-4 w-4 mr-2" /> 開始 AI 對比</>
                  )}
                </Button>
                {runMutation.isPending && (
                  <p className="text-xs text-gray-500 mt-2">正在詢問 5 個 AI 平台，約需 15 秒...</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Comparison Results */}
          {loadingComparison && siteAId && siteBId && (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          )}

          {comparison && comparison.siteA && comparison.siteB && (
            <>
              {/* Score Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>基本數據對比</CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-center">
                        <th className="pb-3 text-left">指標</th>
                        <th className="pb-3 text-blue-600">{comparison.siteA.name}</th>
                        <th className="pb-3 text-purple-600">{comparison.siteB.name}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className="py-3 font-medium">GEO 分數</td>
                        <td className="py-3 text-center">
                          <span className={`font-bold text-lg ${comparison.siteA.bestScore >= comparison.siteB.bestScore ? 'text-green-600' : 'text-gray-600'}`}>
                            {comparison.siteA.bestScore}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          <span className={`font-bold text-lg ${comparison.siteB.bestScore >= comparison.siteA.bestScore ? 'text-green-600' : 'text-gray-600'}`}>
                            {comparison.siteB.bestScore}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 font-medium">AI 引用率</td>
                        <td className="py-3 text-center">
                          <Badge className={comparison.siteA.mentionRate >= comparison.siteB.mentionRate ? 'bg-green-100 text-green-700' : 'bg-gray-100'}>
                            {comparison.siteA.mentionRate}%
                          </Badge>
                        </td>
                        <td className="py-3 text-center">
                          <Badge className={comparison.siteB.mentionRate >= comparison.siteA.mentionRate ? 'bg-green-100 text-green-700' : 'bg-gray-100'}>
                            {comparison.siteB.mentionRate}%
                          </Badge>
                        </td>
                      </tr>
                      {Object.keys(PLATFORM_CONFIG).map((p) => {
                        const rateA = (comparison.siteA.byPlatform as any)?.[p]?.rate || 0;
                        const rateB = (comparison.siteB.byPlatform as any)?.[p]?.rate || 0;
                        return (
                          <tr key={p}>
                            <td className="py-3">
                              <Badge variant="outline" className="text-xs">
                                {PLATFORM_CONFIG[p]?.label}
                              </Badge>
                            </td>
                            <td className={`py-3 text-center font-medium ${rateA >= rateB ? 'text-green-600' : 'text-gray-500'}`}>
                              {rateA}%
                            </td>
                            <td className={`py-3 text-center font-medium ${rateB >= rateA ? 'text-green-600' : 'text-gray-500'}`}>
                              {rateB}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* AI Direct Comparison Responses */}
              {comparison.comparisons.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Bot className="h-5 w-5" /> AI 直接比較回應
                  </h2>
                  {comparison.comparisons.map((c) => {
                    const config = PLATFORM_CONFIG[c.platform] || { label: c.platform, color: 'bg-gray-100 text-gray-700' };
                    return (
                      <Card key={c.platform}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Badge className={config.color}>{config.label}</Badge>
                          </CardTitle>
                          <CardDescription className="text-xs">{c.question}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-700 whitespace-pre-line">
                            {c.response?.startsWith('[Error]') ? '無法取得回應' : c.response}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Source */}
          <p className="text-xs text-gray-400 text-center py-4">
            資料來源：<Link href="https://geovault.app" className="text-blue-500 hover:underline">Geovault</Link> 平台 AI 搜尋測試數據
          </p>
        </div>
      </div>
    </>
  );
}
