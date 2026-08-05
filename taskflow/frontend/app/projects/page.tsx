'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { projectStatusBadge, canManage } from '@/lib/ui';
import { useAuth } from '@/contexts/AuthContext';

interface Project {
  _id: string;
  name: string;
  description: string;
  status: string;
  startDate: string;
  endDate: string;
}

interface Task {
  _id: string;
  project: string;
}

/**
 * Projects list page — FR-004: Project Management
 *
 * Fetches all projects and displays them in a card grid.
 * Each card links to the project detail page.
 * SRS: FR-004.1-4 — project lifecycle visible at a glance.
 */
export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/projects').then((r) => { setProjects(r.data); setLoading(false); });
    // Task count per project is computed client-side from the flat task list
    // (the backend returns tasks with `project` as the parent project id).
    api.get('/tasks').then((r) => setTasks(r.data)).catch(() => {});
  }, []);

  const taskCount = (projectId: string) =>
    tasks.filter((t) => t.project === projectId).length;

  if (loading) return <p className="text-sage text-sm">Loading projects…</p>;

  return (
    <div>
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="eyebrow">Project register</p>
          <h1 className="page-title mt-1">Projects</h1>
          <span className="thread mt-3 w-14" aria-hidden="true" />
        </div>
        {canManage(user?.role) ? (
          <Link href="/projects/new" className="btn-gold">
            + New project
          </Link>
        ) : null}
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <Link
            key={p._id}
            href={`/projects/${p._id}`}
            className="card block p-5 transition-colors hover:border-gold/60"
          >
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{p.name}</h2>
            <p className="mt-1 text-sm text-sage mb-3 line-clamp-2">{p.description}</p>
            <div className="flex items-center justify-between border-t border-black/5 pt-3">
              <span className="font-mono text-[11px] text-sage">{taskCount(p._id)} tasks</span>
              <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${projectStatusBadge(p.status)}`}>
                {p.status}
              </span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-sand">
              {formatDate(p.startDate)} – {formatDate(p.endDate)}
            </div>
          </Link>
        ))}
        {projects.length === 0 && (
          <p className="card px-5 py-10 text-center text-sm text-sage">
            No projects yet — create the first one.
          </p>
        )}
      </div>
    </div>
  );
}
