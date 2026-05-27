'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  ExternalLink,
  FileText,
  Gift,
  Globe,
  Key,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import apiClient from '@/lib/api-client';

const ROLES = ['USER', 'STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;
const PLANS = ['FREE', 'STARTER', 'PRO'] as const;
const GRANT_PLANS = ['STARTER', 'PRO'] as const;
const SITE_FILTERS = [
  { value: 'all', label: '全部用戶' },
  { value: 'no_sites', label: '尚未新增網站' },
  { value: 'has_sites_not_public', label: '有網站但未公開' },
] as const;

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-500/20 text-red-300',
  ADMIN: 'bg-orange-500/20 text-orange-300',
  STAFF: 'bg-blue-500/20 text-blue-300',
  USER: 'bg-white/10 text-gray-300',
};

const PLAN_COLORS: Record<string, string> = {
  FREE: 'bg-white/10 text-gray-300',
  STARTER: 'bg-emerald-500/20 text-emerald-300',
  PRO: 'bg-purple-500/20 text-purple-300',
};

const TIER_COLORS: Record<string, string> = {
  platinum: 'bg-blue-500/20 text-blue-300',
  gold: 'bg-yellow-500/20 text-yellow-300',
  silver: 'bg-white/10 text-gray-300',
  bronze: 'bg-orange-500/20 text-orange-300',
};

const SCAN_STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-emerald-500/20 text-emerald-300',
  RUNNING: 'bg-blue-500/20 text-blue-300',
  PENDING: 'bg-yellow-500/20 text-yellow-300',
  FAILED: 'bg-red-500/20 text-red-300',
};

const INDICATOR_LABELS: Record<string, string> = {
  jsonLd: 'JSON-LD',
  'json-ld': 'JSON-LD',
  llmsTxt: 'llms.txt',
  'llms-txt': 'llms.txt',
  ogTags: 'OG Tags',
  'og-tags': 'OG Tags',
  metaDescription: 'Meta',
  'meta-description': 'Meta',
  faqSchema: 'FAQ',
  'faq-schema': 'FAQ',
  titleOptimization: 'Title',
  'title-optimization': 'Title',
  contactInfo: 'Contact',
  'contact-info': 'Contact',
  imageAlt: 'Alt',
  'image-alt': 'Alt',
  robotsAi: 'Robots',
  'robots-ai': 'Robots',
};

