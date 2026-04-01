'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import apiClient from '@/lib/api-client';
import { Users, Search, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

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

  const users = data?.items || data || [];
  const total = data?.total || users.length;

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" /> 用戶管理
        </h1>
        <p className="text-sm text-gray-400">共 {total} 位用戶</p>
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

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="text-left p-3 font-medium text-gray-400">用戶</th>
                <th className="text-center p-3 font-medium text-gray-400">角色</th>
                <th className="text-center p-3 font-medium text-gray-400">方案</th>
                <th className="text-center p-3 font-medium text-gray-400">註冊時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-400">載入中...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-400">尚未有用戶管理 API（需建置 /admin/users 端點）</td></tr>
              ) : (
                users.map((u: any) => (
                  <tr key={u.id} className="hover:bg-white/5">
                    <td className="p-3">
                      <div className="font-medium">{u.name || '-'}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </td>
                    <td className="p-3 text-center">
                      <Badge className={ROLE_COLORS[u.role] || 'bg-white/10'}>{u.role}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Badge className={PLAN_COLORS[u.plan] || 'bg-white/10'}>{u.plan || 'FREE'}</Badge>
                    </td>
                    <td className="p-3 text-center text-gray-400 text-xs">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString('zh-TW') : '-'}
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
