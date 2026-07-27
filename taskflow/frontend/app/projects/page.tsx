'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface Project {
  _id: string;
  name: string;
  description: string;
  status: string;
  startDate: string;
  endDate: string;
}

/**
 * Projects list page — FR-004: Project Management
 *
 * Fetches all projects and displays them in a card grid.
 * Each card links to the project detail page.
 * SRS: FR-004.1-4 — project lifecycle visible at a glance.
 */
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/projects').then((r) => { setProjects(r.data); setLoading(false); });
  }, []);

  if (loading) return <p className="text-gray-400 text-sm">Loading projects…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Link href="/projects/new" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
          + New Project
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <Link key={p._id} href={`/projects/${p._id}`} className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition">
            <h2 className="font-semibold mb-1">{p.name}</h2>
            <p className="text-sm text-gray-500 mb-2 line-clamp-2">{p.description}</p>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className={`px-2 py-0.5 rounded-full ${p.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {p.status}
              </span>
              <span>{new Date(p.startDate).toLocaleDateString()} – {new Date(p.endDate).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