const isInternalRole = (role: string) => ['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(role);

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPlanExpiry(user: any) {
  if (isInternalRole(user.role)) return '內部帳號不受方案限制';
  if (!user.planExpiresAt) return user.plan === 'FREE' ? '免費方案' : '未設定到期日';
  const expiresAt = new Date(user.planExpiresAt);
  const diffDays = Math.ceil((expiresAt.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return '已到期，下一次方案檢查會回到 FREE';
  return `到期：${formatDateTime(user.planExpiresAt)}，剩 ${diffDays} 天`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('zh-TW');
}

function indicatorClass(status?: string | null) {
  if (status === 'pass') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'warning') return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200';
  return 'border-red-500/30 bg-red-500/10 text-red-200';
}

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState<(typeof SITE_FILTERS)[number]['value']>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editPlan, setEditPlan] = useState('');
  const [editName, setEditName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [grantPlan, setGrantPlan] = useState<(typeof GRANT_PLANS)[number]>('PRO');
  const [grantDays, setGrantDays] = useState('30');
  const [grantReason, setGrantReason] = useState('公開測試活動贈送');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, search, siteFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (siteFilter !== 'all') params.set('siteFilter', siteFilter);
      const { data } = await apiClient.get(`/admin/users?${params}`);
      return data;
    },
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiClient.patch(`/admin/users/${userId}/role`, { role }),
    onSuccess: () => {
      toast.success('角色已更新');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '角色更新失敗'),
  });

  const planMutation = useMutation({
    mutationFn: ({ userId, plan }: { userId: string; plan: string }) =>
      apiClient.patch(`/admin/users/${userId}/plan`, { plan }),
    onSuccess: () => {
      toast.success('方案已更新');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '方案更新失敗'),
  });

  const grantMutation = useMutation({
    mutationFn: ({ userId, plan, days, reason }: { userId: string; plan: string; days: number; reason: string }) =>
      apiClient.patch(`/admin/users/${userId}/plan-grant`, { plan, days, reason }),
    onSuccess: () => {
      toast.success('已贈送方案時間');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '贈送方案時間失敗'),
  });

  const nameMutation = useMutation({
    mutationFn: ({ userId, name }: { userId: string; name: string }) =>
      apiClient.patch(`/admin/users/${userId}/name`, { name }),
    onSuccess: () => {
      toast.success('名稱已更新');
      invalidate();
    },
    onError: () => toast.error('名稱更新失敗'),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      apiClient.patch(`/admin/users/${userId}/password`, { password }),
    onSuccess: () => {
      toast.success('密碼已重設');
      setNewPassword('');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '密碼重設失敗'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => apiClient.delete(`/admin/users/${userId}`),
    onSuccess: () => {
      toast.success('用戶已刪除');
      invalidate();
      setDeleteConfirm(null);
      setExpandedId(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || '刪除失敗');
      setDeleteConfirm(null);
    },
  });

  const scanMutation = useMutation({
    mutationFn: (siteId: string) => apiClient.post(`/admin/scan/site/${siteId}`),
    onSuccess: () => {
      toast.success('已完成重新掃描');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '重新掃描失敗'),
  });

  const publicMutation = useMutation({
    mutationFn: ({ siteId, isPublic, industry }: { siteId: string; isPublic: boolean; industry?: string | null }) =>
      apiClient.patch(`/sites/${siteId}/directory`, {
        isPublic,
        ...(industry ? { industry } : {}),
      }),
    onSuccess: (_, vars) => {
      toast.success(vars.isPublic ? '網站已設為公開' : '網站已改為不公開');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '公開狀態更新失敗'),
  });

  const users = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const toggleExpand = (user: any) => {
    if (expandedId === user.id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(user.id);
    setEditRole(user.role);
    setEditPlan(user.plan || 'FREE');
    setEditName(user.name || '');
    setNewPassword('');
    setDeleteConfirm(null);
    setGrantPlan(user.plan === 'STARTER' ? 'STARTER' : 'PRO');
    setGrantDays('30');
    setGrantReason('公開測試活動贈送');
  };

  const isBusy =
    roleMutation.isPending ||
    planMutation.isPending ||
    grantMutation.isPending ||
    nameMutation.isPending ||
    passwordMutation.isPending ||
    scanMutation.isPending ||
    publicMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Users className="h-6 w-6" /> 用戶管理
          </h1>
          <p className="mt-1 text-sm text-gray-400">共 {total} 位用戶，可調整角色、方案與活動贈送天數。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {['SUPER_ADMIN', 'ADMIN', 'STAFF', 'USER'].map((role) => {
            const count = users.filter((u: any) => u.role === role).length;
            if (count === 0) return null;
            return (
              <div key={role} className="text-center">
                <Badge className={ROLE_COLORS[role]}>{role}</Badge>
                <p className="mt-1 text-xs text-gray-500">{count}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="搜尋 email 或名稱..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {SITE_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              variant={siteFilter === filter.value ? 'default' : 'outline'}
              size="sm"
              className={siteFilter === filter.value ? 'bg-blue-600 text-white hover:bg-blue-500' : ''}
              onClick={() => {
                setSiteFilter(filter.value);
                setPage(1);
              }}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <Card className="border-white/10 bg-white/5">
            <CardContent className="py-16 text-center text-gray-400">沒有找到用戶</CardContent>
          </Card>
        ) : (
          users.map((u: any) => {
            const isExpanded = expandedId === u.id;
            const internal = isInternalRole(u.role);
            const isDeleting = deleteConfirm === u.id;
            const summary = u.siteSummary || {};

            return (
              <div
                key={u.id}
                className={`overflow-hidden rounded-xl border bg-white/5 transition-all ${
                  isExpanded ? 'border-blue-500/30' : 'border-white/10'
                }`}
              >
                <div
                  className="flex cursor-pointer items-center gap-4 p-4 hover:bg-white/5"
                  onClick={() => toggleExpand(u)}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
                    {(u.name || u.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-white">{u.name || '-'}</span>
                      {u.managedBy && <UserCheck className="h-3 w-3 shrink-0 text-yellow-400" />}
                    </div>
                    <div className="truncate text-xs text-gray-500">{u.email}</div>
                  </div>
                  <Badge className={`${ROLE_COLORS[u.role] || 'bg-white/10'} shrink-0`}>{u.role}</Badge>
                  {internal ? (
                    <span className="w-24 shrink-0 text-center text-xs text-gray-500">內部帳號</span>
                  ) : (
                    <div className="hidden min-w-[180px] shrink-0 md:block">
                      <Badge className={`${PLAN_COLORS[u.plan] || 'bg-white/10'} mb-1`}>{u.plan || 'FREE'}</Badge>
                      <p className="truncate text-xs text-gray-500">{formatPlanExpiry(u)}</p>
                    </div>
                  )}
                  <div className="hidden shrink-0 items-center gap-3 text-xs text-gray-500 sm:flex">
                    <span className="flex items-center gap-1" title="網站數量">
                      <Globe className="h-3 w-3" />
                      {summary.totalSites ?? u._count?.sites ?? 0}
                    </span>
                    <span className="flex items-center gap-1 text-emerald-300" title="公開網站數">
                      公開 {summary.publicSites ?? 0}
                    </span>
                    <span className="flex items-center gap-1" title="內容數">
                      <FileText className="h-3 w-3" />
                      {u._count?.contents ?? 0}
                    </span>
                  </div>
                  <div className="hidden min-w-[150px] shrink-0 text-xs text-gray-500 xl:block">
                    <p>
                      最高分{' '}
                      <span className="font-mono text-sm font-semibold text-white">
                        {summary.highestScore ?? '-'}
                      </span>
                    </p>
                    <p className="truncate">最近掃描 {formatDate(summary.lastScanAt)}</p>
                  </div>
                  <span className="hidden w-24 shrink-0 text-right text-xs text-gray-600 lg:block">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('zh-TW') : '-'}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </div>

                {isExpanded && (
                  <div className="space-y-5 border-t border-white/5 bg-white/[0.02] p-4">
                    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <h2 className="text-sm font-semibold text-white">網站總覽</h2>
                          <p className="mt-1 text-xs text-gray-400">
                            {summary.totalSites ?? 0} 個網站，{summary.publicSites ?? 0} 個公開，最高 GEO 分數{' '}
                            {summary.highestScore ?? '-'}。
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                            <p className="text-gray-500">網站</p>
                            <p className="font-mono text-lg font-semibold text-white">{summary.totalSites ?? 0}</p>
                          </div>
                          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                            <p className="text-gray-500">公開</p>
                            <p className="font-mono text-lg font-semibold text-emerald-300">{summary.publicSites ?? 0}</p>
                          </div>
                          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                            <p className="text-gray-500">最高分</p>
                            <p className="font-mono text-lg font-semibold text-white">{summary.highestScore ?? '-'}</p>
                          </div>
                          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                            <p className="text-gray-500">最近掃描</p>
                            <p className="text-sm font-medium text-white">{formatDate(summary.lastScanAt)}</p>
                          </div>
                        </div>
                      </div>

                      {!u.sites || u.sites.length === 0 ? (
                        <div className="rounded-md border border-dashed border-white/10 p-4 text-sm text-gray-400">
                          這個用戶尚未新增網站。
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {u.sites.map((site: any) => {
                            const latestScan = site.latestScan;
                            const results = latestScan?.results || [];
                            return (
                              <div key={site.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="font-medium text-white">{site.name}</p>
                                      <Badge className={site.isPublic ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-gray-300'}>
                                        {site.isPublic ? '公開' : '未公開'}
                                      </Badge>
                                      {site.tier && (
                                        <Badge className={TIER_COLORS[site.tier] || 'bg-white/10 text-gray-300'}>
                                          {site.tier}
                                        </Badge>
                                      )}
                                      {latestScan && (
                                        <Badge className={SCAN_STATUS_COLORS[latestScan.status] || 'bg-white/10 text-gray-300'}>
                                          {latestScan.status}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                                      <a
                                        href={site.url}
                                        target="_blank"
                                        rel="noopener"
                                        className="inline-flex max-w-full items-center gap-1 truncate text-blue-300 hover:underline"
                                      >
                                        {String(site.url || '').replace(/^https?:\/\//, '').slice(0, 56)}
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                      </a>
                                      <span>{site.industry || '未分類'}</span>
                                      <span>掃描 {site.counts?.scans ?? 0}</span>
                                      <span>Q&A {site.counts?.qas ?? 0}</span>
                                      <span>文章 {site.counts?.blogArticles ?? 0}</span>
                                    </div>
                                  </div>

                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <div className="mr-2 text-right">
                                      <p className="font-mono text-2xl font-bold text-white">{site.bestScore ?? 0}</p>
                                      <p className="text-xs text-gray-500">
                                        {formatDate(latestScan?.completedAt || latestScan?.createdAt || site.bestScoreAt)}
                                      </p>
                                    </div>
                                    <a
                                      href={`/sites/${site.id}`}
                                      className="inline-flex h-10 items-center justify-center rounded-md border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10"
                                    >
                                      <Eye className="mr-1 h-4 w-4" />
                                      查看
                                    </a>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={scanMutation.isPending}
                                      onClick={() => scanMutation.mutate(site.id)}
                                    >
                                      <RefreshCw className={`mr-1 h-4 w-4 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
                                      重新掃描
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={site.isPublic ? 'outline' : 'default'}
                                      size="sm"
                                      disabled={publicMutation.isPending}
                                      className={!site.isPublic ? 'bg-emerald-600 text-white hover:bg-emerald-500' : ''}
                                      onClick={() =>
                                        publicMutation.mutate({
                                          siteId: site.id,
                                          isPublic: !site.isPublic,
                                          industry: site.industry,
                                        })
                                      }
                                    >
                                      {site.isPublic ? '改為不公開' : '設為公開'}
                                    </Button>
                                  </div>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {results.length === 0 ? (
                                    <span className="text-xs text-gray-500">尚無掃描指標資料</span>
                                  ) : (
                                    results.map((result: any) => (
                                      <span
                                        key={`${site.id}-${result.indicator}`}
                                        className={`rounded-full border px-2 py-1 text-[11px] ${indicatorClass(result.status)}`}
                                        title={`${result.indicator}: ${result.score}`}
                                      >
                                        {INDICATOR_LABELS[result.indicator] || result.indicator}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">名稱</label>
                        <div className="flex gap-1">
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm" />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            disabled={isBusy || editName === (u.name || '')}
                            onClick={() => nameMutation.mutate({ userId: u.id, name: editName })}
                          >
                            <Save className="h-3.5 w-3.5 text-blue-400" />
                          </Button>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-gray-500">角色</label>
                        <div className="flex gap-1">
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            className="h-8 flex-1 rounded border border-white/20 bg-white/10 px-2 text-sm text-white"
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role} className="bg-gray-900">
                                {role}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            disabled={isBusy || editRole === u.role}
                            onClick={() => roleMutation.mutate({ userId: u.id, role: editRole })}
                          >
                            <Save className="h-3.5 w-3.5 text-blue-400" />
                          </Button>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-gray-500">直接設定方案</label>
                        {isInternalRole(editRole) ? (
                          <div className="flex h-8 items-center text-sm text-gray-500">內部帳號不需要方案</div>
                        ) : (
                          <div className="flex gap-1">
                            <select
                              value={editPlan}
                              onChange={(e) => setEditPlan(e.target.value)}
                              className="h-8 flex-1 rounded border border-white/20 bg-white/10 px-2 text-sm text-white"
                            >
                              {PLANS.map((plan) => (
                                <option key={plan} value={plan} className="bg-gray-900">
                                  {plan}
                                </option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              disabled={isBusy || editPlan === (u.plan || 'FREE')}
                              onClick={() => planMutation.mutate({ userId: u.id, plan: editPlan })}
                            >
                              <Save className="h-3.5 w-3.5 text-blue-400" />
                            </Button>
                          </div>
                        )}
                        <p className="mt-1 text-[11px] text-gray-600">直接設定會清除活動到期日。</p>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-gray-500">重設密碼</label>
                        <div className="flex gap-1">
                          <Input
                            type="text"
                            placeholder="至少 8 字元"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="h-8 bg-white/10 text-sm text-white"
                          />
                          <Button
                            size="sm"
                            className="h-8 bg-yellow-600 px-3 text-white hover:bg-yellow-700"
                            disabled={isBusy || newPassword.length < 8}
                            onClick={() => passwordMutation.mutate({ userId: u.id, password: newPassword })}
                          >
                            <Key className="mr-1 h-3.5 w-3.5" />
                            重設
                          </Button>
                        </div>
                      </div>
                    </div>

                    {!internal && (
                      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                        <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                              <Gift className="h-4 w-4 text-blue-300" />
                              贈送方案時間
                            </h3>
                            <p className="mt-1 text-xs text-gray-400">
                              適合公開測試、BUG 回報獎勵、第一批內測免費月等手動活動調整。
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <CalendarClock className="h-4 w-4" />
                            {formatPlanExpiry(u)}
                          </div>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-[140px_120px_1fr_auto]">
                          <select
                            value={grantPlan}
                            onChange={(e) => setGrantPlan(e.target.value as (typeof GRANT_PLANS)[number])}
                            className="h-10 rounded border border-white/20 bg-gray-950 px-3 text-sm text-white"
                          >
                            {GRANT_PLANS.map((plan) => (
                              <option key={plan} value={plan}>
                                {plan}
                              </option>
                            ))}
                          </select>
                          <Input
                            type="number"
                            min={1}
                            max={366}
                            value={grantDays}
                            onChange={(e) => setGrantDays(e.target.value)}
                            className="h-10"
                            placeholder="天數"
                          />
                          <Input
                            value={grantReason}
                            onChange={(e) => setGrantReason(e.target.value)}
                            className="h-10"
                            placeholder="贈送原因，例如：BUG 回報獎勵"
                          />
                          <Button
                            className="h-10 bg-blue-600 px-5 text-white hover:bg-blue-500"
                            disabled={isBusy || !grantReason.trim() || Number(grantDays) < 1}
                            onClick={() =>
                              grantMutation.mutate({
                                userId: u.id,
                                plan: grantPlan,
                                days: Number(grantDays),
                                reason: grantReason.trim(),
                              })
                            }
                          >
                            贈送
                          </Button>
                        </div>

                        {u.planGrantsReceived?.length > 0 && (
                          <div className="mt-4 space-y-2">
                            <p className="text-xs font-medium text-gray-400">最近贈送紀錄</p>
                            {u.planGrantsReceived.map((grant: any) => (
                              <div
                                key={grant.id}
                                className="flex flex-col gap-1 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-400 md:flex-row md:items-center md:justify-between"
                              >
                                <span>
                                  <span className="font-medium text-white">{grant.plan}</span> {grant.days} 天，
                                  到期 {formatDateTime(grant.expiresAt)}
                                </span>
                                <span className="truncate md:max-w-[45%]">
                                  {grant.reason} · {grant.grantedBy?.name || grant.grantedBy?.email || '管理員'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col gap-3 border-t border-white/5 pt-2 lg:flex-row lg:items-center lg:justify-between">
                      <div className="text-xs text-gray-600">
                        ID: {u.id} · Email: {u.email} · 建立：{formatDateTime(u.createdAt)}
                      </div>
                      {u.role !== 'SUPER_ADMIN' && (
                        isDeleting ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-red-400">確定刪除此用戶與相關資料？</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteMutation.mutate(u.id)}
                              disabled={deleteMutation.isPending}
                              className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            >
                              <Check className="mr-1 h-4 w-4" /> 確認刪除
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>
                              <X className="h-4 w-4" /> 取消
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteConfirm(u.id)}
                            className="text-gray-600 hover:bg-red-500/10 hover:text-red-400"
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> 刪除用戶
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-400">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
