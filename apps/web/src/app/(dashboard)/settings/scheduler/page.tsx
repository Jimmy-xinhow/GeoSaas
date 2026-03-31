'use client';

import { useState } from 'react';
import {
  Clock, Play, Pause, RefreshCw, CheckCircle2, XCircle, Loader2, Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useScheduledTasks, useUpdateTask, useRunTask,
  type ScheduledTask,
} from '@/hooks/use-scheduler';

function getTimeAgo(dateStr: string | null) {
  if (!dateStr) return '從未執行';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function TaskRow({ task }: { task: ScheduledTask }) {
  const [editing, setEditing] = useState(false);
  const [cronInput, setCronInput] = useState(task.cronExpr);
  const updateTask = useUpdateTask();
  const runTask = useRunTask();

  const handleToggle = () => {
    updateTask.mutate(
      { taskKey: task.taskKey, enabled: !task.enabled },
      { onSuccess: () => toast.success(task.enabled ? '已停用' : '已啟用') },
    );
  };

  const handleSaveCron = () => {
    updateTask.mutate(
      { taskKey: task.taskKey, cronExpr: cronInput },
      {
        onSuccess: () => { toast.success('排程已更新'); setEditing(false); },
        onError: () => toast.error('無效的 Cron 表達式'),
      },
    );
  };

  const handleRun = () => {
    runTask.mutate(task.taskKey, {
      onSuccess: () => toast.success('已觸發執行'),
    });
  };

  const isSuccess = task.lastResult === 'success';
  const isError = task.lastResult?.startsWith('error');

  return (
    <Card className={!task.enabled ? 'opacity-60' : ''}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-white">{task.name}</h3>
              <Badge variant={task.enabled ? 'default' : 'secondary'} className="text-xs">
                {task.enabled ? '啟用中' : '已停用'}
              </Badge>
              {task.lastResult && (
                <Badge
                  variant="outline"
                  className={`text-xs ${isSuccess ? 'text-green-600 border-green-200' : isError ? 'text-red-600 border-red-200' : ''}`}
                >
                  {isSuccess ? <CheckCircle2 className="h-3 w-3 mr-1" /> : isError ? <XCircle className="h-3 w-3 mr-1" /> : null}
                  {isSuccess ? '成功' : isError ? '失敗' : task.lastResult}
                </Badge>
              )}
            </div>
            {task.description && (
              <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                排程：{editing ? (
                  <span className="inline-flex items-center gap-1">
                    <Input
                      value={cronInput}
                      onChange={(e) => setCronInput(e.target.value)}
                      className="h-6 w-32 text-xs px-2"
                    />
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={handleSaveCron}>
                      儲存
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setEditing(false); setCronInput(task.cronExpr); }}>
                      取消
                    </Button>
                  </span>
                ) : (
                  <button onClick={() => setEditing(true)} className="font-mono bg-white/10 px-1.5 py-0.5 rounded hover:bg-white/20">
                    {task.cronExpr}
                  </button>
                )}
              </span>
              <span>上次執行：{getTimeAgo(task.lastRunAt)}</span>
              {task.nextRunAt && <span>下次執行：{new Date(task.nextRunAt).toLocaleString('zh-TW')}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRun}
              disabled={runTask.isPending}
              title="立即執行"
            >
              {runTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              variant={task.enabled ? 'outline' : 'default'}
              onClick={handleToggle}
              disabled={updateTask.isPending}
              title={task.enabled ? '停用' : '啟用'}
            >
              {task.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SchedulerSettingsPage() {
  const { data: tasks, isLoading } = useScheduledTasks();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings2 className="h-6 w-6" />
          自動化排程管理
        </h1>
        <p className="text-muted-foreground mt-1">
          管理所有自動化任務的排程時間，可隨時啟用、停用或調整
        </p>
      </div>

      <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-300">
        <strong>Cron 格式說明：</strong> 分 時 日 月 週 — 例如 <code className="bg-blue-500/30 px-1 rounded">0 2 * * *</code> = 每天凌晨 2:00，
        <code className="bg-blue-500/30 px-1 rounded">0 3 * * 1</code> = 每週一凌晨 3:00
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {tasks?.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
