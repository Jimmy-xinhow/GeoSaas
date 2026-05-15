'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api-client';
import { Search, ExternalLink, RefreshCw, CheckCircle, ChevronLeft, ChevronRight, UserCheck, Star, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const TIER_COLORS: Record<string, string> = {
  platinum: 'bg-blue-500/20 text-blue-400',
  gold: 'bg-yellow-500/20 text-yellow-400',
  silver: 'bg-white/10 text-gray-300',
  bronze: 'bg-orange-500/20 text-orange-400',
};

const MISSING_FACT_LABELS: Record<string, string> = {
  location: '地點',
  services: '服務',
  positioning: '品牌定位',
  contact: '聯絡方式',
  targetAudiences: '目標受眾',
  notFor: '不適合對象',
  qaPairs: '至少 6 組 Q&A',
  socialLinks: '社群連結',
};

export default function AdminSitesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [showClientOnly, setShowClientOnly] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-sites', page, search, industry],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (industry) params.set('industry', industry);
      const { data } = await apiClient.get(`/directory?${params}`);
      return data;
    },
  });

  // Fetch client sites list
  const { data: clientSites } = useQuery({
    queryKey: ['admin-client-sites'],
    queryFn: async () => {
      const { data } = await apiClient.get('/sites/admin/client-sites');
      return data as any[];
    },
  });

  const { data: readiness } = useQuery({
    queryKey: ['admin-client-daily-readiness'],
    queryFn: async () => {
      const { data } = await apiClient.get('/blog/client-daily/readiness');
      return data as {
        totalClients: number;
        ready: number;
        notReady: number;
        rows: Array<{
          siteId: string;
          name: string;
          industry: string | null;
          url: string;
          ready: boolean;
          confidenceScore: number;
          verifiedFactsCount: number;
          missingFacts: string[];
        }>;
      };
    },
  });

  const clientSiteIds = new Set((clientSites || []).map((s: any) => s.id));

  const scanMutation = useMutation({
    mutationFn: (siteId: string) => apiClient.post(`/sites/${siteId}/scans`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-sites'] }),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ siteId, isVerified }: { siteId: string; isVerified: boolean }) =>
      apiClient.patch(`/admin/sites/${siteId}/verify`, { isVerified }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-sites'] }),
  });

  const clientMutation = useMutation({
    mutationFn: ({ siteId, isClient }: { siteId: string; isClient: boolean }) =>
      apiClient.patch(`/sites/admin/${siteId}/toggle-client`, { isClient }),
    onSuccess: (_, vars) => {
      toast.success(vars.isClient ? '已標註為客戶' : '已取消客戶標註');
      queryClient.invalidateQueries({ queryKey: ['admin-sites'] });
      queryClient.invalidateQueries({ queryKey: ['admin-client-sites'] });
      queryClient.invalidateQueries({ queryKey: ['admin-client-daily-readiness'] });
    },
  });

  const allSites = data?.items || [];
  const sites = showClientOnly
    ? (clientSites || [])
    : allSites;
  const total = showClientOnly ? (clientSites || []).length : (data?.total || 0);
  const totalPages = showClientOnly ? 1 : Math.ceil((data?.total || 0) / 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">網站管理</h1>
          <p className="text-sm text-gray-400">管理所有收錄的網站、標註客戶、觸發掃描</p>
        </div>
        {clientSites && clientSites.length > 0 && (
          <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
            <Star className="h-4 w-4 text-yellow-400" />
            <span className="text-sm text-yellow-300">已標註 {clientSites.length} 個客戶</span>
          </div>
        )}
      </div>

      {readiness && readiness.totalClients > 0 && (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  每日 AI Wiki 產文就緒度
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  自動產文啟用前必須完成品牌 facts。未完成的 client 不會產生空泛文章。
                </p>
              </div>
              <div className="flex gap-2">
                <Badge className="bg-green-500/20 text-green-300">Ready {readiness.ready}</Badge>
                <Badge className="bg-yellow-500/20 text-yellow-300">Blocked {readiness.notReady}</Badge>
              </div>
            </div>

            <div className="grid gap-3">
              {readiness.rows.map((row) => (
                <div
                  key={row.siteId}
                  className={`rounded-lg border p-3 ${row.ready ? 'border-green-500/20 bg-green-500/5' : 'border-yellow-500/20 bg-yellow-500/5'}`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-white">{row.name}</p>
                        <Badge variant="outline" className={row.ready ? 'border-green-500/40 text-green-300' : 'border-yellow-500/40 text-yellow-200'}>
                          {row.ready ? '可啟用' : '資料未完成'}
                        </Badge>
                        <span className="text-xs text-gray-400">Confidence {row.confidenceScore}</span>
                        <span className="text-xs text-gray-400">Facts {row.verifiedFactsCount}</span>
                      </div>
                      <a href={row.url} target="_blank" rel="noopener" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
                        {row.url.replace(/^https?:\/\//, '').slice(0, 48)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    {!row.ready && (
                      <div className="flex max-w-xl flex-wrap gap-1.5">
                        {row.missingFacts.map((fact) => (
                          <Badge key={`${row.siteId}-${fact}`} variant="outline" className="border-yellow-500/30 text-yellow-100">
                            {MISSING_FACT_LABELS[fact] || fact}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="搜尋品牌名稱..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Input
          placeholder="篩選產業..."
          className="max-w-[200px]"
          value={industry}
          onChange={(e) => { setIndustry(e.target.value); setPage(1); }}
        />
        <Button
          variant={showClientOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowClientOnly(!showClientOnly)}
          className={showClientOnly ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : ''}
        >
          <UserCheck className="h-4 w-4 mr-1" />
          {showClientOnly ? '顯示全部' : '只看客戶'}
        </Button>
      </div>

      <p className="text-sm text-gray-400">
        {showClientOnly ? `客戶站點：${sites.length} 個` : `共 ${data?.total || 0} 個網站`}
      </p>

      {/* Table */}
      <Card className="bg-white/5 border-white/10">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-400">品牌</th>
                  <th className="text-left p-3 font-medium text-gray-400">產業</th>
                  <th className="text-center p-3 font-medium text-gray-400">分數</th>
                  <th className="text-center p-3 font-medium text-gray-400">等級</th>
                  <th className="text-center p-3 font-medium text-gray-400">客戶</th>
                  <th className="text-center p-3 font-medium text-gray-400">驗證</th>
                  <th className="text-right p-3 font-medium text-gray-400">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400">載入中...</td></tr>
                ) : sites.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400">無結果</td></tr>
                ) : (
                  sites.map((site: any) => {
                    const isClient = clientSiteIds.has(site.id);
                    return (
                      <tr key={site.id} className={`hover:bg-white/5 ${isClient ? 'bg-yellow-500/5' : ''}`}>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {isClient && <Star className="h-3.5 w-3.5 text-yellow-400 shrink-0" />}
                            <div>
                              <div className="font-medium text-white">{site.name}</div>
                              <a href={site.url} target="_blank" rel="noopener" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                                {site.url?.replace(/^https?:\/\//, '').slice(0, 35)}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="secondary" className="text-xs">{site.industry || '未分類'}</Badge>
                        </td>
                        <td className="p-3 text-center">
                          <span className="font-mono font-bold text-lg">{site.bestScore}</span>
                        </td>
                        <td className="p-3 text-center">
                          {site.tier ? (
                            <Badge className={TIER_COLORS[site.tier] || 'bg-white/10'}>{site.tier}</Badge>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => clientMutation.mutate({ siteId: site.id, isClient: !isClient })}
                            disabled={clientMutation.isPending}
                            title={isClient ? '取消客戶標註' : '標註為客戶'}
                          >
                            <UserCheck className={`h-4 w-4 ${isClient ? 'text-yellow-400' : 'text-gray-600'}`} />
                          </Button>
                        </td>
                        <td className="p-3 text-center">
                          {site.isVerified ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className="p-3 text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => scanMutation.mutate(site.id)}
                            disabled={scanMutation.isPending}
                            title="觸發掃描"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => verifyMutation.mutate({ siteId: site.id, isVerified: !site.isVerified })}
                            title={site.isVerified ? '取消驗證' : '驗證'}
                          >
                            <CheckCircle className={`h-3.5 w-3.5 ${site.isVerified ? 'text-green-500' : 'text-gray-500'}`} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!showClientOnly && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
