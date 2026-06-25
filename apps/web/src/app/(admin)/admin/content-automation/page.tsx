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
  { key: 'auto_fill_articles', label: '執行文章補齊' },
  { key: 'auto_fill_qa', label: '執行 Q&A 補齊' },
  { key: 'indexnow_batch_submit', label: '執行 IndexNow 推送' },
];

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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
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
    </div>
  );
}
