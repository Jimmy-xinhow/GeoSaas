'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api-client';
import { Database, Play, RefreshCw, Upload, AlertCircle, ShieldAlert } from 'lucide-react';

export default function AdminSeedsPage() {
  const queryClient = useQueryClient();
  const [quarantineResult, setQuarantineResult] = useState<{ threshold: number; quarantined: number } | null>(null);

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

  const quarantineLowQuality = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/admin/seed/quarantine-low-quality');
      return data;
    },
    onSuccess: (data) => {
      setQuarantineResult(data);
      queryClient.invalidateQueries({ queryKey: ['admin-seeds'] });
      queryClient.invalidateQueries({ queryKey: ['admin-seeds-failed'] });
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Seed 資料管理</h1>
          <p className="text-sm text-gray-400">管理品牌 CSV 匯入與掃描</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Button
            size="sm"
            variant="outline"
            className="border-amber-400/30 text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
            onClick={() => quarantineLowQuality.mutate()}
            disabled={quarantineLowQuality.isPending || (status?.seedQuality?.lowQualityPublicSeeds ?? 0) === 0}
          >
            <ShieldAlert className="h-4 w-4 mr-1" />
            {quarantineLowQuality.isPending ? '隔離中...' : '隔離低品質公開 Seed'}
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: '總數', value: status?.total, color: 'bg-blue-500/20 text-blue-400' },
          { label: '已掃描', value: status?.scanned, color: 'bg-green-500/20 text-green-400' },
          { label: '等待中', value: status?.pending, color: 'bg-yellow-500/20 text-yellow-400' },
          { label: '失敗', value: status?.failed, color: 'bg-red-500/20 text-red-400' },
          { label: '狀態', value: status?.isRunning ? '運行中' : '閒置', color: status?.isRunning ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-300' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className={`p-4 text-center ${s.color} rounded-lg`}>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className={(status?.seedQuality?.lowQualityPublicSeeds ?? 0) > 0 ? 'border-amber-400/30 bg-amber-500/10' : ''}>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="h-4 w-4 text-amber-300" />
                Seed 公開品質
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                低於 {status?.seedQuality?.publicScoreThreshold ?? 60} 分的系統 seed 會保留掃描資料，但不應進入公開目錄、llms-full 或被推送給搜尋引擎。
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full border-amber-400/30 text-amber-200 hover:bg-amber-500/10 hover:text-amber-100 sm:w-auto"
              onClick={() => quarantineLowQuality.mutate()}
              disabled={quarantineLowQuality.isPending || (status?.seedQuality?.lowQualityPublicSeeds ?? 0) === 0}
            >
              <ShieldAlert className="h-4 w-4 mr-1" />
              {quarantineLowQuality.isPending ? '隔離中...' : '立即隔離'}
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-white/5 p-3">
              <p className="text-xs text-gray-400">低分仍公開</p>
              <p className="mt-1 text-2xl font-bold text-amber-300">{status?.seedQuality?.lowQualityPublicSeeds ?? 0}</p>
            </div>
            <div className="rounded-lg bg-white/5 p-3">
              <p className="text-xs text-gray-400">合格公開 Seed</p>
              <p className="mt-1 text-2xl font-bold text-green-300">{status?.seedQuality?.eligiblePublicSeedSites ?? 0}</p>
            </div>
            <div className="rounded-lg bg-white/5 p-3">
              <p className="text-xs text-gray-400">已隔離低分 Seed</p>
              <p className="mt-1 text-2xl font-bold text-gray-200">{status?.seedQuality?.privateLowQualitySeedSites ?? 0}</p>
            </div>
          </div>

          {quarantineResult && (
            <p className="mt-3 text-sm text-emerald-300">
              已隔離 {quarantineResult.quarantined} 筆低於 {quarantineResult.threshold} 分的公開 seed。
            </p>
          )}
        </CardContent>
      </Card>

      {/* Industry Breakdown */}
      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold mb-3">產業分佈（已掃描）</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {status?.byIndustry
              ?.sort((a: any, b: any) => b.count - a.count)
              .map((ind: any) => (
                <div key={ind.industry} className="flex items-center justify-between p-2 bg-white/5 rounded text-sm">
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
                <div key={seed.id} className="flex items-center justify-between p-2 bg-red-500/20 rounded text-sm">
                  <div>
                    <span className="font-medium">{seed.brandName}</span>
                    <span className="text-gray-400 ml-2 text-xs">{seed.url}</span>
                  </div>
                  <span className="text-xs text-red-400 max-w-[200px] truncate">{seed.failReason}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
