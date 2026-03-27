'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api-client';
import { Search, ExternalLink, RefreshCw, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';

const TIER_COLORS: Record<string, string> = {
  platinum: 'bg-blue-100 text-blue-700',
  gold: 'bg-yellow-100 text-yellow-700',
  silver: 'bg-gray-100 text-gray-700',
  bronze: 'bg-orange-100 text-orange-700',
};

export default function AdminSitesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
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

  const scanMutation = useMutation({
    mutationFn: (siteId: string) => apiClient.post(`/sites/${siteId}/scans`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-sites'] }),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ siteId, isVerified }: { siteId: string; isVerified: boolean }) =>
      apiClient.patch(`/admin/sites/${siteId}/verify`, { isVerified }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-sites'] }),
  });

  const sites = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">網站管理</h1>
        <p className="text-sm text-gray-500">管理所有收錄的網站、觸發掃描、驗證</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
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
      </div>

      {/* Stats */}
      <p className="text-sm text-gray-500">共 {total} 個網站</p>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600">品牌</th>
                  <th className="text-left p-3 font-medium text-gray-600">產業</th>
                  <th className="text-center p-3 font-medium text-gray-600">分數</th>
                  <th className="text-center p-3 font-medium text-gray-600">等級</th>
                  <th className="text-center p-3 font-medium text-gray-600">驗證</th>
                  <th className="text-right p-3 font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400">載入中...</td></tr>
                ) : sites.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400">無結果</td></tr>
                ) : (
                  sites.map((site: any) => (
                    <tr key={site.id} className="hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-medium text-gray-900">{site.name}</div>
                        <a href={site.url} target="_blank" rel="noopener" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                          {site.url?.replace(/^https?:\/\//, '').slice(0, 40)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                      <td className="p-3">
                        <Badge variant="secondary" className="text-xs">{site.industry || '未分類'}</Badge>
                      </td>
                      <td className="p-3 text-center">
                        <span className="font-mono font-bold text-lg">{site.bestScore}</span>
                      </td>
                      <td className="p-3 text-center">
                        {site.tier ? (
                          <Badge className={TIER_COLORS[site.tier] || 'bg-gray-100'}>{site.tier}</Badge>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {site.isVerified ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="p-3 text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => scanMutation.mutate(site.id)}
                          disabled={scanMutation.isPending}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => verifyMutation.mutate({ siteId: site.id, isVerified: !site.isVerified })}
                        >
                          <CheckCircle className={`h-3.5 w-3.5 ${site.isVerified ? 'text-green-500' : 'text-gray-300'}`} />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
