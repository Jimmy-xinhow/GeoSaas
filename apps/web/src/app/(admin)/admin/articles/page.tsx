'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api-client';
import { FileText, Trash2, Zap, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

export default function AdminArticlesPage() {
  const [page, setPage] = useState(1);
  const [auditResult, setAuditResult] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-articles', page],
    queryFn: async () => {
      const { data } = await apiClient.get(`/blog/articles?page=${page}&limit=20`);
      return data;
    },
  });

  const bulkGenerate = useMutation({
    mutationFn: () => apiClient.post('/blog/generate-bulk-templates'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-articles'] }),
  });

  const qualityAudit = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete('/blog/quality-audit?threshold=85');
      return data;
    },
    onSuccess: (data) => {
      setAuditResult(data);
      queryClient.invalidateQueries({ queryKey: ['admin-articles'] });
    },
  });

  const generateInsights = useMutation({
    mutationFn: () => apiClient.post('/blog/insights/generate-all'),
  });

  const articles = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  const TEMPLATE_LABELS: Record<string, string> = {
    geo_overview: 'GEO 總覽',
    score_breakdown: '指標解析',
    competitor_comparison: '競爭分析',
    improvement_tips: '優化指南',
    industry_benchmark: '產業基準',
    brand_reputation: '品牌口碑',
    industry_current_state: '產業洞察',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">文章管理</h1>
          <p className="text-sm text-gray-400">共 {total} 篇文章</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => generateInsights.mutate()} disabled={generateInsights.isPending}>
            <Zap className="h-4 w-4 mr-1" />
            {generateInsights.isPending ? '生成中...' : '產業洞察'}
          </Button>
          <Button size="sm" onClick={() => bulkGenerate.mutate()} disabled={bulkGenerate.isPending}>
            <FileText className="h-4 w-4 mr-1" />
            {bulkGenerate.isPending ? '生成中...' : '批量生成'}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => qualityAudit.mutate()} disabled={qualityAudit.isPending}>
            <AlertTriangle className="h-4 w-4 mr-1" />
            {qualityAudit.isPending ? '審計中...' : '品質審計'}
          </Button>
        </div>
      </div>

      {auditResult && (
        <Card className="border-yellow-500/30 bg-yellow-500/20">
          <CardContent className="p-4 text-sm">
            品質審計完成：保留 <strong>{auditResult.kept}</strong> 篇，刪除 <strong>{auditResult.deleted}</strong> 篇（門檻 {auditResult.threshold} 分）
            <Button variant="ghost" size="sm" className="ml-2" onClick={() => setAuditResult(null)}>關閉</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-400">標題</th>
                  <th className="text-left p-3 font-medium text-gray-400">類型</th>
                  <th className="text-left p-3 font-medium text-gray-400">產業</th>
                  <th className="text-center p-3 font-medium text-gray-400">閱讀時間</th>
                  <th className="text-center p-3 font-medium text-gray-400">發布</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-400">載入中...</td></tr>
                ) : (
                  articles.map((a: any) => (
                    <tr key={a.id || a.slug} className="hover:bg-white/5">
                      <td className="p-3">
                        <div className="font-medium text-white max-w-md truncate">{a.title}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{a.slug}</div>
                      </td>
                      <td className="p-3">
                        <Badge variant="secondary" className="text-xs">
                          {TEMPLATE_LABELS[a.templateType || a.category] || a.category || '-'}
                        </Badge>
                      </td>
                      <td className="p-3 text-gray-400">{a.industrySlug || '-'}</td>
                      <td className="p-3 text-center text-gray-400">{a.readTime || a.readingTimeMinutes ? `${a.readingTimeMinutes || '?'} min` : '-'}</td>
                      <td className="p-3 text-center">
                        {a.published ? (
                          <Badge className="bg-green-500/20 text-green-400 text-xs">已發布</Badge>
                        ) : (
                          <Badge className="bg-white/10 text-gray-400 text-xs">草稿</Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
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
