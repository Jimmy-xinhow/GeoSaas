'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api-client';
import { Globe, FileText, Users, Database, RefreshCw, Zap, BarChart3, Activity, Bot, Eye, Clock, AlertTriangle, ExternalLink } from 'lucide-react';
import { INDUSTRIES } from '@geovault/shared';

const INDUSTRY_LABEL: Record<string, string> = Object.fromEntries(
  INDUSTRIES.map((i) => [i.value, i.label]),
);

interface BotCount { bot: string; count: number; }
interface RealVisit {
  botName: string;
  botOrg: string;
  visitedAt: string;
  statusCode: number | null;
  site: { name: string; url: string };
}
interface CrawlerStats {
  total: number;
  real: number;
  real24h: number;
  real7d: number;
  realByBot: BotCount[];
  recentRealVisits: RealVisit[];
}
interface DashboardStats {
  sites: { total: number; public: number };
  articles: { total: number };
  users: { total: number };
  seeds: { total: number; scanned: number; pending: number; failed: number; isRunning: boolean };
  industries: { industry: string; count: number }[];
  crawler: CrawlerStats;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '剛才';
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

const botColors: Record<string, string> = {
  GPTBot: 'bg-green-500/20 text-green-400',
  ClaudeBot: 'bg-orange-500/20 text-orange-400',
  PerplexityBot: 'bg-blue-500/20 text-blue-400',
  'Google-Extended': 'bg-red-500/20 text-red-400',
  Bingbot: 'bg-cyan-500/20 text-cyan-400',
  CopilotBot: 'bg-purple-500/20 text-purple-400',
  Bytespider: 'bg-white/10 text-gray-300',
};

function ApiBalanceAlerts() {
  const [alerts, setAlerts] = useState<{ provider: string; message: string; url: string }[]>([]);

  useEffect(() => {
    // Check API health by making lightweight calls
    const checkApis = async () => {
      const issues: { provider: string; message: string; url: string }[] = [];
      try {
        const res = await apiClient.post('/news/generate?count=0');
        // If we get here, OpenAI is fine
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || '';
        if (msg.includes('429') || msg.includes('quota') || msg.includes('billing') || msg.includes('餘額')) {
          issues.push({ provider: 'OpenAI', message: 'GPT-4o API 額度不足', url: 'https://platform.openai.com/account/billing' });
        }
      }
      // Check recent reports for Claude errors
      try {
        const { data } = await apiClient.get('/client-reports/reports/cmn9128eo00pl8mq3391820gm');
        const reports = data || [];
        if (reports.length > 0) {
          const latest = reports[0];
          const results = latest.results || [];
          const claudeErrors = results.filter((r: any) => r.platform === 'CLAUDE' && r.response?.includes('[Error]'));
          if (claudeErrors.length > 0) {
            issues.push({ provider: 'Anthropic', message: `Claude API 額度不足（最近報告有 ${claudeErrors.length} 個 Claude 查詢失敗）`, url: 'https://console.anthropic.com/settings/billing' });
          }
        }
      } catch {}
      setAlerts(issues);
    };
    checkApis();
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div key={alert.provider} className="flex items-center justify-between p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-400">{alert.provider} API 需要加值</p>
              <p className="text-xs text-gray-400">{alert.message}</p>
            </div>
          </div>
          <a href={alert.url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              前往加值
            </Button>
          </a>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const { data: seedStats } = await apiClient.get('/admin/seed/status');

      setStats({
        sites: { total: seedStats?.sites?.public || 0, public: seedStats?.sites?.public || 0 },
        articles: { total: seedStats?.blogArticles || 0 },
        users: { total: seedStats?.users?.total || 0 },
        seeds: seedStats || { total: 0, scanned: 0, pending: 0, failed: 0, isRunning: false },
        industries: seedStats?.byIndustry || [],
        crawler: seedStats?.crawler || { total: 0, real: 0, real24h: 0, real7d: 0, realByBot: [], recentRealVisits: [] },
      });
    } catch (err) {
      // stats fetch failed — silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const handleAction = async (action: string, endpoint: string, method = 'post') => {
    setActionLoading(action);
    try {
      if (method === 'delete') {
        await apiClient.delete(endpoint);
      } else {
        await apiClient.post(endpoint);
      }
      await fetchStats();
    } catch (err) {
      // action failed — silent
    } finally {
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
      </div>
    );
  }

  const c = stats?.crawler;

  const statCards = [
    { label: '收錄品牌', value: stats?.seeds.scanned || 0, icon: Globe, color: 'text-blue-400' },
    { label: '文章數量', value: stats?.articles.total || 0, icon: FileText, color: 'text-green-400' },
    { label: 'Seed 總數', value: stats?.seeds.total || 0, icon: Database, color: 'text-purple-400' },
    { label: '產業數量', value: stats?.industries.length || 0, icon: BarChart3, color: 'text-orange-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">管理後台</h1>
          <p className="text-sm text-gray-400 mt-1">Geovault 系統總覽與操作中心</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchStats(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? '刷新中...' : '刷新'}
        </Button>
      </div>

      {/* API Balance Alerts */}
      <ApiBalanceAlerts />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">{s.label}</p>
                  <p className="text-2xl font-bold mt-1">{s.value}</p>
                </div>
                <s.icon className={`h-8 w-8 ${s.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Crawler Data: real visits only */}
      <Card className="border-2 border-blue-500/30 bg-white/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="h-5 w-5" /> AI 爬蟲數據總覽
            <Badge variant="outline" className="ml-2 text-xs">真實數據</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-500/20 rounded-lg border border-green-500/30">
              <Eye className="h-5 w-5 mx-auto mb-1 text-green-400" />
              <p className="text-2xl font-bold text-green-400">{c?.total || 0}</p>
              <p className="text-xs text-green-400 font-medium">真實爬蟲造訪</p>
            </div>
            <div className="text-center p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
              <Activity className="h-5 w-5 mx-auto mb-1 text-blue-400" />
              <p className="text-2xl font-bold text-blue-400">{c?.real24h || 0}</p>
              <p className="text-xs text-blue-400 font-medium">最近 24 小時</p>
            </div>
            <div className="text-center p-4 bg-emerald-500/20 rounded-lg border border-emerald-500/30">
              <BarChart3 className="h-5 w-5 mx-auto mb-1 text-emerald-400" />
              <p className="text-2xl font-bold text-emerald-400">{c?.real7d || 0}</p>
              <p className="text-xs text-emerald-400 font-medium">最近 7 天</p>
            </div>
          </div>

          {/* Time-based breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">時間區間分析</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="pb-2 text-gray-400">區間</th>
                    <th className="pb-2 text-green-400">真實造訪</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="py-2 font-medium">最近 24 小時</td>
                    <td className="py-2 text-green-400 font-bold">{c?.real24h || 0}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">最近 7 天</td>
                    <td className="py-2 text-green-400 font-bold">{c?.real7d || 0}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">全部</td>
                    <td className="py-2 text-green-400 font-bold">{c?.total || 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Bot breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-1">
              <Eye className="h-4 w-4" /> 真實爬蟲（依 Bot）
            </h3>
            {(c?.realByBot?.length || 0) > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {c?.realByBot.map((b) => (
                  <div key={b.bot} className="flex items-center justify-between p-2 bg-green-500/20 rounded text-sm">
                    <Badge className={botColors[b.bot] || 'bg-white/10 text-gray-300'} variant="secondary">
                      {b.bot}
                    </Badge>
                    <span className="font-bold text-green-400">{b.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 p-3 bg-white/5 rounded text-center">尚無真實爬蟲造訪</p>
            )}
          </div>

          {/* Recent REAL visits */}
          <div>
            <h3 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-1">
              <Clock className="h-4 w-4" /> 最近真實爬蟲造訪（最新 20 筆）
            </h3>
            {(c?.recentRealVisits?.length || 0) > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-gray-400">
                      <th className="pb-2">Bot</th>
                      <th className="pb-2">組織</th>
                      <th className="pb-2">網站</th>
                      <th className="pb-2">狀態</th>
                      <th className="pb-2">時間</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {c?.recentRealVisits.map((v, i) => (
                      <tr key={i} className="hover:bg-white/5">
                        <td className="py-2">
                          <Badge className={botColors[v.botName] || 'bg-white/10 text-gray-300'} variant="secondary">
                            {v.botName}
                          </Badge>
                        </td>
                        <td className="py-2 text-gray-400">{v.botOrg}</td>
                        <td className="py-2 font-medium truncate max-w-[200px]">{v.site?.name || '—'}</td>
                        <td className="py-2">
                          <Badge variant={v.statusCode === 200 ? 'default' : 'destructive'} className="text-xs">
                            {v.statusCode || '—'}
                          </Badge>
                        </td>
                        <td className="py-2 text-gray-400 text-xs">{timeAgo(v.visitedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 p-4 bg-white/5 rounded text-center">
                尚無真實爬蟲造訪紀錄。當真實 AI 爬蟲（GPTBot、ClaudeBot 等）造訪收錄的網站時，會顯示在此。
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Seed Status */}
      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5" /> Seed 掃描狀態
          </h2>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-blue-500/20 rounded-lg">
              <p className="text-2xl font-bold text-blue-400">{stats?.seeds.scanned}</p>
              <p className="text-xs text-gray-400">已掃描</p>
            </div>
            <div className="text-center p-3 bg-yellow-500/20 rounded-lg">
              <p className="text-2xl font-bold text-yellow-400">{stats?.seeds.pending}</p>
              <p className="text-xs text-gray-400">等待中</p>
            </div>
            <div className="text-center p-3 bg-red-500/20 rounded-lg">
              <p className="text-2xl font-bold text-red-400">{stats?.seeds.failed}</p>
              <p className="text-xs text-gray-400">失敗</p>
            </div>
            <div className="text-center p-3 bg-green-500/20 rounded-lg">
              <p className="text-2xl font-bold text-green-400">{stats?.seeds.isRunning ? '運行中' : '閒置'}</p>
              <p className="text-xs text-gray-400">爬蟲狀態</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5" /> 快速操作
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" disabled={!!actionLoading} onClick={() => handleAction('import', '/admin/seed/import', 'post')}>
              <Database className="h-5 w-5" />
              <span className="text-xs">{actionLoading === 'import' ? '匯入中...' : '匯入 CSV'}</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" disabled={!!actionLoading} onClick={() => handleAction('scan', '/admin/seed/run')}>
              <Globe className="h-5 w-5" />
              <span className="text-xs">{actionLoading === 'scan' ? '掃描中...' : '啟動掃描'}</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" disabled={!!actionLoading} onClick={() => handleAction('retry', '/admin/seed/retry-failed')}>
              <RefreshCw className="h-5 w-5" />
              <span className="text-xs">{actionLoading === 'retry' ? '重試中...' : '重試失敗'}</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" disabled={!!actionLoading} onClick={() => handleAction('bulk', '/blog/generate-bulk-templates')}>
              <FileText className="h-5 w-5" />
              <span className="text-xs">{actionLoading === 'bulk' ? '生成中...' : '批量生成文章'}</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1 text-red-400 hover:text-red-300" disabled={!!actionLoading} onClick={() => handleAction('audit', '/blog/quality-audit?threshold=85', 'delete')}>
              <BarChart3 className="h-5 w-5" />
              <span className="text-xs">{actionLoading === 'audit' ? '清理中...' : '品質審計 (85)'}</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" disabled={!!actionLoading} onClick={() => handleAction('insights', '/blog/insights/generate-all')}>
              <BarChart3 className="h-5 w-5" />
              <span className="text-xs">{actionLoading === 'insights' ? '生成中...' : '產業洞察報告'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Industry Distribution */}
      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold text-lg mb-4">產業分佈</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {stats?.industries
              .sort((a, b) => b.count - a.count)
              .map((ind) => (
                <div
                  key={ind.industry}
                  className="flex items-center justify-between p-2 bg-white/5 rounded text-sm"
                  title={ind.industry}
                >
                  <span className="text-gray-300 truncate">
                    {INDUSTRY_LABEL[ind.industry] ?? ind.industry}
                  </span>
                  <span className="font-mono font-bold text-white ml-2">{ind.count}</span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
