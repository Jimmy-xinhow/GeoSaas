'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import apiClient from '@/lib/api-client';
import { Users, Search, ChevronLeft, ChevronRight, Edit2, Globe, FileText, X, Check, UserCheck, Trash2 } from 'lucide-react';
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

// STAFF/ADMIN/SUPER_ADMIN don't need a plan — they bypass limits
const isInternalRole = (role: string) => ['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(role);

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editPlan, setEditPlan] = useState('');
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

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiClient.patch(`/admin/users/${userId}/role`, { role }),
    onSuccess: () => {
      toast.success('角色已更新');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditingId(null);
    },
    onError: () => toast.error('角色更新失敗'),
  });

  const planMutation = useMutation({
    mutationFn: ({ userId, plan }: { userId: string; plan: string }) =>
      apiClient.patch(`/admin/users/${userId}/plan`, { plan }),
    onSuccess: () => {
      toast.success('方案已更新');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditingId(null);
    },
    onError: () => toast.error('方案更新失敗'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => apiClient.delete(`/admin/users/${userId}`),
    onSuccess: (_, userId) => {
      toast.success('用戶已刪除');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setDeleteConfirm(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || '刪除失敗');
      setDeleteConfirm(null);
    },
  });

  const users = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const startEdit = (user: any) => {
    setEditingId(user.id);
    setEditRole(user.role);
    setEditPlan(user.plan || 'FREE');
  };

  const saveEdit = (userId: string) => {
    const user = users.find((u: any) => u.id === userId);
    if (!user) return;
    let changed = false;
    if (editRole !== user.role) {
      roleMutation.mutate({ userId, role: editRole });
      changed = true;
    }
    if (editPlan !== (user.plan || 'FREE') && !isInternalRole(editRole)) {
      planMutation.mutate({ userId, plan: editPlan });
      changed = true;
    }
    if (!changed) setEditingId(null);
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

      <Card className="bg-white/5 border-white/10">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-400">用戶</th>
                  <th className="text-center p-3 font-medium text-gray-400">角色</th>
                  <th className="text-center p-3 font-medium text-gray-400">方案</th>
                  <th className="text-center p-3 font-medium text-gray-400">
                    <Globe className="h-3.5 w-3.5 inline" /> 網站
                  </th>
                  <th className="text-center p-3 font-medium text-gray-400">
                    <FileText className="h-3.5 w-3.5 inline" /> 內容
                  </th>
                  <th className="text-center p-3 font-medium text-gray-400">註冊時間</th>
                  <th className="text-right p-3 font-medium text-gray-400">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400">載入中...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400">無結果</td></tr>
                ) : (
                  users.map((u: any) => {
                    const isEditing = editingId === u.id;
                    const isDeleting = deleteConfirm === u.id;
                    const internal = isInternalRole(u.role);

                    return (
                      <tr key={u.id} className={`hover:bg-white/5 ${isEditing ? 'bg-blue-500/5' : ''} ${isDeleting ? 'bg-red-500/5' : ''}`}>
                        <td className="p-3">
                          <div className="font-medium text-white">{u.name || '-'}</div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                          {u.managedBy && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <UserCheck className="h-3 w-3 text-yellow-400" />
                              <span className="text-[10px] text-yellow-400">受管理</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {isEditing ? (
                            <select
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value)}
                              className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r} className="bg-gray-800">{r}</option>
                              ))}
                            </select>
                          ) : (
                            <Badge className={ROLE_COLORS[u.role] || 'bg-white/10'}>{u.role}</Badge>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {internal && !isEditing ? (
                            <span className="text-xs text-gray-500">無限制</span>
                          ) : isEditing ? (
                            isInternalRole(editRole) ? (
                              <span className="text-xs text-gray-500">無限制</span>
                            ) : (
                              <select
                                value={editPlan}
                                onChange={(e) => setEditPlan(e.target.value)}
                                className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white"
                              >
                                {PLANS.map((p) => (
                                  <option key={p} value={p} className="bg-gray-800">{p}</option>
                                ))}
                              </select>
                            )
                          ) : (
                            <Badge className={PLAN_COLORS[u.plan] || 'bg-white/10'}>{u.plan || 'FREE'}</Badge>
                          )}
                        </td>
                        <td className="p-3 text-center text-gray-300 font-mono">
                          {u._count?.sites ?? 0}
                        </td>
                        <td className="p-3 text-center text-gray-300 font-mono">
                          {u._count?.contents ?? 0}
                        </td>
                        <td className="p-3 text-center text-gray-500 text-xs">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString('zh-TW') : '-'}
                        </td>
                        <td className="p-3 text-right">
                          {isDeleting ? (
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-xs text-red-400 mr-1">確定刪除？</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteMutation.mutate(u.id)}
                                disabled={deleteMutation.isPending}
                              >
                                <Check className="h-4 w-4 text-red-400" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirm(null)}
                              >
                                <X className="h-4 w-4 text-gray-500" />
                              </Button>
                            </div>
                          ) : isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => saveEdit(u.id)}
                                disabled={roleMutation.isPending || planMutation.isPending}
                              >
                                <Check className="h-4 w-4 text-green-400" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingId(null)}
                              >
                                <X className="h-4 w-4 text-gray-500" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEdit(u)}
                                title="編輯"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-gray-400" />
                              </Button>
                              {u.role !== 'SUPER_ADMIN' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteConfirm(u.id)}
                                  title="刪除"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-gray-600 hover:text-red-400" />
                                </Button>
                              )}
                            </div>
                          )}
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
