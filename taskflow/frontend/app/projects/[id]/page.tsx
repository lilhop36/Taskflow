'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/utils';
import { statusColor, priorityColor, projectStatusBadge, canManage, errorMessage } from '@/lib/ui';

interface Project {
  _id: string; name: string; description: string; status: string;
  startDate: string; endDate: string;
  owner?: { _id: string; firstName: string; lastName: string };
  members?: { _id: string; firstName: string; lastName: string; email: string }[];
  teams?: { _id: string; name: string; description: string }[];
}

interface Task {
  _id: string; title: string; status: string; priority: string; dueDate: string;
  assignee?: { _id: string; firstName: string; lastName: string };
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTeams, setAllTeams] = useState<{ _id: string; name: string }[]>([]);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState('');

  const load = () => {
    api.get(`/projects/${id}`).then((r) => setProject(r.data));
    api.get(`/tasks?project=${id}`).then((r) => setTasks(r.data));
    api.get('/teams').then((r) => setAllTeams(r.data));
  };

  useEffect(() => { load(); }, [id]);

  const isPM = canManage(user?.role);

  const addTeam = async (teamId: string) => {
    if (!teamId) return;
    await api.patch(`/projects/${id}`, {
      teams: [...(project?.teams?.map((t) => t._id) ?? []), teamId],
    });
    load();
  };

  // BR-003: archiving is only allowed when every task is Done. The backend
  // enforces it — we surface the rejection message if it fails.
  const handleArchive = async () => {
    if (!window.confirm('Archive this project? This cannot be undone.')) return;
    setArchiving(true);
    setArchiveError('');
    try {
      await api.patch(`/projects/${id}/archive`);
      load();
    } catch (err: any) {
      setArchiveError(errorMessage(err, 'Failed to archive project'));
    }
    setArchiving(false);
  };

  if (!project) return <p className="text-gray-400 text-sm">Loading…</p>;

  return (
    <div>
      <Link href="/projects" className="text-sm text-blue-600 hover:underline">&larr; Back to projects</Link>
      <div className="flex items-start justify-between mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{project.description}</p>
          <p className="text-xs text-gray-400 mt-1">
            {formatDate(project.startDate)} – {formatDate(project.endDate)}
            &nbsp;· Status: {project.status}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${projectStatusBadge(project.status)}`}>
            {project.status}
          </span>
          {isPM && project.status !== 'Archived' && (
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="px-3 py-1.5 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {archiving ? 'Archiving…' : 'Archive project'}
            </button>
          )}
          {archiveError && (
            <p className="text-xs text-red-600 max-w-xs text-right">{archiveError}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold mb-2">Members ({project.members?.length ?? 0})</h3>
          <ul className="text-sm space-y-1">
            {project.members?.map((m) => (
              <li key={m._id} className="text-gray-700 relative group cursor-help" title={m.email}>
                {m.firstName} {m.lastName}
                <span className="text-gray-400 text-xs ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  ({m.email})
                </span>
              </li>
            ))}
            {project.members?.length === 0 && <li className="text-gray-400 italic">No members</li>}
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold mb-2">Teams ({project.teams?.length ?? 0})</h3>
          <ul className="text-sm space-y-1">
            {project.teams?.map((t) => (
              <li key={t._id} className="text-gray-700">{t.name} <span className="text-gray-400">— {t.description}</span></li>
            ))}
            {project.teams?.length === 0 && <li className="text-gray-400 italic">No teams associated</li>}
          </ul>
          {isPM && (
            <select
              className="mt-2 border rounded px-2 py-1 text-xs w-full"
              onChange={(e) => addTeam(e.target.value)}
            >
              <option value="">+ Add team…</option>
              {allTeams
                .filter((t) => !project.teams?.some((pt) => pt._id === t._id))
                .map((t) => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
            </select>
          )}
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3">Tasks ({tasks.length})</h2>
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-300">
            <p className="text-sm text-gray-500 mb-2">No tasks yet</p>
            <Link href={`/tasks/new?project=${id}`} className="text-sm text-blue-600 hover:underline font-medium">
              + Create your first task
            </Link>
          </div>
        ) : (
          tasks.map((t) => (
            <Link key={t._id} href={`/tasks/${t._id}`} className="flex items-center justify-between bg-white rounded-lg shadow px-4 py-3 hover:shadow-md transition">
              <div>
                <p className="font-medium">{t.title}</p>
                <p className="text-xs text-gray-400">
                  {t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : 'Unassigned'} · Due {formatDate(t.dueDate)}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className={priorityColor(t.priority)}>{t.priority}</span>
                <span className={statusColor(t.status)}>{t.status}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
