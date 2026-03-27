import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface ScheduledTask {
  id: string;
  taskKey: string;
  name: string;
  description: string | null;
  cronExpr: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastResult: string | null;
  nextRunAt: string | null;
  updatedAt: string;
}

export function useScheduledTasks() {
  return useQuery({
    queryKey: ['admin', 'scheduler', 'tasks'],
    queryFn: async () => {
      const { data } = await apiClient.get<ScheduledTask[]>('/admin/scheduler/tasks');
      return data;
    },
    refetchInterval: 30000,
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskKey,
      ...body
    }: {
      taskKey: string;
      cronExpr?: string;
      enabled?: boolean;
    }) => {
      const { data } = await apiClient.patch(`/admin/scheduler/tasks/${taskKey}`, body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'scheduler'] });
    },
  });
}

export function useRunTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskKey: string) => {
      const { data } = await apiClient.post(`/admin/scheduler/tasks/${taskKey}/run`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'scheduler'] });
    },
  });
}
