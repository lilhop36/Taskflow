'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { statusColor, priorityColor, canManage } from '@/lib/ui';
import { useAuth } from '@/contexts/AuthContext';

interface Task {
  _id: string; title: string; status: string; priority: string; dueDate: string;
  project?: { _id: string; name: string };
  assignee?: { _id: string; firstName: string; lastName: string };
}

/** Small colored dot for the task's lifecycle status. */
const STATUS_DOT: Record<string, string> = {
  'To Do': 'bg-sage',
  'In Progress': 'bg-gold',
  'Done': 'bg-teal',
};

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState('');
  const [myTasksOnly, setMyTasksOnly] = useState(user?.role === 'TeamMember');

  useEffect(() => { api.get('/tasks').then((r) => setTasks(r.data)); }, []);

  const filtered = tasks
    .filter((t) => !filter || t.status === filter)
    .filter((t) => !myTasksOnly || t.assignee?._id === user?._id);

  const isPM = canManage(user?.role);

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="eyebrow">Task register</p>
          <h1 className="page-title mt-1">Tasks</h1>
          <span className="thread mt-3 w-14" aria-hidden="true" />
        </div>
        {isPM && (
          <Link href="/tasks/new" className="btn-gold">
            + New task
          </Link>
        )}
      </header>

      <div className="mb-6 flex items-center gap-4 flex-wrap">
        <div className="flex gap-1.5">
          {['', 'To Do', 'In Progress', 'Done'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                filter === s
                  ? 'bg-ink text-card'
                  : 'bg-card text-sage border border-black/10 hover:border-gold hover:text-ink'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-sage cursor-pointer">
          <input
            type="checkbox"
            checked={myTasksOnly}
            onChange={(e) => setMyTasksOnly(e.target.checked)}
            className="h-4 w-4 rounded border-black/20 accent-gold"
          />
          My tasks only
        </label>
      </div>

      <div className="space-y-2">
        {filtered.map((t) => (
          <Link
            key={t._id}
            href={`/tasks/${t._id}`}
            className="card flex items-center justify-between px-5 py-3.5 transition-colors hover:border-gold/60"
          >
            <div className="flex-1 min-w-0">
              <p className="flex items-center gap-2.5 font-medium text-ink">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[t.status] ?? 'bg-sage'}`} aria-hidden="true" />
                <span className="truncate">{t.title}</span>
              </p>
              <p className="mt-0.5 pl-[1.125rem] font-mono text-[11px] text-sage">
                {t.project?.name ?? 'N/A'} · {t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : 'Unassigned'}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs shrink-0">
              <span className={`font-semibold ${priorityColor(t.priority)}`}>{t.priority}</span>
              <span className={statusColor(t.status)}>{t.status}</span>
              <span className="font-mono text-[11px] text-sage">{formatDate(t.dueDate)}</span>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="card px-5 py-8 text-center text-sm text-sage">
            No tasks match. Adjust the filters or create a new task.
          </p>
        )}
      </div>
    </div>
  );
}
