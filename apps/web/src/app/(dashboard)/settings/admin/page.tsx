'use client';

import { useQuery } from '@tanstack/react-query';
import { Shield, Bot, FileText, Globe, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import apiClient from '@/lib/api-client';

interface SeedStatus {
  total: number;
  scanned: number;
  pending: number;
  failed: number;
  isRunning: boolean;
  byIndustry: { industry: string; count: number }[];
  crawler: { total: number; real: number };
  blogArticles: number;
}

function useSeedStatus() {
  return useQuery({
    queryKey: ['admin', 'seed', 'status'],
    queryFn: async () => {
      const { data } = await apiClient.get<SeedStatus>('/admin/seed/status');
      return data;
    },
    refetchInterval: 30000,
  });
}

export default function AdminDashboardPage() {
  const { data, isLoading } = useSeedStatus();

  return (
    <div className="space-y-6">
      <PageHeader
        title="管理員儀表板"
        description="平台數據總覽 — 僅顯示真實資料"
        icon={Shield}
      />

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : data ? (
        <>
          {/* Brand Stats */}
          <div>
            <h2 className="text-lg font-semibold mb-3">品牌掃描</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-5 text-center">
                  <Globe className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-blue-600">{data.total}</p>
                  <p className="text-sm text-muted-foreground">品牌總數</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 text-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-green-600">{data.scanned}</p>
                  <p className="text-sm text-muted-foreground">掃描成功</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 text-center">
                  <AlertTriangle className="h-6 w-6 text-red-500 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-red-500">{data.failed}</p>
                  <p className="text-sm text-muted-foreground">掃描失敗</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 text-center">
                  <FileText className="h-6 w-6 text-purple-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-purple-600">{data.blogArticles}</p>
                  <p className="text-sm text-muted-foreground">Blog 文章</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Crawler Stats */}
          <div>
            <h2 className="text-lg font-semibold mb-3">AI 爬蟲數據（真實）</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-5 text-center">
                  <Bot className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold">{data.crawler.total}</p>
                  <p className="text-sm text-muted-foreground">真實總造訪</p>
                </CardContent>
              </Card>
              <Card className="border-green-200">
                <CardContent className="p-5 text-center">
                  <Bot className="h-6 w-6 text-green-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-green-600">{data.crawler.real}</p>
                  <p className="text-sm text-green-700 font-medium">真實爬蟲</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Industry Breakdown */}
          <div>
            <h2 className="text-lg font-semibold mb-3">行業分布（{data.byIndustry.length} 個行業）</h2>
            <Card>
              <CardContent className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {data.byIndustry
                    .sort((a, b) => b.count - a.count)
                    .map((ind) => (
                      <div key={ind.industry} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-sm text-gray-700">{ind.industry}</span>
                        <span className="text-sm font-bold text-gray-900">{ind.count}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {data.isRunning && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              掃描進行中...
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
