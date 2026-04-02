'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import apiClient from '@/lib/api-client';
import {
  Users, Search, ChevronLeft, ChevronRight, Edit2, Globe, FileText,
  X, Check, UserCheck, Trash2, Key, Save, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';

const ROLES = ['USER', 'STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;
const PLANS = ['FREE', 'STARTER', 'PRO'] as const;

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-500/20 text-red-400',
  ADMIN: 'bg-orange-500/20 text-orange-400',
  STAFF: 'bg-blue-500/20 text-blue-400',
  USER: 'bg-white/10 text-gray-400',
};

const PLAN_COLORS: Record<string, string> = {
  FREE: 'bg-white/10 text-gray-400',
  STARTER: 'bg-green-500/20 text-green-400',
  PRO: 'bg-purple-500/20 text-purple-400',
};

const isInternalRole = (role: string) => ['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(role);

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editPlan, setEditPlan] = useState('');
  const [editName, setEditName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const { data } = await apiClient.get(`/admin/users?${params}`);
      return data;
    },
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiClient.patch(`/admin/users/${userId}/role`, { role }),
    onSuccess: () => { toast.success('角色已更新'); invalidate(); },
    onError: () => toast.error('角色更新失敗'),
  });

  const planMutation = useMutation({
    mutationFn: ({ userId, plan }: { userId: string; plan: string }) =>
      apiClient.patch(`/admin/users/${userId}/plan`, { plan }),
    onSuccess: () => { toast.success('方案已更新'); invalidate(); },
    onError: () => toast.error('方案更新失敗'),
  });

  const nameMutation = useMutation({
    mutationFn: ({ userId, name }: { userId: string; name: string }) =>
      apiClient.patch(`/admin/users/${userId}/name`, { name }),
    onSuccess: () => { toast.success('名稱已更新'); invalidate(); },
    onError: () => toast.error('名稱更新失敗'),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      apiClient.patch(`/admin/users/${userId}/password`, { password }),
    onSuccess: () => { toast.success('密碼已重設'); setNewPassword(''); },
    onError: (err: any) => toast.error(err?.response?.data?.message || '密碼重設失敗'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => apiClient.delete(`/admin/users/${userId}`),
    onSuccess: () => { toast.success('用戶已刪除'); invalidate(); setDeleteConfirm(null); setExpandedId(null); },
    onError: (err: any) => { toast.error(err?.response?.data?.message || '刪除失敗'); setDeleteConfirm(null); },
  });

  const users = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const toggleExpand = (user: any) => {
    if (expandedId === user.id) {
      setExpandedId(null);
    } else {
      setExpandedId(user.id);
      setEditRole(user.role);
      setEditPlan(user.plan || 'FREE');
      setEditName(user.name || '');
      setNewPassword('');
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> 用戶管理
          </h1>
          <p className="text-sm text-gray-400">共 {total} 位用戶</p>
        </div>
        <div className="flex gap-3">
          {['SUPER_ADMIN', 'ADMIN', 'STAFF', 'USER'].map((role) => {
            const count = users.filter((u: any) => u.role === role).length;
            if (count === 0) return null;
            return (
              <div key={role} className="text-center">
                <Badge className={ROLE_COLORS[role]}>{role}</Badge>
                <p className="text-xs text-gray-500 mt-1">{count}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          placeholder="搜尋 email 或名稱..."
          className="pl-9"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}</div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-gray-400">無結果</div>
        ) : (
          users.map((u: any) => {
            const isExpanded = expandedId === u.id;
            const internal = isInternalRole(u.role);
            const isDeleting = deleteConfirm === u.id;
            const isBusy = roleMutation.isPending || planMutation.isPending || nameMutation.isPending || passwordMutation.isPending;

            return (
              <div key={u.id} className={`bg-white/5 border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-blue-500/30' : 'border-white/10'}`}>
                {/* Row */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/5"
                  onClick={() => toggleExpand(u)}
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium shrink-0">
                    {(u.name || u.email || '?').charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white truncate">{u.name || '-'}</span>
                      {u.managedBy && <UserCheck className="h-3 w-3 text-yellow-400 shrink-0" />}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{u.email}</div>
                  </div>
                  {/* Badges */}
                  <Badge className={`${ROLE_COLORS[u.role] || 'bg-white/10'} shrink-0`}>{u.role}</Badge>
                  {internal ? (
                    <span className="text-xs text-gray-500 shrink-0 w-16 text-center">無限制</span>
                  ) : (
                    <Badge className={`${PLAN_COLORS[u.plan] || 'bg-white/10'} shrink-0`}>{u.plan || 'FREE'}</Badge>
                  )}
                  {/* Stats */}
                  <div className="flex items-center gap-3 shrink-0 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{u._count?.sites ?? 0}</span>
                    <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{u._count?.contents ?? 0}</span>
                  </div>
                  <span className="text-xs text-gray-600 shrink-0 w-20 text-right">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('zh-TW') : '-'}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-gray-500 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>

                {/* Expanded Edit Panel */}
                {isExpanded && (
                  <div className="border-t border-white/5 p-4 bg-white/[0.02] space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {/* Name */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">名稱</label>
                        <div className="flex gap-1">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-8 text-sm"
                          />
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
                      {/* Role */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">角色</label>
                        <div className="flex gap-1">
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            className="flex-1 h-8 bg-white/10 border border-white/20 rounded px-2 text-sm text-white"
                          >
                            {ROLES.map((r) => <option key={r} value={r} className="bg-gray-800">{r}</option>)}
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
                      {/* Plan */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">方案</label>
                        {isInternalRole(editRole) ? (
                          <div className="h-8 flex items-center text-sm text-gray-500">無限制（內部角色）</div>
                        ) : (
                          <div className="flex gap-1">
                            <select
                              value={editPlan}
                              onChange={(e) => setEditPlan(e.target.value)}
                              className="flex-1 h-8 bg-white/10 border border-white/20 rounded px-2 text-sm text-white"
                            >
                              {PLANS.map((p) => <option key={p} value={p} className="bg-gray-800">{p}</option>)}
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
                      </div>
                      {/* Password */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">重設密碼</label>
                        <div className="flex gap-1">
                          <Input
                            type="text"
                            placeholder="輸入新密碼（至少8個字元）..."
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="h-8 text-sm bg-white/10 text-white"
                          />
                          <Button
                            size="sm"
                            className="h-8 px-3 bg-yellow-600 hover:bg-yellow-700 text-white"
                            disabled={isBusy || newPassword.length < 8}
                            onClick={() => passwordMutation.mutate({ userId: u.id, password: newPassword })}
                          >
                            <Key className="h-3.5 w-3.5 mr-1" />
                            重設
                          </Button>
                        </div>
                        {newPassword.length > 0 && newPassword.length < 8 && (
                          <p className="text-[10px] text-red-400 mt-0.5">至少 8 個字元</p>
                        )}
                      </div>
                    </div>

                    {/* Bottom actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <div className="text-xs text-gray-600">
                        ID: {u.id} · Email: {u.email} · 註冊: {u.createdAt ? new Date(u.createdAt).toLocaleString('zh-TW') : '-'}
                      </div>
                      {u.role !== 'SUPER_ADMIN' && (
                        isDeleting ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-400">確定要刪除此用戶及所有資料？</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteMutation.mutate(u.id)}
                              disabled={deleteMutation.isPending}
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            >
                              <Check className="h-4 w-4 mr-1" /> 確定刪除
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
                            className="text-gray-600 hover:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> 刪除用戶
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
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
