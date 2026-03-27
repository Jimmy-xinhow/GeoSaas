'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import apiClient from '@/lib/api-client';
import { Globe, FileText, Users, Database, RefreshCw, Zap, BarChart3, Activity } from 'lucide-react';

interface DashboardStats {
  sites: { total: number; public: number };
  articles: { total: number };
  users: { total: number };
  seeds: { total: number; scanned: number; pending: number; failed: number; isRunning: boolean };
  industries: { industry: string; count: number }[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const fetchStats = async () => {
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
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
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
        <Button variant="outline" size="sm" onClick={fetchStats}>
          <RefreshCw className="h-4 w-4 mr-1" /> 刷新
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
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1"
              disabled={!!actionLoading}
              onClick={() => handleAction('import', '/admin/seed/import', 'post')}
            >
              <Database className="h-5 w-5" />
              <span className="text-xs">{actionLoading === 'import' ? '匯入中...' : '匯入 CSV'}</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1"
              disabled={!!actionLoading}
              onClick={() => handleAction('scan', '/admin/seed/run')}
            >
              <Globe className="h-5 w-5" />
              <span className="text-xs">{actionLoading === 'scan' ? '掃描中...' : '啟動掃描'}</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1"
              disabled={!!actionLoading}
              onClick={() => handleAction('retry', '/admin/seed/retry-failed')}
            >
              <RefreshCw className="h-5 w-5" />
              <span className="text-xs">{actionLoading === 'retry' ? '重試中...' : '重試失敗'}</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1"
              disabled={!!actionLoading}
              onClick={() => handleAction('bulk', '/blog/generate-bulk-templates')}
            >
              <FileText className="h-5 w-5" />
              <span className="text-xs">{actionLoading === 'bulk' ? '生成中...' : '批量生成文章'}</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1 text-red-600 hover:text-red-700"
              disabled={!!actionLoading}
              onClick={() => handleAction('audit', '/blog/quality-audit?threshold=85', 'delete')}
            >
              <BarChart3 className="h-5 w-5" />
              <span className="text-xs">{actionLoading === 'audit' ? '清理中...' : '品質審計 (85)'}</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1"
              disabled={!!actionLoading}
              onClick={() => handleAction('insights', '/blog/insights/generate-all')}
            >
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
