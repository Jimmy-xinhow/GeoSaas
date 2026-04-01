'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api-client';
import { useSites } from '@/hooks/use-sites';
import {
  Zap, Copy, CheckCircle2, Loader2, Globe, ChevronDown,
  ExternalLink, FileText, Hash,
} from 'lucide-react';
import { toast } from 'sonner';

const PLATFORM_ICONS: Record<string, string> = {
  medium: '📝',
  vocus: '✍️',
  linkedin: '💼',
  facebook: '📘',
  google_business: '📍',
  ptt: '🗣️',
};

const PLATFORM_COLORS: Record<string, string> = {
  medium: 'border-green-500/30 bg-green-500/5',
  vocus: 'border-blue-500/30 bg-blue-500/5',
  linkedin: 'border-cyan-500/30 bg-cyan-500/5',
  facebook: 'border-blue-600/30 bg-blue-600/5',
  google_business: 'border-yellow-500/30 bg-yellow-500/5',
  ptt: 'border-orange-500/30 bg-orange-500/5',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    setCopied(true);
    toast.success('已複製到剪貼簿');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={handleCopy}
      className="shrink-0"
    >
      {copied ? (
        <><CheckCircle2 className="h-3.5 w-3.5 text-green-400 mr-1" /> 已複製</>
      ) : (
        <><Copy className="h-3.5 w-3.5 mr-1" /> 複製全文</>
      )}
    </Button>
  );
}

