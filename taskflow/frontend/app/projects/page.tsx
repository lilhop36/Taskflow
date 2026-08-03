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

  if (loading) return <p className="text-gray-400 text-sm">Loading projects…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        {canManage(user?.role) ? (
          <Link href="/projects/new" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
            + New Project
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <Link key={p._id} href={`/projects/${p._id}`} className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition">
            <h2 className="font-semibold mb-1">{p.name}</h2>
            <p className="text-sm text-gray-500 mb-2 line-clamp-2">{p.description}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">{taskCount(p._id)} tasks</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${projectStatusBadge(p.status)}`}>
                {p.status}
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-400">
              {formatDate(p.startDate)} – {formatDate(p.endDate)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
