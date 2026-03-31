'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api-client';
import { Trophy, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  approved: 'bg-green-500/20 text-green-400',
  rejected: 'bg-red-500/20 text-red-400',
};

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  perplexity: 'Perplexity',
  gemini: 'Gemini',
  other: '其他',
};

export default function AdminCasesPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-cases', page, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await apiClient.get(`/success-cases?${params}`);
      return data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/admin/success-cases/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-cases'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/admin/success-cases/${id}/reject`, { reason: '不符合收錄標準' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-cases'] }),
  });

  const cases = data?.items || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="h-6 w-6" /> 案例審核
        </h1>
        <p className="text-sm text-gray-400">審核用戶提交的 GEO 成功案例</p>
      </div>

      <div className="flex gap-2">
        {['pending', 'approved', 'rejected'].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setStatusFilter(s); setPage(1); }}
          >
            {s === 'pending' ? '待審核' : s === 'approved' ? '已通過' : '已拒絕'}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="text-left p-3 font-medium text-gray-400">標題</th>
                <th className="text-center p-3 font-medium text-gray-400">平台</th>
                <th className="text-center p-3 font-medium text-gray-400">分數變化</th>
                <th className="text-center p-3 font-medium text-gray-400">狀態</th>
                <th className="text-right p-3 font-medium text-gray-400">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">載入中...</td></tr>
              ) : cases.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">目前沒有{statusFilter === 'pending' ? '待審核' : ''}案例</td></tr>
              ) : (
                cases.map((c: any) => (
                  <tr key={c.id} className="hover:bg-white/5">
                    <td className="p-3">
                      <div className="font-medium">{c.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5 max-w-md truncate">{c.queryUsed}</div>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="secondary">{PLATFORM_LABELS[c.aiPlatform] || c.aiPlatform}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      {c.beforeGeoScore != null && c.afterGeoScore != null ? (
                        <span className="font-mono">{c.beforeGeoScore} → {c.afterGeoScore}</span>
                      ) : '-'}
                    </td>
                    <td className="p-3 text-center">
                      <Badge className={STATUS_COLORS[c.status]}>{c.status}</Badge>
                    </td>
                    <td className="p-3 text-right space-x-1">
                      {c.status === 'pending' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600"
                            onClick={() => approveMutation.mutate(c.id)}
                            disabled={approveMutation.isPending}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            onClick={() => rejectMutation.mutate(c.id)}
                            disabled={rejectMutation.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
