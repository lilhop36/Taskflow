'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface Task {
  _id: string; title: string; status: string; priority: string; dueDate: string;
  project?: { _id: string; name: string };
  assignee?: { _id: string; firstName: string; lastName: string };
}

/**
 * Tasks list page — FR-005: Task Management
 *
 * Shows all tasks with filterable columns for status and priority.
 * Each row links to the task detail page for comments + status transitions.
 * SRS: FR-005.3 — personalized workspace view (filtered by assignee later).
 */
export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => { api.get('/tasks').then((r) => setTasks(r.data)); }, []);

  const filtered = filter ? tasks.filter((t) => t.status === filter) : tasks;

  const statusColor = (s: string) =>
    s === 'Done' ? 'text-green-600' : s === 'In Progress' ? 'text-blue-600' : 'text-gray-500';
  const priorityColor = (p: string) =>
    p === 'High' ? 'text-red-600' : p === 'Medium' ? 'text-yellow-600' : 'text-gray-500';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Tasks</h1>

      <div className="mb-4 flex gap-2">
        {['', 'To Do', 'In Progress', 'Done'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded text-sm border ${filter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((t) => (
          <Link key={t._id} href={`/tasks/${t._id}`}
            className="flex items-center justify-between bg-white rounded-lg shadow px-4 py-3 hover:shadow-md transition">
            <div className="flex-1">
              <p className="font-medium">{t.title}</p>
              <p className="text-xs text-gray-400">
                {t.project?.name ?? 'N/A'} · {t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : 'Unassigned'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className={priorityColor(t.priority)}>{t.priority}</span>
              <span className={statusColor(t.status)}>{t.status}</span>
              <span className="text-gray-400">{new Date(t.dueDate).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && <p className="text-sm text-gray-400">No tasks match.</p>}
      </div>
    </div>
  );
}
