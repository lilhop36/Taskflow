'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDate } from '@/lib/utils';

interface Project {
  _id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
}

interface Task {
  _id: string;
  title: string;
  status: string;
  project: string;
  dueDate: string;
}

/**
 * Bar colors for the status distribution chart (FR-006.2).
 * To Do = gray, In Progress = amber, Done = green.
 */
const BAR_COLORS: Record<string, string> = {
  'To Do': '#6b7280',      // Gray
  'In Progress': '#eab308', // Yellow/Amber
  'Done': '#22c55e',        // Green
};

/**
 * Dashboard page — FR-006: Progress Visualization
 *
 * Shows:
 * - Project list with completion estimates (FR-006.1)
 * - Bar chart of task status distribution across a selected project (FR-006.2)
 * - Overdue task alerts (FR-006.3)
 *
 * Data is fetched live from the backend on every visit.
 * SRS: FR-006.1-3 — real-time progress, visual chart, deadline alerts
 */
export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');

  useEffect(() => {
    api.get('/projects').then((r) => setProjects(r.data));
    api.get('/tasks').then((r) => setTasks(r.data));
  }, []);

  const projectTasks = selectedProject
    ? tasks.filter((t) => t.project === selectedProject)
    : tasks;

  const todo = projectTasks.filter((t) => t.status === 'To Do').length;
  const inProgress = projectTasks.filter((t) => t.status === 'In Progress').length;
  const done = projectTasks.filter((t) => t.status === 'Done').length;
  const total = projectTasks.length;
  const completion = total > 0 ? Math.round((done / total) * 100) : 0;

  const now = new Date();
  const overdue = projectTasks.filter((t) => t.status !== 'Done' && new Date(t.dueDate) < now);

  const chartData = [
    { name: 'To Do', count: todo, fill: BAR_COLORS['To Do'] },
    { name: 'In Progress', count: inProgress, fill: BAR_COLORS['In Progress'] },
    { name: 'Done', count: done, fill: BAR_COLORS['Done'] },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Project filter */}
      <div className="mb-6">
        <label className="text-sm font-medium mr-2">Project:</label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="border rounded px-3 py-1 text-sm"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total Tasks</p>
          <p className="text-2xl font-bold">{total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Completed</p>
          <p className="text-2xl font-bold text-green-600">{done}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Completion</p>
          <p className="text-2xl font-bold text-blue-600">{completion}%</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Overdue</p>
          <p className="text-2xl font-bold text-red-600">{overdue.length}</p>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-lg shadow p-4 mb-8">
        <h2 className="text-sm font-semibold mb-3">Task Status Distribution</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Overdue tasks */}
      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-red-800 mb-2">
            Overdue Tasks
          </h2>
          <ul className="text-sm text-red-700 space-y-1">
            {overdue.slice(0, 10).map((t) => (
              <li key={t._id}>
                • {t.title} — due {formatDate(t.dueDate)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
