'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Play,
  RefreshCw,
  SearchCheck,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import apiClient from '@/lib/api-client';

type AutomationStatus = 'healthy' | 'warning' | 'critical';

interface AutomationRow {
  key: string;
  name: string;
  area: string;
  status: AutomationStatus;
  enabled: boolean;
  cronExpr: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult: string | null;
  evidence: string;
  action: string;
}

interface ArticleCrawlerVisit {
  slug: string;
  title: string;
  templateType: string;
  siteName: string | null;
  publishedAt: string;
  last24h: number;
  last7d: number;
  last30d: number;
  visitsPerDay30d: number;
  lastVisitAt: string | null;
  bots: Array<{ botName: string; botOrg: string; count: number }>;
}

interface AutomationHealth {
  generatedAt: string;
  summary: Record<AutomationStatus | 'total', number>;
  content: {
    clientDailyTotal: number;
    clientDailyPublished: number;
    clientDailyUnpublished: number;
    clientDailyRecent7d: number;
    clientDailyExpectedToday: number;
    clientDailyPublishedToday: number;
    qualityFailedAttempts7d: number;
    publicIndexableArticles: number;
    nonIndexablePublishedSamples: Array<{ slug: string; title: string; issues: string[] }>;
    legacyGeo: {
      generationEnabled: boolean;
      generationFrozen: boolean;
      publishedTotal: number;
      byTemplateType: Record<string, number>;
      qualityGatedPublished: number;
      shadowSampleSize: number;
      shadowFlagged: number;
      shadowIssueCounts: Record<string, number>;
      flaggedSamples: Array<{
        slug: string;
        title: string;
        templateType: string;
        issues: string[];
      }>;
      weeklyClientDailyProtected: boolean;
      replacement: {
        legacyPublishedTotal: number;
        legacyPublishedWithReplacement: number;
        legacyPublishedWithoutReplacement: number;
        replacementSiteCount: number;
        pendingSiteCount: number;
        aliasBackfillPending: number;
        demotionPending: number;
        automaticApplyEnabled: boolean;
        sample: Array<{
          siteId: string;
          siteName: string;
          replacementSlug: string;
          legacyCount: number;
          publishedLegacyCount: number;
          aliasesToAdd: string[];
        }>;
      };
    };
  };
  seed: {
    total: number;
    pending: number;
    failed: number;
    scanned: number;
    lowQualityPublicSeeds: number;
    publicScoreThreshold: number;
  };
  crawler: {
    real24h: number;
    real7d: number;
    article24h: number;
    article7d: number;
    article30d: number;
    articleTrackedArticles: number;
    articleWithVisits30d: number;
    topArticleVisits: ArticleCrawlerVisit[];
  };
  rows: AutomationRow[];
}

const STATUS_META: Record<AutomationStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  healthy: {
    label: '正常',
    className: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
    icon: CheckCircle2,
  },
  warning: {
    label: '需檢查',
    className: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
    icon: AlertTriangle,
  },
  critical: {
    label: '異常',
    className: 'border-red-400/30 bg-red-500/10 text-red-300',
    icon: XCircle,
  },
};

const QUICK_TASKS = [
  { key: 'client_daily_content', label: '執行客戶每日內容' },
  { key: 'auto_fill_qa', label: '執行 Q&A 補齊' },
  { key: 'indexnow_batch_submit', label: '執行 IndexNow 推送' },
];

const SHADOW_ISSUE_LABELS: Record<string, string> = {
  legacy_template_requires_replacement: '舊模板待替換',
  legacy_self_rating_language: '自評分數語句',
  legacy_missing_verifiable_source: '缺可核對來源',
  internal_ai_strategy_language: '內部 AI 策略語句',
  medical_claim_review_required: '醫療宣稱待審',
};

