'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api-client';
import { Globe, FileText, Users, Database, RefreshCw, Zap, BarChart3, Activity, Bot, Eye, EyeOff, Clock } from 'lucide-react';

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
  seeded: number;
  real24h: number;
  seeded24h: number;
  real7d: number;
  seeded7d: number;
  realByBot: BotCount[];
  seededByBot: BotCount[];
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
  GPTBot: 'bg-green-100 text-green-700',
  ClaudeBot: 'bg-orange-100 text-orange-700',
  PerplexityBot: 'bg-blue-100 text-blue-700',
  'Google-Extended': 'bg-red-100 text-red-700',
  Bingbot: 'bg-cyan-100 text-cyan-700',
  CopilotBot: 'bg-purple-100 text-purple-700',
  Bytespider: 'bg-gray-100 text-gray-700',
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [dirRes, articleRes, seedRes] = await Promise.all([
        apiClient.get('/directory?limit=1'),
        apiClient.get('/blog/articles?limit=1'),
        apiClient.get('/admin/seed/status'),
      ]);

      setStats({
        sites: { total: dirRes.data?.total || 0, public: dirRes.data?.total || 0 },
        articles: { total: articleRes.data?.total || 0 },
        users: { total: 0 },
        seeds: seedRes.data || { total: 0, scanned: 0, pending: 0, failed: 0, isRunning: false },
        industries: seedRes.data?.byIndustry || [],
        crawler: seedRes.data?.crawler || { total: 0, real: 0, seeded: 0, real24h: 0, seeded24h: 0, real7d: 0, seeded7d: 0, realByBot: [], seededByBot: [], recentRealVisits: [] },
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
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
      console.error(`Action ${action} failed:`, err);
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
  const realPercent = c && c.total > 0 ? Math.round((c.real / c.total) * 100) : 0;

  const statCards = [
    { label: '收錄品牌', value: stats?.seeds.scanned || 0, icon: Globe, color: 'text-blue-600' },
    { label: '文章數量', value: stats?.articles.total || 0, icon: FileText, color: 'text-green-600' },
    { label: 'Seed 總數', value: stats?.seeds.total || 0, icon: Database, color: 'text-purple-600' },
    { label: '產業數量', value: stats?.industries.length || 0, icon: BarChart3, color: 'text-orange-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">管理後台</h1>
          <p className="text-sm text-gray-500 mt-1">Geovault 系統總覽與操作中心</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchStats(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? '刷新中...' : '刷新'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{s.label}</p>
                  <p className="text-2xl font-bold mt-1">{s.value}</p>
                </div>
                <s.icon className={`h-8 w-8 ${s.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ═══ Crawler Data: Real vs Simulated ═══ */}
      <Card className="border-2 border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="h-5 w-5" /> AI 爬蟲數據總覽
            <Badge variant="outline" className="ml-2 text-xs">真實 vs 模擬</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <Eye className="h-5 w-5 mx-auto mb-1 text-green-600" />
              <p className="text-2xl font-bold text-green-700">{c?.real || 0}</p>
              <p className="text-xs text-green-600 font-medium">真實爬蟲造訪</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
              <EyeOff className="h-5 w-5 mx-auto mb-1 text-gray-500" />
              <p className="text-2xl font-bold text-gray-600">{c?.seeded || 0}</p>
              <p className="text-xs text-gray-500 font-medium">模擬爬蟲數據</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              <Activity className="h-5 w-5 mx-auto mb-1 text-blue-600" />
              <p className="text-2xl font-bold text-blue-700">{c?.total || 0}</p>
              <p className="text-xs text-blue-600 font-medium">總計造訪</p>
            </div>
            <div className="text-center p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <BarChart3 className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
              <p className="text-2xl font-bold text-emerald-700">{realPercent}%</p>
              <p className="text-xs text-emerald-600 font-medium">真實數據佔比</p>
            </div>
          </div>

          {/* Time-based breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">時間區間分析</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 text-gray-500">區間</th>
                    <th className="pb-2 text-green-600">真實</th>
                    <th className="pb-2 text-gray-500">模擬</th>
                    <th className="pb-2 text-blue-600">合計</th>
                    <th className="pb-2 text-emerald-600">真實佔比</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="py-2 font-medium">最近 24 小時</td>
                    <td className="py-2 text-green-700 font-bold">{c?.real24h || 0}</td>
                    <td className="py-2 text-gray-500">{c?.seeded24h || 0}</td>
                    <td className="py-2 font-semibold">{(c?.real24h || 0) + (c?.seeded24h || 0)}</td>
                    <td className="py-2">
                      {c && (c.real24h + c.seeded24h) > 0
                        ? <span className={c.real24h > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}>{Math.round(c.real24h / (c.real24h + c.seeded24h) * 100)}%</span>
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">最近 7 天</td>
                    <td className="py-2 text-green-700 font-bold">{c?.real7d || 0}</td>
                    <td className="py-2 text-gray-500">{c?.seeded7d || 0}</td>
                    <td className="py-2 font-semibold">{(c?.real7d || 0) + (c?.seeded7d || 0)}</td>
                    <td className="py-2">
                      {c && (c.real7d + c.seeded7d) > 0
                        ? <span className={c.real7d > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}>{Math.round(c.real7d / (c.real7d + c.seeded7d) * 100)}%</span>
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">全部</td>
                    <td className="py-2 text-green-700 font-bold">{c?.real || 0}</td>
                    <td className="py-2 text-gray-500">{c?.seeded || 0}</td>
                    <td className="py-2 font-semibold">{c?.total || 0}</td>
                    <td className="py-2">
                      <span className={realPercent > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}>{realPercent}%</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Bot breakdown side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-1">
                <Eye className="h-4 w-4" /> 真實爬蟲（依 Bot）
              </h3>
              {(c?.realByBot?.length || 0) > 0 ? (
                <div className="space-y-1">
                  {c?.realByBot.map((b) => (
                    <div key={b.bot} className="flex items-center justify-between p-2 bg-green-50 rounded text-sm">
                      <Badge className={botColors[b.bot] || 'bg-gray-100 text-gray-700'} variant="secondary">
                        {b.bot}
                      </Badge>
                      <span className="font-bold text-green-700">{b.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 p-3 bg-gray-50 rounded text-center">尚無真實爬蟲造訪</p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1">
                <EyeOff className="h-4 w-4" /> 模擬爬蟲（依 Bot）
              </h3>
              {(c?.seededByBot?.length || 0) > 0 ? (
                <div className="space-y-1">
                  {c?.seededByBot.map((b) => (
                    <div key={b.bot} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <Badge variant="outline" className="text-gray-500">
                        {b.bot}
                      </Badge>
                      <span className="font-mono text-gray-500">{b.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 p-3 bg-gray-50 rounded text-center">尚無模擬數據</p>
              )}
            </div>
          </div>

          {/* Recent REAL visits */}
          <div>
            <h3 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-1">
              <Clock className="h-4 w-4" /> 最近真實爬蟲造訪（最新 20 筆）
            </h3>
            {(c?.recentRealVisits?.length || 0) > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2">Bot</th>
                      <th className="pb-2">組織</th>
                      <th className="pb-2">網站</th>
                      <th className="pb-2">狀態</th>
                      <th className="pb-2">時間</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {c?.recentRealVisits.map((v, i) => (
                      <tr key={i} className="hover:bg-green-50">
                        <td className="py-2">
                          <Badge className={botColors[v.botName] || 'bg-gray-100 text-gray-700'} variant="secondary">
                            {v.botName}
                          </Badge>
                        </td>
                        <td className="py-2 text-gray-600">{v.botOrg}</td>
                        <td className="py-2 font-medium truncate max-w-[200px]">{v.site?.name || '—'}</td>
                        <td className="py-2">
                          <Badge variant={v.statusCode === 200 ? 'default' : 'destructive'} className="text-xs">
                            {v.statusCode || '—'}
                          </Badge>
                        </td>
                        <td className="py-2 text-gray-500 text-xs">{timeAgo(v.visitedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 p-4 bg-gray-50 rounded text-center">
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
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{stats?.seeds.scanned}</p>
              <p className="text-xs text-gray-500">已掃描</p>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <p className="text-2xl font-bold text-yellow-600">{stats?.seeds.pending}</p>
              <p className="text-xs text-gray-500">等待中</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">{stats?.seeds.failed}</p>
              <p className="text-xs text-gray-500">失敗</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{stats?.seeds.isRunning ? '運行中' : '閒置'}</p>
              <p className="text-xs text-gray-500">爬蟲狀態</p>
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
            <Button variant="outline" className="h-auto py-3 flex-col gap-1 text-red-600 hover:text-red-700" disabled={!!actionLoading} onClick={() => handleAction('audit', '/blog/quality-audit?threshold=85', 'delete')}>
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
                <div key={ind.industry} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                  <span className="text-gray-700 truncate">{ind.industry}</span>
                  <span className="font-mono font-bold text-gray-900 ml-2">{ind.count}</span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
