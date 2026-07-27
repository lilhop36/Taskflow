'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

interface Project {
  _id: string; name: string; description: string; status: string;
  startDate: string; endDate: string; owner?: { _id: string; firstName: string; lastName: string };
  members?: { _id: string; firstName: string; lastName: string }[];
}

interface Task {
  _id: string; title: string; status: string; priority: string; dueDate: string;
  assignee?: { _id: string; firstName: string; lastName: string };
}

/**
 * Project detail page — shows project info + task list.
 * FR-004.1-4: project metadata, status, linked tasks.
 */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    api.get(`/projects/${id}`).then((r) => setProject(r.data));
    api.get(`/tasks?project=${id}`).then((r) => setTasks(r.data));
  }, [id]);

  if (!project) return <p className="text-gray-400 text-sm">Loading…</p>;

  const statusColor = (s: string) =>
    s === 'Done' ? 'text-green-600' : s === 'In Progress' ? 'text-blue-600' : 'text-gray-500';
  const priorityColor = (p: string) =>
    p === 'High' ? 'text-red-600' : p === 'Medium' ? 'text-yellow-600' : 'text-gray-500';

  return (
    <div>
      <Link href="/projects" className="text-sm text-blue-600 hover:underline">&larr; Back to projects</Link>
      <div className="flex items-start justify-between mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{project.description}</p>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(project.startDate).toLocaleDateString()} – {new Date(project.endDate).toLocaleDateString()}
            &nbsp;· Status: {project.status}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${project.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {project.status}
        </span>
      </div>

      <h2 className="text-lg font-semibold mb-3">Tasks ({tasks.length})</h2>
      <div className="space-y-2">
        {tasks.map((t) => (
          <Link key={t._id} href={`/tasks/${t._id}`} className="flex items-center justify-between bg-white rounded-lg shadow px-4 py-3 hover:shadow-md transition">
            <div>
              <p className="font-medium">{t.title}</p>
              <p className="text-xs text-gray-400">
                {t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : 'Unassigned'} · Due {new Date(t.dueDate).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className={priorityColor(t.priority)}>{t.priority}</span>
              <span className={statusColor(t.status)}>{t.status}</span>
            </div>
          </Link>
        ))}
        {tasks.length === 0 && <p className="text-sm text-gray-400">No tasks yet.</p>}
      </div>
    </div>
  );
}