function formatDate(value: string | null) {
  if (!value) return '尚無';
  return new Date(value).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminContentAutomationPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'content-automation-health'],
    queryFn: async () => {
      const res = await apiClient.get<AutomationHealth>('/admin/scheduler/automation-health');
      return res.data;
    },
    refetchInterval: 30000,
  });

  const runTask = useMutation({
    mutationFn: (taskKey: string) => apiClient.post(`/admin/scheduler/tasks/${taskKey}/run`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'content-automation-health'] });
      queryClient.invalidateQueries({ queryKey: ['admin-scheduler'] });
    },
  });

  const quarantineSeeds = useMutation({
    mutationFn: () => apiClient.post('/admin/seed/quarantine-low-quality'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'content-automation-health'] });
      queryClient.invalidateQueries({ queryKey: ['admin-seeds'] });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
      </div>
    );
  }

  const summaryCards = [
    { label: '異常', value: data.summary.critical, className: 'text-red-300' },
    { label: '需檢查', value: data.summary.warning, className: 'text-amber-300' },
    { label: '正常', value: data.summary.healthy, className: 'text-emerald-300' },
    { label: '真實爬蟲 7 天', value: data.crawler.real7d, className: 'text-blue-300' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Activity className="h-6 w-6" />
            內容自動化健康
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            檢查內容生成、公開索引、IndexNow、Seed 與客戶每日文章是否真的有助於 GEO 收錄。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['admin', 'content-automation-health'] })}
          disabled={isFetching}
        >
          <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          重新檢查
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-sm text-gray-400">{item.label}</p>
              <p className={`mt-1 text-3xl font-bold ${item.className}`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">快速驗收操作</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {QUICK_TASKS.map((task) => (
            <Button
              key={task.key}
              variant="outline"
              className="min-h-11 justify-start"
              onClick={() => runTask.mutate(task.key)}
              disabled={runTask.isPending}
            >
              <Play className="mr-2 h-4 w-4" />
              {runTask.isPending && runTask.variables === task.key ? '執行中...' : task.label}
            </Button>
          ))}
          <Button
            variant="outline"
            className="min-h-11 justify-start border-amber-400/30 text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
            onClick={() => quarantineSeeds.mutate()}
            disabled={quarantineSeeds.isPending || data.seed.lowQualityPublicSeeds === 0}
          >
            <ShieldAlert className="mr-2 h-4 w-4" />
            {quarantineSeeds.isPending ? '隔離中...' : '隔離低品質 Seed'}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              客戶每日文章
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">總數</span><span>{data.content.clientDailyTotal}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">已公開</span><span className="text-emerald-300">{data.content.clientDailyPublished}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">未公開</span><span className="text-amber-300">{data.content.clientDailyUnpublished}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">近 7 天生成</span><span>{data.content.clientDailyRecent7d}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">今日應公開/已公開</span><span>{data.content.clientDailyExpectedToday}/{data.content.clientDailyPublishedToday}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                舊模板與影子稽核
              </span>
              <Badge
                variant="outline"
                className={data.content.legacyGeo.generationFrozen
                  ? 'border-emerald-400/30 text-emerald-300'
                  : 'border-amber-400/30 text-amber-300'}
              >
                {data.content.legacyGeo.generationFrozen ? '生成已凍結' : '生成已開啟'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">舊型公開文章</span><span>{data.content.legacyGeo.publishedTotal}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">品質管線公開文章</span><span className="text-emerald-300">{data.content.legacyGeo.qualityGatedPublished}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">最近抽樣需檢查</span><span className="text-amber-300">{data.content.legacyGeo.shadowFlagged}/{data.content.legacyGeo.shadowSampleSize}</span></div>
            <div className="border-t border-white/10 pt-3">
              <div className="mb-3 rounded-md border border-white/10 bg-white/[0.03] p-2 text-xs text-gray-300">
                自動替換：{data.content.legacyGeo.replacement.automaticApplyEnabled
                  ? '已開啟；排程會分批套用'
                  : '預演模式；先驗證 5 個網站後再開啟'}
              </div>
              <div className="flex justify-between"><span className="text-gray-400">已有新版品牌頁</span><span className="text-emerald-300">{data.content.legacyGeo.replacement.replacementSiteCount}</span></div>
              <div className="mt-2 flex justify-between"><span className="text-gray-400">可安全替換網站</span><span className="text-blue-300">{data.content.legacyGeo.replacement.pendingSiteCount}</span></div>
              <div className="mt-2 flex justify-between"><span className="text-gray-400">尚無新版的舊文章</span><span className="text-amber-300">{data.content.legacyGeo.replacement.legacyPublishedWithoutReplacement}</span></div>
              <div className="mt-2 flex justify-between"><span className="text-gray-400">待保留舊網址</span><span>{data.content.legacyGeo.replacement.aliasBackfillPending}</span></div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-2 text-xs text-gray-300">
              每週客戶文章：{data.content.legacyGeo.weeklyClientDailyProtected ? '獨立運作、不受凍結影響' : '需檢查'}
            </div>
            {Object.entries(data.content.legacyGeo.shadowIssueCounts).slice(0, 3).map(([issue, count]) => (
              <div key={issue} className="flex justify-between gap-3 text-xs">
                <span className="text-gray-500">{SHADOW_ISSUE_LABELS[issue] ?? issue}</span>
                <span>{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SearchCheck className="h-4 w-4" />
              公開索引品質
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">可索引公開文章</span><span className="text-emerald-300">{data.content.publicIndexableArticles}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">近 7 天失敗嘗試</span><span className="text-amber-300">{data.content.qualityFailedAttempts7d}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">公開但有阻擋樣本</span><span className="text-amber-300">{data.content.nonIndexablePublishedSamples.length}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4" />
              Seed 品質
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Seed 總數</span><span>{data.seed.total}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">已掃描</span><span>{data.seed.scanned}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">等待/失敗</span><span>{data.seed.pending}/{data.seed.failed}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">低分仍公開</span><span className="text-amber-300">{data.seed.lowQualityPublicSeeds}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            已發佈文章爬蟲頻率
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-gray-400">文章爬蟲 24h</p>
              <p className="mt-1 text-2xl font-semibold text-blue-300">{data.crawler.article24h}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-gray-400">文章爬蟲 7 天</p>
              <p className="mt-1 text-2xl font-semibold text-blue-300">{data.crawler.article7d}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-gray-400">文章爬蟲 30 天</p>
              <p className="mt-1 text-2xl font-semibold text-blue-300">{data.crawler.article30d}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-gray-400">追蹤文章</p>
              <p className="mt-1 text-2xl font-semibold text-white">{data.crawler.articleTrackedArticles}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-gray-400">30 天有造訪</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-300">{data.crawler.articleWithVisits30d}</p>
            </div>
          </div>

          {data.crawler.topArticleVisits.length === 0 ? (
            <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
              最近 30 天尚未記錄到公開文章頁面的真實 AI / 搜尋爬蟲造訪。請確認 sitemap、IndexNow、llms-full 與平台 middleware 回報是否持續正常。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="py-2 pr-4">文章</th>
                    <th className="py-2 pr-4">品牌</th>
                    <th className="py-2 pr-4">類型</th>
                    <th className="py-2 pr-4 text-right">24h</th>
                    <th className="py-2 pr-4 text-right">7 天</th>
                    <th className="py-2 pr-4 text-right">30 天</th>
                    <th className="py-2 pr-4">主要 bot</th>
                    <th className="py-2">最後造訪</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data.crawler.topArticleVisits.map((article) => (
                    <tr key={article.slug} className="align-top">
                      <td className="py-3 pr-4">
                        <a
                          href={`/blog/${article.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-blue-300 hover:underline"
                        >
                          {article.title}
                        </a>
                        <p className="mt-1 max-w-md truncate text-xs text-gray-500">{article.slug}</p>
                      </td>
                      <td className="py-3 pr-4 text-gray-300">{article.siteName || '平台內容'}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className="border-white/10 text-gray-300">
                          {article.templateType}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-right text-blue-200">{article.last24h}</td>
                      <td className="py-3 pr-4 text-right text-blue-200">{article.last7d}</td>
                      <td className="py-3 pr-4 text-right text-blue-200">{article.last30d}</td>
                      <td className="py-3 pr-4">
                        {article.bots.length === 0 ? (
                          <span className="text-gray-500">尚無</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {article.bots.slice(0, 3).map((bot) => (
                              <Badge key={bot.botName} variant="outline" className="border-white/10 text-gray-300">
                                {bot.botName} · {bot.count}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-gray-400">{formatDate(article.lastVisitAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">自動化狀態明細</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.rows.map((row) => {
            const meta = STATUS_META[row.status];
            const StatusIcon = meta.icon;
            return (
              <div key={row.key} className={`rounded-lg border p-4 ${meta.className}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusIcon className="h-4 w-4" />
                      <h3 className="font-semibold text-white">{row.name}</h3>
                      <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                      <Badge variant="outline" className="border-white/10 text-gray-300">{row.area}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-gray-200">{row.evidence}</p>
                    <p className="mt-1 text-xs text-gray-300">{row.action}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-300">
                      <span>Cron: {row.cronExpr}</span>
                      <span>上次: {formatDate(row.lastRunAt)}</span>
                      <span>下次: {formatDate(row.nextRunAt)}</span>
                    </div>
                  </div>
                  {row.area === 'scheduler' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11 shrink-0"
                      onClick={() => runTask.mutate(row.key)}
                      disabled={runTask.isPending}
                    >
                      <Play className="mr-1 h-4 w-4" />
                      {runTask.isPending && runTask.variables === row.key ? '執行中...' : '手動執行'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {data.content.nonIndexablePublishedSamples.length > 0 && (
        <Card className="border-amber-400/30 bg-amber-500/10">
          <CardHeader>
            <CardTitle className="text-base">公開但可能不利索引的文章樣本</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.content.nonIndexablePublishedSamples.map((article) => (
              <div key={article.slug} className="rounded-lg border border-amber-400/20 bg-black/10 p-3 text-sm">
                <p className="font-medium text-white">{article.title}</p>
                <p className="mt-1 text-xs text-amber-100/80">
                  {article.slug} · {article.issues.join('、')}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.content.legacyGeo.flaggedSamples.length > 0 && (
        <Card className="border-amber-400/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base">舊文章影子稽核待處理樣本</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm leading-6 text-gray-400">
              此清單只標記風險，不會直接中斷客戶每週文章。新版品牌頁完成後，系統才會先保留舊網址，再安全替換舊文章。
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-white/10 text-left text-xs text-gray-500">
                  <tr>
                    <th className="py-2 pr-4">文章</th>
                    <th className="py-2 pr-4">舊模板</th>
                    <th className="py-2">風險原因</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data.content.legacyGeo.flaggedSamples.map((article) => (
                    <tr key={article.slug} className="align-top">
                      <td className="py-3 pr-4">
                        <a
                          href={`/blog/${article.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-blue-300 hover:underline"
                        >
                          {article.title}
                        </a>
                        <p className="mt-1 max-w-md truncate text-xs text-gray-500">{article.slug}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className="border-white/10 text-gray-300">
                          {article.templateType}
                        </Badge>
                      </td>
                      <td className="py-3 text-amber-100/80">
                        {article.issues.map((issue) => SHADOW_ISSUE_LABELS[issue] ?? issue).join('、')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
