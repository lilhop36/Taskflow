'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface Task {
  _id: string; title: string; status: string; priority: string; dueDate: string;
  project?: { _id: string; name: string };
  assignee?: { _id: string; firstName: string; lastName: string };
}

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState('');
  const [myTasksOnly, setMyTasksOnly] = useState(user?.role === 'TeamMember');

  useEffect(() => { api.get('/tasks').then((r) => setTasks(r.data)); }, []);

  const filtered = tasks
    .filter((t) => !filter || t.status === filter)
    .filter((t) => !myTasksOnly || t.assignee?._id === user?._id);

  const statusColor = (s: string) =>
    s === 'Done' ? 'text-green-600' : s === 'In Progress' ? 'text-blue-600' : 'text-gray-500';
  const priorityColor = (p: string) =>
    p === 'High' ? 'text-red-600' : p === 'Medium' ? 'text-yellow-600' : 'text-gray-500';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Tasks</h1>

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex gap-2">
          {['', 'To Do', 'In Progress', 'Done'].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded text-sm border ${filter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={myTasksOnly} onChange={(e) => setMyTasksOnly(e.target.checked)} />
          My tasks only
        </label>
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
