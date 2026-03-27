'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api-client';
import { Database, Play, RefreshCw, Upload, AlertCircle } from 'lucide-react';

export default function AdminSeedsPage() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ['admin-seeds'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/seed/status');
      return data;
    },
    refetchInterval: 5000,
  });

  const { data: failed } = useQuery({
    queryKey: ['admin-seeds-failed'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/seed/failed');
      return data;
    },
  });

  const importCsv = useMutation({
    mutationFn: () => apiClient.post('/admin/seed/import', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-seeds'] }),
  });

  const runScan = useMutation({
    mutationFn: () => apiClient.post('/admin/seed/run'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-seeds'] }),
  });

  const retryFailed = useMutation({
    mutationFn: () => apiClient.post('/admin/seed/retry-failed'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-seeds'] }),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Seed 資料管理</h1>
          <p className="text-sm text-gray-500">管理品牌 CSV 匯入與掃描</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => importCsv.mutate()} disabled={importCsv.isPending}>
            <Upload className="h-4 w-4 mr-1" />
            {importCsv.isPending ? '匯入中...' : '匯入 CSV'}
          </Button>
          <Button size="sm" onClick={() => runScan.mutate()} disabled={runScan.isPending || status?.isRunning}>
            <Play className="h-4 w-4 mr-1" />
            {status?.isRunning ? '掃描中...' : '啟動掃描'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => retryFailed.mutate()} disabled={retryFailed.isPending}>
            <RefreshCw className="h-4 w-4 mr-1" />
            {retryFailed.isPending ? '重試中...' : `重試失敗 (${status?.failed || 0})`}
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: '總數', value: status?.total, color: 'bg-blue-50 text-blue-700' },
          { label: '已掃描', value: status?.scanned, color: 'bg-green-50 text-green-700' },
          { label: '等待中', value: status?.pending, color: 'bg-yellow-50 text-yellow-700' },
          { label: '失敗', value: status?.failed, color: 'bg-red-50 text-red-700' },
          { label: '狀態', value: status?.isRunning ? '運行中' : '閒置', color: status?.isRunning ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-700' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className={`p-4 text-center ${s.color} rounded-lg`}>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Industry Breakdown */}
      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold mb-3">產業分佈（已掃描）</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {status?.byIndustry
              ?.sort((a: any, b: any) => b.count - a.count)
              .map((ind: any) => (
                <div key={ind.industry} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                  <span className="truncate">{ind.industry}</span>
                  <Badge variant="secondary">{ind.count}</Badge>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Failed Seeds */}
      {failed && failed.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              失敗記錄（最近 20 筆）
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {failed.slice(0, 20).map((seed: any) => (
                <div key={seed.id} className="flex items-center justify-between p-2 bg-red-50 rounded text-sm">
                  <div>
                    <span className="font-medium">{seed.brandName}</span>
                    <span className="text-gray-500 ml-2 text-xs">{seed.url}</span>
                  </div>
                  <span className="text-xs text-red-600 max-w-[200px] truncate">{seed.failReason}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
