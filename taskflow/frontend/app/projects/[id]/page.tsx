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

/** Small colored dot for a task's lifecycle status. */
const STATUS_DOT: Record<string, string> = {
  'Backlog': 'bg-sand',
  'To Do': 'bg-sage',
  'In Progress': 'bg-gold',
  'In Review': 'bg-gold-deep',
  'Done': 'bg-teal',
};

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

  if (!project) return <p className="text-sage text-sm">Loading…</p>;

  return (
    <div>
      <Link href="/projects" className="text-sm text-gold-deep hover:underline">&larr; Back to projects</Link>
      <div className="flex items-start justify-between mt-3 mb-6">
        <div className="min-w-0">
          <p className="eyebrow">Project detail</p>
          <h1 className="page-title mt-1">{project.name}</h1>
          <p className="mt-2 text-sm text-sage leading-relaxed">{project.description}</p>
          <p className="mt-2 font-mono text-[11px] text-sand">
            {formatDate(project.startDate)} – {formatDate(project.endDate)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`rounded-full px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${projectStatusBadge(project.status)}`}>
            {project.status}
          </span>
          <div className="flex items-center gap-2">
            <Link href={`/sprints?project=${id}`} className="btn-ghost">
              Sprints
            </Link>
            {isPM && project.status !== 'Archived' && (
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="rounded-md border border-ember/40 px-3 py-1.5 text-xs font-semibold text-ember transition-colors hover:bg-ember hover:text-white disabled:opacity-50"
              >
                {archiving ? 'Archiving…' : 'Archive project'}
              </button>
            )}
          </div>
          {archiveError && (
            <p className="text-xs text-ember max-w-xs text-right">{archiveError}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="card p-5">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-sage">
            Members ({project.members?.length ?? 0})
          </h3>
          <ul className="mt-2 text-sm space-y-1">
            {project.members?.map((m) => (
              <li key={m._id} className="text-ink relative group cursor-help" title={m.email}>
                {m.firstName} {m.lastName}
                <span className="text-sand font-mono text-xs ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  ({m.email})
                </span>
              </li>
            ))}
            {project.members?.length === 0 && <li className="text-sand italic">No members</li>}
          </ul>
        </div>

        <div className="card p-5">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-sage">
            Teams ({project.teams?.length ?? 0})
          </h3>
          <ul className="mt-2 text-sm space-y-1">
            {project.teams?.map((t) => (
              <li key={t._id} className="text-ink">{t.name} <span className="text-sand">— {t.description}</span></li>
            ))}
            {project.teams?.length === 0 && <li className="text-sand italic">No teams associated</li>}
          </ul>
          {isPM && (
            <select
              className="input mt-3 w-full py-1.5 text-xs"
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

      <header className="mb-4">
        <p className="eyebrow">Workload</p>
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          Tasks <span className="font-mono text-sm font-medium text-sage">({tasks.length})</span>
        </h2>
      </header>
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="card px-6 py-10 text-center border-dashed">
            <p className="text-sm text-sage mb-3">No tasks yet — open the flow.</p>
            <Link href={`/tasks/new?project=${id}`} className="btn-gold">
              + Create your first task
            </Link>
          </div>
        ) : (
          tasks.map((t) => (
            <Link
              key={t._id}
              href={`/tasks/${t._id}`}
              className="card flex items-center justify-between px-5 py-3.5 transition-colors hover:border-gold/60"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2.5 font-medium text-ink">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[t.status] ?? 'bg-sage'}`} aria-hidden="true" />
                  <span className="truncate">{t.title}</span>
                </p>
                <p className="mt-0.5 pl-[1.125rem] font-mono text-[11px] text-sage">
                  {t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : 'Unassigned'} · Due {formatDate(t.dueDate)}
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs shrink-0">
                <span className={`font-semibold ${priorityColor(t.priority)}`}>{t.priority}</span>
                <span className={statusColor(t.status)}>{t.status}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
