'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface Project { _id: string; name: string; }
interface User { _id: string; firstName: string; lastName: string; role: string; }

/**
 * Reports page — FR-009: Document Summaries
 *
 * Dropdown selects a project or employee, then fetches and displays
 * the corresponding report data from the backend.
 * SRS: FR-009.1-3 — project status report, employee performance report
 */
export default function ReportsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    api.get('/projects').then((r) => setProjects(r.data)).catch(() => {});
    // A 403 here (e.g. non-PM visiting directly) must not spam the console;
    // the employee dropdown simply stays empty.
    api.get('/users').then((r) => setUsers(r.data)).catch(() => {});
  }, []);

  const fetchProjectReport = async () => {
    if (!selectedProject) return;
    const r = await api.get(`/reports/project/${selectedProject}`);
    setReport({ type: 'project', data: r.data });
  };

  const fetchEmployeeReport = async () => {
    if (!selectedUser) return;
    const r = await api.get(`/reports/employee/${selectedUser}`);
    setReport({ type: 'employee', data: r.data });
  };

  return (
    <div>
      <header className="mb-8">
        <p className="eyebrow">Document summaries</p>
        <h1 className="page-title mt-1">Reports</h1>
        <span className="thread mt-3 w-14" aria-hidden="true" />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Project report */}
        <div className="card p-5">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Project Status Report</h2>
          <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}
            className="input mt-3">
            <option value="">Select project…</option>
            {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
          <button onClick={fetchProjectReport} disabled={!selectedProject} className="btn-gold mt-3">
            Generate
          </button>
        </div>

        {/* Employee report */}
        <div className="card p-5">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Employee Performance Report</h2>
          <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}
            className="input mt-3">
            <option value="">Select employee…</option>
            {users.map((u) => <option key={u._id} value={u._id}>{u.firstName} {u.lastName}</option>)}
          </select>
          <button onClick={fetchEmployeeReport} disabled={!selectedUser} className="btn-gold mt-3">
            Generate
          </button>
        </div>
      </div>

      {report && (
        <div className="card p-6">
          {report.type === 'project' ? (
            <>
              <p className="eyebrow">Project report</p>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-ink mt-1">
                {report.data.project.name}
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5 border-t border-black/5 pt-5">
                <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Total Tasks</p><p className="font-mono text-2xl font-semibold text-ink">{report.data.taskSummary.total}</p></div>
                <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">To Do</p><p className="font-mono text-2xl font-semibold text-sage">{report.data.taskSummary.todo}</p></div>
                <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">In Progress</p><p className="font-mono text-2xl font-semibold text-gold-deep">{report.data.taskSummary.inProgress}</p></div>
                <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Done</p><p className="font-mono text-2xl font-semibold text-teal">{report.data.taskSummary.done}</p></div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm border-t border-black/5 pt-4">
                <div><span className="font-mono text-[11px] text-sage">Completion:</span> <span className="font-medium text-ink">{report.data.taskSummary.completionPercent}%</span></div>
                <div><span className="font-mono text-[11px] text-sage">Time progress:</span> <span className="font-medium text-ink">{report.data.timeProgressPercent}%</span></div>
                <div><span className="font-mono text-[11px] text-sage">Overdue:</span> <span className="font-medium text-ember">{report.data.overdueCount}</span></div>
                <div><span className="font-mono text-[11px] text-sage">Remaining:</span> <span className="font-medium text-ink">{report.data.remainingWorkload}</span></div>
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">Performance report</p>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-ink mt-1">
                {report.data.employee.firstName} {report.data.employee.lastName}
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5 border-t border-black/5 pt-5">
                <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Assigned</p><p className="font-mono text-2xl font-semibold text-ink">{report.data.taskSummary.totalAssigned}</p></div>
                <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">On Time</p><p className="font-mono text-2xl font-semibold text-teal">{report.data.taskSummary.completedOnTime}</p></div>
                <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Late</p><p className="font-mono text-2xl font-semibold text-ember">{report.data.taskSummary.completedLate}</p></div>
                <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Active</p><p className="font-mono text-2xl font-semibold text-gold-deep">{report.data.taskSummary.activeWorkload}</p></div>
              </div>
              <div className="mt-4 text-sm border-t border-black/5 pt-4">
                <span className="font-mono text-[11px] text-sage">On-time rate:</span> <span className="font-medium text-ink">{report.data.performanceMetrics.onTimeRate ?? 'N/A'}%</span>
                &nbsp;· <span className="font-mono text-[11px] text-sage">Missed deadlines:</span> <span className="font-medium text-ember">{report.data.performanceMetrics.missedDeadlines}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
