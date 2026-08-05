'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDate } from '@/lib/utils';
import { errorMessage } from '@/lib/ui';

interface DashboardProject {
  _id: string;
  name: string;
}

interface OverdueTask {
  id: string;
  title: string;
  dueDate: string;
  status: string;
  project: string;
}

interface DashboardData {
  projects: DashboardProject[];
  summary: {
    total: number;
    done: number;
    completionPercent: number;
    overdueCount: number;
  };
  distribution: { todo: number; inProgress: number; done: number };
  overdueTasks: OverdueTask[];
}

/**
 * Bar colors for the status distribution chart (FR-006.2), drawn from the
 * TaskFlow palette: To Do = sage, In Progress = gold, Done = teal.
 */
const BAR_COLORS: Record<string, string> = {
  'To Do': '#6E6A5B',
  'In Progress': '#D99A2B',
  'Done': '#14736A',
};

/**
 * Dashboard page — FR-006: Progress Visualization
 *
 * Shows:
 * - Project list with completion estimates (FR-006.1)
 * - Bar chart of task status distribution across a selected project (FR-006.2)
 * - Overdue task alerts (FR-006.3)
 *
 * All stats come from a single GET /reports/dashboard call — the backend
 * aggregates completion %, status distribution, and overdue tasks, so the
 * browser no longer downloads every project and task to compute them.
 */
export default function DashboardPage() {
  const [selectedProject, setSelectedProject] = useState('');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const query = selectedProject ? `?project=${selectedProject}` : '';
    api
      .get<DashboardData>(`/reports/dashboard${query}`)
      .then((r) => {
        if (!cancelled) setDashboard(r.data);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'Failed to load dashboard'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProject]);

  if (loading) {
    return <p className="text-sage text-sm">Loading dashboard…</p>;
  }

  if (error) {
    return <p className="text-ember text-sm">{error}</p>;
  }

  if (!dashboard) return null;

  const { summary, distribution, overdueTasks } = dashboard;

  const chartData = [
    { name: 'To Do', count: distribution.todo, fill: BAR_COLORS['To Do'] },
    { name: 'In Progress', count: distribution.inProgress, fill: BAR_COLORS['In Progress'] },
    { name: 'Done', count: distribution.done, fill: BAR_COLORS['Done'] },
  ];

  const metrics = [
    { label: 'Total tasks', value: summary.total, tone: 'text-ink' },
    { label: 'Completed', value: summary.done, tone: 'text-teal' },
    { label: 'Completion', value: `${summary.completionPercent}%`, tone: 'text-gold-deep' },
    { label: 'Overdue', value: summary.overdueCount, tone: 'text-ember' },
  ];

  return (
    <div>
      <header className="mb-8">
        <p className="eyebrow">Workspace overview</p>
        <h1 className="page-title mt-1">Dashboard</h1>
        <span className="thread mt-3 w-14" aria-hidden="true" />
      </header>

      {/* Project filter */}
      <div className="mb-6 flex items-center gap-3">
        <label htmlFor="project-filter" className="font-mono text-[11px] uppercase tracking-[0.12em] text-sage">
          Scope
        </label>
        <select
          id="project-filter"
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="rounded-md border border-black/10 bg-card px-3 py-1.5 text-sm text-ink focus:border-gold focus:outline-none"
        >
          <option value="">All projects</option>
          {dashboard.projects.map((p) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Summary metrics — hairline cards, mono numerals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {metrics.map((m) => (
          <div key={m.label} className="card px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">{m.label}</p>
            <p className={`mt-1.5 font-mono text-3xl font-semibold ${m.tone}`}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Bar chart */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-sage">
            Task status distribution
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#6E6A5B', fontSize: 12 }} axisLine={{ stroke: '#E3DECF' }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: '#6E6A5B', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(217,154,43,0.08)' }}
                contentStyle={{ background: '#191712', border: 'none', borderRadius: 8, color: '#FDFBF4', fontSize: 12 }}
                labelStyle={{ color: '#A99F89', fontFamily: 'var(--font-plex-mono)', fontSize: 10, textTransform: 'uppercase' }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={64}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Overdue tasks */}
        <div className={`card p-5 ${overdueTasks.length === 0 ? 'border-teal/30' : 'border-ember/30 bg-ember-soft/40'}`}>
          <h2 className={`font-mono text-[11px] uppercase tracking-[0.14em] ${overdueTasks.length === 0 ? 'text-teal' : 'text-ember'}`}>
            {overdueTasks.length === 0 ? 'No overdue tasks' : `Overdue · ${overdueTasks.length}`}
          </h2>
          {overdueTasks.length === 0 ? (
            <p className="mt-4 text-sm text-sage">Everything is on track. The flow is clear.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {overdueTasks.slice(0, 6).map((t) => (
                <li key={t.id} className="border-l-2 border-ember/50 pl-3">
                  <p className="text-sm font-medium text-ink">{t.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ember">
                    due {formatDate(t.dueDate)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