export default function BrandSpreadPage() {
  const { data: sites, isLoading: sitesLoading } = useSites();
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const generateMutation = useMutation({
    mutationFn: async (siteId: string) => {
      const { data } = await apiClient.post(`/brand-spread/generate/${siteId}`);
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success(`已生成 ${data.platforms?.length || 0} 個平台的內容`);
    },
    onError: () => toast.error('生成失敗，請稍後再試'),
  });

  const weeklyMutation = useMutation({
    mutationFn: async (siteId: string) => {
      const { data } = await apiClient.post(`/brand-spread/weekly-plan/${siteId}`);
      return data;
    },
    onSuccess: (data) => {
      setWeeklyPlan(data);
      toast.success(`已生成本週 ${data.items?.length || 0} 篇內容`);
    },
    onError: () => toast.error('生成失敗，請稍後再試'),
  });

  const [weeklyPlan, setWeeklyPlan] = useState<any>(null);
  const selectedSite = sites?.find((s: any) => s.id === selectedSiteId);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="h-6 w-6 text-yellow-400" />
          品牌擴散
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          一鍵生成 6 大平台的品牌推薦內容，讓 AI 在多個來源看到你的品牌
        </p>
      </div>

      {/* Why this matters */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
        <p className="text-sm text-blue-300">
          <strong>為什麼需要品牌擴散？</strong> ChatGPT 和 Perplexity 在推薦品牌時，會參考多個不同平台的提及。
          只有自己網站提到自己是不夠的 — 你需要在 Medium、LinkedIn、Google 商家、社群等多個地方都有品牌資訊，AI 才會認為你是可信的。
        </p>
      </div>

      {/* Step 1: Select site */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-lg">Step 1 — 選擇網站</CardTitle>
        </CardHeader>
        <CardContent>
          {sitesLoading ? (
            <div className="h-10 bg-white/10 rounded animate-pulse" />
          ) : !sites || sites.length === 0 ? (
            <p className="text-gray-400 text-sm">尚未新增網站，請先到「我的網站」新增。</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sites.map((site: any) => (
                <button
                  key={site.id}
                  onClick={() => { setSelectedSiteId(site.id); setResult(null); }}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    selectedSiteId === site.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="font-medium text-white truncate">{site.name}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">{site.url}</p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Generate */}
      {selectedSiteId && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-lg">Step 2 — 生成多平台內容</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-400 mb-4">
              為 <strong className="text-white">{selectedSite?.name}</strong> 生成 6 大平台的品牌推薦文案。
              AI 會根據品牌資料和知識庫自動撰寫適合各平台風格的內容。
            </p>
            <Button
              onClick={() => generateMutation.mutate(selectedSiteId)}
              disabled={generateMutation.isPending}
              className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold"
            >
              {generateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> 生成中（約 1-2 分鐘）...</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" /> 一鍵生成 6 平台內容</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Results */}
      {result && result.platforms && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            Step 3 — 複製並發佈到各平台
            <Badge className="bg-green-500/20 text-green-400">{result.platforms.length} 個平台</Badge>
          </h2>
          <p className="text-sm text-gray-400">
            點擊各平台展開內容 → 複製全文 → 到對應平台貼上發佈。每發佈一個平台，你的品牌就多一個 AI 可以引用的來源。
          </p>

          {result.platforms.map((p: any) => {
            const isExpanded = expandedPlatform === p.platform;
            return (
              <div
                key={p.platform}
                className={`rounded-xl border overflow-hidden transition-all ${PLATFORM_COLORS[p.platform] || 'border-white/10 bg-white/5'}`}
              >
                {/* Header */}
                <button
                  onClick={() => setExpandedPlatform(isExpanded ? null : p.platform)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{PLATFORM_ICONS[p.platform] || '📄'}</span>
                    <div className="text-left">
                      <p className="font-semibold text-white">{p.title}</p>
                      <p className="text-xs text-gray-400">{p.characterCount} 字</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isExpanded && <CopyButton text={p.content} />}
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-white/5 p-4 space-y-3">
                    {/* Content */}
                    <div className="bg-black/20 rounded-xl p-4 max-h-[400px] overflow-y-auto">
                      <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                        {p.content}
                      </pre>
                    </div>

                    {/* Hashtags */}
                    {p.hashtags && p.hashtags.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Hash className="h-3.5 w-3.5 text-gray-500" />
                        {p.hashtags.map((tag: string) => (
                          <span key={tag} className="text-xs px-2 py-0.5 bg-white/10 rounded-full text-gray-400">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2">
                      <CopyButton text={p.content} />
                      <CopyButton text={p.hashtags?.map((t: string) => `#${t}`).join(' ') || ''} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Weekly Content Plan */}
      {selectedSiteId && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              📅 每週內容排程
              <Badge className="bg-purple-500/20 text-purple-400 text-xs font-normal">持續經營</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-400">
              根據 <strong className="text-white">{selectedSite?.name}</strong> 的產業和品牌特性，
              AI 會自動生成本週應該發佈的內容。每週 2 種類型 × 多平台 = 4-6 篇新內容。
            </p>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => weeklyMutation.mutate(selectedSiteId)}
                disabled={weeklyMutation.isPending}
                className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white"
              >
                {weeklyMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> 生成本週內容中...</>
                ) : (
                  <><FileText className="h-4 w-4 mr-2" /> 生成本週排程</>
                )}
              </Button>
              <span className="text-xs text-gray-500">每週一 07:00 自動生成（客戶站點）</span>
            </div>

            {weeklyPlan && weeklyPlan.items && (
              <div className="space-y-3 mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">
                    本週內容（{weeklyPlan.weekOf}）— {weeklyPlan.items.length} 篇
                  </p>
                </div>

                {weeklyPlan.items.map((item: any, idx: number) => (
                  <div key={idx} className={`rounded-xl border overflow-hidden ${PLATFORM_COLORS[item.platform] || 'border-white/10 bg-white/5'}`}>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{PLATFORM_ICONS[item.platform] || '📄'}</span>
                          <div>
                            <p className="font-medium text-white text-sm">{item.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className="bg-white/10 text-gray-400 text-[10px]">{item.name}</Badge>
                              <span className="text-[10px] text-gray-500">{item.platform}</span>
                            </div>
                          </div>
                        </div>
                        <CopyButton text={item.content} />
                      </div>
                      <div className="bg-black/20 rounded-lg p-3 max-h-[200px] overflow-y-auto mt-2">
                        <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                          {item.content}
                        </pre>
                      </div>
                      {item.hashtags?.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {item.hashtags.map((tag: string) => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-white/10 rounded-full text-gray-400">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
