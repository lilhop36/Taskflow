'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { canManage, errorMessage } from '@/lib/ui';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sprint,
  useSprints,
  createSprint,
  updateSprint,
  deleteSprint,
  startSprint,
  completeSprint,
} from '@/hooks/useSprints';

interface Project {
  _id: string;
  name: string;
}

const STATUS_BADGE: Record<string, string> = {
  Planned: 'bg-black/5 text-sage',
  Active: 'bg-gold-soft text-gold-deep',
  Completed: 'bg-teal-soft text-teal',
};

export default function SprintsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const isPM = canManage(user?.role);

  const [projects, setProjects] = useState<Project[]>([]);
  const projectId = searchParams.get('project') ?? '';
  const { data: sprints, loading, error, refetch } = useSprints(projectId || undefined);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [deleting, setDeleting] = useState<Sprint | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [formProject, setFormProject] = useState(projectId);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    api.get('/projects').then((r) => setProjects(r.data));
  }, []);

  const resetForm = () => {
    setEditing(null);
    setName('');
    setGoal('');
    setFormProject(projectId);
    setStartDate('');
    setEndDate('');
    setFormError('');
    setShowForm(false);
  };

  const openCreate = () => {
    if (showForm) return resetForm();
    setEditing(null);
    setName('');
    setGoal('');
    setFormProject(projectId);
    setStartDate('');
    setEndDate('');
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (s: Sprint) => {
    setEditing(s);
    setName(s.name);
    setGoal(s.goal ?? '');
    setFormProject(typeof s.project === 'string' ? s.project : s.project._id);
    setStartDate(s.startDate.split('T')[0]);
    setEndDate(s.endDate.split('T')[0]);
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      if (editing) {
        await updateSprint(editing._id, { name, goal });
      } else {
        await createSprint({ name, goal, project: formProject, startDate, endDate });
      }
      resetForm();
      refetch();
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to save sprint.'));
    } finally {
      setBusy(false);
    }
  };

  const doStart = async (s: Sprint) => {
    try {
      await startSprint(s._id);
      refetch();
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to start sprint.'));
    }
  };

  const doComplete = async (s: Sprint) => {
    try {
      await completeSprint(s._id);
      refetch();
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to complete sprint.'));
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteSprint(deleting._id);
      setDeleting(null);
      refetch();
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to delete sprint.'));
    } finally {
      setBusy(false);
    }
  };

  const completionPercent = (s: Sprint) =>
    s.taskCount && s.taskCount > 0
      ? Math.round(((s.completedCount ?? 0) / s.taskCount) * 100)
      : 0;

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="eyebrow">Iteration planning</p>
          <h1 className="page-title mt-1">Sprints</h1>
          <span className="thread mt-3 w-14" aria-hidden="true" />
        </div>
        {isPM && (
          <button onClick={openCreate} className="btn-gold">
            {showForm ? 'Cancel' : '+ New sprint'}
          </button>
        )}
      </header>

      <div className="mb-6 flex items-center gap-3">
        <label className="text-sm text-sage" htmlFor="sprint-project-filter">
          Project
        </label>
        <select
          id="sprint-project-filter"
          value={projectId}
          onChange={(e) => router.push(e.target.value ? `/sprints?project=${e.target.value}` : '/sprints')}
          className="input max-w-xs"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 max-w-xl p-6 space-y-4">
          <div>
            <p className="page-title text-xl">{editing ? 'Edit sprint' : 'Create sprint'}</p>
            <p className="mt-1 text-sm text-sage">Plan the next iteration for your team.</p>
          </div>
          <div className="space-y-1">
            <label className="eyebrow" htmlFor="sprint-name">
              Sprint name
            </label>
            <input
              id="sprint-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Sprint 12 — polish & ship"
            />
          </div>
          <div className="space-y-1">
            <label className="eyebrow" htmlFor="sprint-goal">
              Goal (optional)
            </label>
            <textarea
              id="sprint-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="input min-h-20"
              placeholder="What does this iteration deliver?"
            />
          </div>
          {!editing && (
            <div className="space-y-1">
              <label className="eyebrow" htmlFor="sprint-project">
                Project
              </label>
              <select
                id="sprint-project"
                required
                value={formProject}
                onChange={(e) => setFormProject(e.target.value)}
                className="input"
                disabled={!!projectId}
              >
                <option value="">Select a project</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="eyebrow" htmlFor="sprint-start">
                Start date
              </label>
              <input
                id="sprint-start"
                type="date"
                required
                disabled={!!editing}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input disabled:bg-black/5"
              />
            </div>
            <div className="space-y-1">
              <label className="eyebrow" htmlFor="sprint-end">
                End date
              </label>
              <input
                id="sprint-end"
                type="date"
                required
                disabled={!!editing}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input disabled:bg-black/5"
              />
            </div>
          </div>
          {formError && <p className="text-sm text-ember">{formError}</p>}
          <button type="submit" className="btn-gold" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Update sprint' : 'Create sprint'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="card px-5 py-8 text-center text-sm text-sage">Loading sprints…</p>
      ) : error ? (
        <p className="card px-5 py-8 text-center text-sm text-ember">{error}</p>
      ) : sprints && sprints.length === 0 ? (
        <p className="card px-5 py-10 text-center text-sm text-sage">
          No sprints yet{isPM ? ' — create one to start planning.' : '.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sprints?.map((s) => {
            const percent = completionPercent(s);
            return (
              <div key={s._id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/sprints/${s._id}`} className="font-display text-lg font-semibold text-ink hover:text-gold-deep">
                    {s.name}
                  </Link>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGE[s.status] ?? 'bg-black/5 text-sage'}`}>
                    {s.status}
                  </span>
                </div>
                {s.goal && <p className="mt-1.5 line-clamp-2 text-sm text-sage">{s.goal}</p>}
                <p className="mt-2 font-mono text-[11px] text-sage">
                  {formatDate(s.startDate)} – {formatDate(s.endDate)}
                </p>
                {typeof s.project === 'object' && (
                  <p className="mt-0.5 font-mono text-[11px] text-sage">{s.project.name}</p>
                )}
                {s.taskCount !== undefined && (
                  <div className="mt-4">
                    <div className="flex justify-between text-[11px] text-sage">
                      <span>Progress</span>
                      <span>
                        {s.completedCount}/{s.taskCount} tasks · {percent}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-black/5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${s.status === 'Active' ? 'bg-gold' : 'bg-teal'}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                )}
                {isPM && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3">
                    {s.status === 'Planned' && (
                      <button className="btn-gold px-3 py-1.5 text-xs" onClick={() => doStart(s)}>
                        Start
                      </button>
                    )}
                    {s.status === 'Active' && (
                      <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => doComplete(s)}>
                        Complete
                      </button>
                    )}
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => openEdit(s)} disabled={s.status === 'Active'}>
                      Edit
                    </button>
                    {s.status !== 'Active' && (
                      <button className="btn-danger-text ml-auto" onClick={() => setDeleting(s)}>
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="card w-full max-w-md p-6">
            <h2 className="font-display text-xl font-semibold text-ink">Delete sprint</h2>
            <p className="mt-2 text-sm text-sage">
              Delete sprint “{deleting.name}”? Its tasks move back to the backlog. An active sprint
              cannot be deleted.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button className="btn-gold" onClick={doDelete} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete sprint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}