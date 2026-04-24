'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';
import {
  Trophy,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Star,
  Eye,
  ExternalLink,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '待審核',
  approved: '已通過',
  rejected: '已拒絕',
};

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  perplexity: 'Perplexity',
  gemini: 'Gemini',
  other: '其他',
};

interface CaseListItem {
  id: string;
  title: string;
  aiPlatform: string;
  queryUsed: string;
  beforeGeoScore: number | null;
  afterGeoScore: number | null;
  improvementDays: number | null;
  industry: string | null;
  tags: string[];
  status: string;
  rejectionReason: string | null;
  featuredAt: string | null;
  screenshotUrl: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string };
  site: { id: string; name: string; url: string } | null;
  generatedArticle: { id: string; slug: string; title: string } | null;
}

interface CaseDetail extends CaseListItem {
  aiResponse: string;
  user: { id: string; name: string | null; email: string; avatarUrl: string | null };
  site: { id: string; name: string; url: string; bestScore: number } | null;
  generatedArticle: { id: string; slug: string; title: string; content: string } | null;
}

interface ListResponse {
  items: CaseListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  statusCounts: Record<string, number>;
}

export default function AdminCasesPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ['admin-cases', page, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiClient.get<ListResponse>(`/admin/success-cases?${params}`);
      return res.data;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-cases'] });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/admin/success-cases/${id}/approve`),
    onSuccess: () => {
      toast.success('已通過審核');
      invalidate();
    },
    onError: () => toast.error('審核失敗'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.patch(`/admin/success-cases/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('已拒絕案例');
      setRejectTarget(null);
      setRejectReason('');
      invalidate();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || '操作失敗');
    },
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/admin/success-cases/${id}/reset`),
    onSuccess: () => {
      toast.success('已撤回，回到待審核');
      invalidate();
    },
    onError: () => toast.error('撤回失敗'),
  });

  const featureMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/admin/success-cases/${id}/feature`),
    onSuccess: (_, id) => {
      const current = data?.items.find((c) => c.id === id);
      toast.success(current?.featuredAt ? '已取消精選' : '已設為精選');
      invalidate();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || '操作失敗');
    },
  });

  const items = data?.items || [];
  const statusCounts = data?.statusCounts || { pending: 0, approved: 0, rejected: 0 };
  const totalPages = data?.totalPages || 1;

  const onReject = () => {
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 2) {
      toast.error('請輸入拒絕原因（至少 2 字）');
      return;
    }
    rejectMutation.mutate({ id: rejectTarget, reason: rejectReason.trim() });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="h-6 w-6" /> 案例審核
        </h1>
        <p className="text-sm text-gray-400">審核用戶提交的 GEO 成功案例</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
          >
            {STATUS_LABELS[s]}
            <span className="ml-2 text-xs opacity-70">{statusCounts[s] ?? 0}</span>
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="text-left p-3 font-medium text-gray-400">標題 / 提交者</th>
                <th className="text-center p-3 font-medium text-gray-400">平台</th>
                <th className="text-center p-3 font-medium text-gray-400">分數變化</th>
                <th className="text-center p-3 font-medium text-gray-400">狀態</th>
                <th className="text-center p-3 font-medium text-gray-400">提交時間</th>
                <th className="text-right p-3 font-medium text-gray-400">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    載入中...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    目前沒有{STATUS_LABELS[statusFilter]}的案例
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id} className="hover:bg-white/5">
                    <td className="p-3">
                      <div className="flex items-start gap-2">
                        {c.featuredAt && (
                          <Star className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5 fill-yellow-400" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium flex items-center gap-1.5">
                            {c.title}
                            {c.screenshotUrl && (
                              <ImageIcon className="h-3.5 w-3.5 text-gray-500" />
                            )}
                            {c.generatedArticle && (
                              <FileText className="h-3.5 w-3.5 text-gray-500" />
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5 max-w-md truncate">
                            Q: {c.queryUsed}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {c.user.name || '(未命名)'} · {c.user.email}
                            {c.site && <> · <span className="text-gray-400">{c.site.name}</span></>}
                          </div>
                          {c.status === 'rejected' && c.rejectionReason && (
                            <div className="text-xs text-red-400 mt-1">
                              拒絕原因：{c.rejectionReason}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="secondary">
                        {PLATFORM_LABELS[c.aiPlatform] || c.aiPlatform}
                      </Badge>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {c.beforeGeoScore != null && c.afterGeoScore != null ? (
                        <span className="font-mono text-xs">
                          {c.beforeGeoScore} → {c.afterGeoScore}
                        </span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <Badge className={STATUS_COLORS[c.status]}>
                        {STATUS_LABELS[c.status] || c.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-center text-xs text-gray-400 whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleDateString('zh-TW')}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedId(c.id)}
                          title="查看詳情"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {c.status === 'pending' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-500 hover:text-green-400"
                              onClick={() => approveMutation.mutate(c.id)}
                              disabled={approveMutation.isPending}
                              title="通過"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-400"
                              onClick={() => {
                                setRejectTarget(c.id);
                                setRejectReason('');
                              }}
                              title="拒絕"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {c.status === 'approved' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={c.featuredAt ? 'text-yellow-400' : 'text-gray-400'}
                              onClick={() => featureMutation.mutate(c.id)}
                              disabled={featureMutation.isPending}
                              title={c.featuredAt ? '取消精選' : '設為精選'}
                            >
                              <Star
                                className={`h-4 w-4 ${c.featuredAt ? 'fill-yellow-400' : ''}`}
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-gray-400"
                              onClick={() => resetMutation.mutate(c.id)}
                              disabled={resetMutation.isPending}
                              title="撤回到待審核"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {c.status === 'rejected' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-400"
                            onClick={() => resetMutation.mutate(c.id)}
                            disabled={resetMutation.isPending}
                            title="撤回到待審核"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            第 {page} / {totalPages} 頁，共 {data?.total ?? 0} 筆
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Reject reason modal */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setRejectTarget(null)}
        >
          <div
            className="w-full max-w-md bg-gray-900 border border-white/10 rounded-lg p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">拒絕案例</h2>
            <p className="text-sm text-gray-400">
              請說明拒絕原因，此訊息會發送給提交者。
            </p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="例：AI 回應內容無法佐證，或截圖與敘述不符…"
              rows={4}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejectTarget(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={onReject}
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending ? '送出中…' : '確認拒絕'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {selectedId && (
        <CaseDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function CaseDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<CaseDetail>({
    queryKey: ['admin-case-detail', id],
    queryFn: async () => {
      const res = await apiClient.get<CaseDetail>(`/admin/success-cases/${id}`);
      return res.data;
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl h-full overflow-y-auto bg-gray-900 border-l border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-white/10 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">案例詳情</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {isLoading || !data ? (
          <div className="p-8 text-center text-gray-400">載入中…</div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="flex items-start gap-2 flex-wrap">
              <h3 className="text-xl font-semibold">{data.title}</h3>
              <Badge className={STATUS_COLORS[data.status]}>
                {STATUS_LABELS[data.status] || data.status}
              </Badge>
              {data.featuredAt && (
                <Badge className="bg-yellow-500/20 text-yellow-400">
                  <Star className="h-3 w-3 mr-1 fill-yellow-400" /> 精選
                </Badge>
              )}
            </div>

            <Section label="提交者">
              <p>{data.user.name || '(未命名)'} · {data.user.email}</p>
              <p className="text-xs text-gray-500">
                提交時間：{new Date(data.createdAt).toLocaleString('zh-TW')}
                {data.updatedAt !== data.createdAt && (
                  <> · 最後更新：{new Date(data.updatedAt).toLocaleString('zh-TW')}</>
                )}
              </p>
            </Section>

            {data.site && (
              <Section label="綁定網站">
                <a
                  href={data.site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  {data.site.name}
                  <ExternalLink className="h-3 w-3" />
                </a>
                <p className="text-xs text-gray-500">{data.site.url} · 最佳分數 {data.site.bestScore}</p>
              </Section>
            )}

            <Section label="AI 平台">
              <Badge variant="secondary">
                {PLATFORM_LABELS[data.aiPlatform] || data.aiPlatform}
              </Badge>
            </Section>

            <Section label="使用者向 AI 的提問">
              <p className="text-sm bg-white/5 border border-white/10 rounded p-3">
                {data.queryUsed}
              </p>
            </Section>

            <Section label="AI 實際回應">
              <p className="text-sm bg-white/5 border border-white/10 rounded p-3 whitespace-pre-wrap">
                {data.aiResponse}
              </p>
            </Section>

            {data.screenshotUrl && (
              <Section label="截圖佐證">
                <a href={data.screenshotUrl} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={data.screenshotUrl}
                    alt="screenshot"
                    className="max-w-full rounded border border-white/10"
                  />
                </a>
              </Section>
            )}

            {(data.beforeGeoScore != null || data.afterGeoScore != null || data.improvementDays) && (
              <Section label="優化數據">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white/5 rounded p-3 border border-white/10">
                    <div className="text-xs text-gray-400">優化前</div>
                    <div className="text-xl font-semibold">{data.beforeGeoScore ?? '-'}</div>
                  </div>
                  <div className="bg-white/5 rounded p-3 border border-white/10">
                    <div className="text-xs text-gray-400">優化後</div>
                    <div className="text-xl font-semibold text-green-400">
                      {data.afterGeoScore ?? '-'}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded p-3 border border-white/10">
                    <div className="text-xs text-gray-400">耗時</div>
                    <div className="text-xl font-semibold">
                      {data.improvementDays ? `${data.improvementDays} 天` : '-'}
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {data.tags.length > 0 && (
              <Section label="標籤">
                <div className="flex flex-wrap gap-1">
                  {data.tags.map((t) => (
                    <Badge key={t} variant="outline">{t}</Badge>
                  ))}
                </div>
              </Section>
            )}

            {data.status === 'rejected' && data.rejectionReason && (
              <Section label="拒絕原因">
                <p className="text-sm bg-red-500/10 border border-red-500/30 rounded p-3 text-red-300">
                  {data.rejectionReason}
                </p>
              </Section>
            )}

            {data.generatedArticle && (
              <Section label="自動生成文章">
                <p className="text-sm text-gray-300">{data.generatedArticle.title}</p>
                <p className="text-xs text-gray-500">slug: {data.generatedArticle.slug}</p>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
        {label}
      </h4>
      <div className="text-sm space-y-1">{children}</div>
    </div>
  );
}
