'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { errorMessage } from '@/lib/ui';

export type SprintStatus = 'Planned' | 'Active' | 'Completed';
export type TaskStatus =
  | 'Backlog'
  | 'To Do'
  | 'In Progress'
  | 'In Review'
  | 'Done'
  | 'Archived';

export interface Sprint {
  _id: string;
  name: string;
  goal?: string;
  project: { _id: string; name: string } | string;
  status: SprintStatus;
  startDate: string;
  endDate: string;
  createdAt: string;
  completedAt?: string;
  taskCount?: number;
  completedCount?: number;
}

export interface BoardTask {
  _id: string;
  title: string;
  status: TaskStatus;
  priority: 'High' | 'Medium' | 'Low';
  dueDate: string;
  isBlocked?: boolean;
  blockedReason?: string;
  assignee?: { _id: string; firstName: string; lastName: string; email?: string };
}

export interface BoardColumn {
  status: TaskStatus;
  tasks: BoardTask[];
}

export interface BurndownPoint {
  date: string;
  actual: number;
  ideal: number;
}

export interface BurndownResponse {
  sprintId: string;
  total: number;
  completed: number;
  startDate: string;
  endDate: string;
  days: BurndownPoint[];
}

export interface SprintReport {
  sprintId: string;
  name: string;
  goal?: string;
  status: SprintStatus;
  startDate: string;
  endDate: string;
  totalTasks: number;
  completedTasks: number;
  completionPercent: number;
  overdueTasks: number;
  blockedTasks: number;
  tasksByStatus: { status: TaskStatus; count: number }[];
  velocity: {
    sprintId: string;
    name: string;
    completedAt?: string;
    totalTasks: number;
    completedTasks: number;
    completionPercent: number;
  }[];
}

const sprintStatusOrder: TaskStatus[] = [
  'Backlog',
  'To Do',
  'In Progress',
  'In Review',
  'Done',
];

/** Next workflow status for board movement (one step forward along the column order). */
export function nextStatuses(status: TaskStatus): TaskStatus[] {
  const idx = sprintStatusOrder.indexOf(status);
  if (idx < 0 || idx >= sprintStatusOrder.length - 1) return [];
  return [sprintStatusOrder[idx + 1]];
}

/** Previous workflow status for board movement (one step back along the column order). */
export function prevStatuses(status: TaskStatus): TaskStatus[] {
  const idx = sprintStatusOrder.indexOf(status);
  if (idx <= 0) return [];
  return [sprintStatusOrder[idx - 1]];
}

/**
 * Lightweight loader hook — same conventions as the rest of the app:
 * a useEffect + api.get call with loading/error state and a refetch trigger.
 */
function useLoader<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fn()
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError('');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e, 'Failed to load.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);
  return { data, loading, error, refetch };
}

export function useSprints(projectId?: string) {
  return useLoader(
    async () => {
      const { data } = await api.get('/sprints', {
        params: projectId ? { project: projectId } : {},
      });
      return (data.data ?? data) as Sprint[];
    },
    [projectId],
  );
}

export function useSprint(id?: string) {
  return useLoader(
    async () => {
      const { data } = await api.get(`/sprints/${id}`);
      return data as Sprint;
    },
    [id],
  );
}

export function useSprintBoard(id?: string) {
  return useLoader(
    async () => {
      const { data } = await api.get(`/sprints/${id}/board`);
      return (data.data ?? data) as BoardColumn[];
    },
    [id],
  );
}

export function useSprintBurndown(id?: string) {
  return useLoader(
    async () => {
      const { data } = await api.get(`/sprints/${id}/burndown`);
      return data as BurndownResponse;
    },
    [id],
  );
}

export function useSprintReport(id?: string) {
  return useLoader(
    async () => {
      const { data } = await api.get(`/sprints/${id}/report`);
      return data as SprintReport;
    },
    [id],
  );
}

/* ------------------------------------------------------------------ */
/* Actions — thin wrappers over the API; callers refetch after await.  */
/* ------------------------------------------------------------------ */

export async function createSprint(payload: {
  name: string;
  goal?: string;
  project: string;
  startDate: string;
  endDate: string;
}): Promise<Sprint> {
  const { data } = await api.post('/sprints', payload);
  return data;
}

export async function updateSprint(
  id: string,
  patch: Partial<Pick<Sprint, 'name' | 'goal' | 'startDate' | 'endDate'>>,
): Promise<Sprint> {
  const { data } = await api.patch(`/sprints/${id}`, patch);
  return data;
}

export async function deleteSprint(id: string): Promise<void> {
  await api.delete(`/sprints/${id}`);
}

export async function startSprint(id: string): Promise<Sprint> {
  const { data } = await api.post(`/sprints/${id}/start`);
  return data;
}

export async function completeSprint(id: string): Promise<Sprint> {
  const { data } = await api.post(`/sprints/${id}/complete`);
  return data;
}

export async function addTasksToSprint(id: string, taskIds: string[]): Promise<void> {
  await api.post(`/sprints/${id}/tasks`, { taskIds });
}

export async function removeTaskFromSprint(id: string, taskId: string): Promise<void> {
  await api.delete(`/sprints/${id}/tasks/${taskId}`);
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  await api.patch(`/tasks/${taskId}/status`, { status });
}
