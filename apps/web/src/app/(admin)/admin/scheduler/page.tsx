'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api-client';
import { Clock, Play, Pause, RefreshCw } from 'lucide-react';

export default function AdminSchedulerPage() {
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['admin-scheduler'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/scheduler/tasks');
      return data;
    },
  });

  const toggleTask = useMutation({
    mutationFn: ({ taskKey, enabled }: { taskKey: string; enabled: boolean }) =>
      apiClient.patch(`/admin/scheduler/tasks/${taskKey}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-scheduler'] }),
  });

  const runTask = useMutation({
    mutationFn: (taskKey: string) => apiClient.post(`/admin/scheduler/tasks/${taskKey}/run`),
  });

  const TASK_LABELS: Record<string, string> = {
    tier_recalculation: '等級重新計算',
    blog_bulk_generation: '批量文章生成',
    monitor_daily_pro: 'Pro 用戶每日監控',
    monitor_weekly_free: '免費用戶每週監控',
    weekly_industry_insights: '每週產業洞察',
    robots_check: 'Robots.txt 檢查',
    crawler_monthly_cleanup: '每月爬蟲資料清理',
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" /></div>;
  }

  const taskList = Array.isArray(tasks) ? tasks : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-6 w-6" /> 排程管理
        </h1>
        <p className="text-sm text-gray-500">管理自動化排程任務（爬蟲、分析、生成）</p>
      </div>

      <div className="grid gap-4">
        {taskList.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-400">
              尚無排程任務。排程會在系統啟動時自動建立。
            </CardContent>
          </Card>
        ) : (
          taskList.map((task: any) => (
            <Card key={task.taskKey} className={!task.enabled ? 'opacity-60' : ''}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-gray-900">
                        {TASK_LABELS[task.taskKey] || task.name || task.taskKey}
                      </h3>
                      <Badge className={task.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                        {task.enabled ? '啟用' : '停用'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{task.description || task.taskKey}</p>
                    <div className="flex gap-4 mt-2 text-xs text-gray-400">
                      <span>Cron: <code className="bg-gray-100 px-1 rounded">{task.cronExpr}</code></span>
                      {task.lastRunAt && <span>上次: {new Date(task.lastRunAt).toLocaleString('zh-TW')}</span>}
                      {task.nextRunAt && <span>下次: {new Date(task.nextRunAt).toLocaleString('zh-TW')}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => runTask.mutate(task.taskKey)}
                      disabled={runTask.isPending}
                    >
                      <Play className="h-3.5 w-3.5 mr-1" />
                      執行
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleTask.mutate({ taskKey: task.taskKey, enabled: !task.enabled })}
                    >
                      {task.enabled ? <Pause className="h-3.5 w-3.5 mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
                      {task.enabled ? '停用' : '啟用'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
