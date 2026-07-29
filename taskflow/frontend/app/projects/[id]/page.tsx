'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

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

  const load = () => {
    api.get(`/projects/${id}`).then((r) => setProject(r.data));
    api.get(`/tasks?project=${id}`).then((r) => setTasks(r.data));
    api.get('/teams').then((r) => setAllTeams(r.data));
  };

  useEffect(() => { load(); }, [id]);

  const isPM = user?.role === 'ProjectManager' || user?.role === 'Administrator';

  const addTeam = async (teamId: string) => {
    if (!teamId) return;
    await api.patch(`/projects/${id}`, {
      teams: [...(project?.teams?.map((t) => t._id) ?? []), teamId],
    });
    load();
  };

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold mb-2">Members ({project.members?.length ?? 0})</h3>
          <ul className="text-sm space-y-1">
            {project.members?.map((m) => (
              <li key={m._id} className="text-gray-700">{m.firstName} {m.lastName} <span className="text-gray-400">({m.email})</span></li>
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
