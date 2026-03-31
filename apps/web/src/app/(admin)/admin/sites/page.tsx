'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api-client';
import { Search, ExternalLink, RefreshCw, CheckCircle, ChevronLeft, ChevronRight, UserCheck, Star } from 'lucide-react';
import { toast } from 'sonner';

const TIER_COLORS: Record<string, string> = {
  platinum: 'bg-blue-500/20 text-blue-400',
  gold: 'bg-yellow-500/20 text-yellow-400',
  silver: 'bg-white/10 text-gray-300',
  bronze: 'bg-orange-500/20 text-orange-400',
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
    },
  });

  const allSites = data?.items || [];
  const sites = showClientOnly
    ? allSites.filter((s: any) => clientSiteIds.has(s.id))
    : allSites;
  const total = showClientOnly ? sites.length : (data?.total || 0);
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
