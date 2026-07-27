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
    api.get('/projects').then((r) => setProjects(r.data));
    api.get('/users').then((r) => setUsers(r.data));
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
      <h1 className="text-2xl font-bold mb-6">Reports (FR-009)</h1>

      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Project report */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold mb-3">Project Status Report</h2>
          <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm mb-3">
            <option value="">Select project…</option>
            {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
          <button onClick={fetchProjectReport}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
            Generate
          </button>
        </div>

        {/* Employee report */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold mb-3">Employee Performance Report</h2>
          <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm mb-3">
            <option value="">Select employee…</option>
            {users.map((u) => <option key={u._id} value={u._id}>{u.firstName} {u.lastName}</option>)}
          </select>
          <button onClick={fetchEmployeeReport}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
            Generate
          </button>
        </div>
      </div>

      {report && (
        <div className="bg-white rounded-lg shadow p-6">
          {report.type === 'project' ? (
            <>
              <h2 className="text-lg font-bold mb-3">{report.data.project.name} — Report</h2>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div><p className="text-xs text-gray-400">Total Tasks</p><p className="text-xl font-bold">{report.data.taskSummary.total}</p></div>
                <div><p className="text-xs text-gray-400">To Do</p><p className="text-xl font-bold text-gray-500">{report.data.taskSummary.todo}</p></div>
                <div><p className="text-xs text-gray-400">In Progress</p><p className="text-xl font-bold text-blue-600">{report.data.taskSummary.inProgress}</p></div>
                <div><p className="text-xs text-gray-400">Done</p><p className="text-xl font-bold text-green-600">{report.data.taskSummary.done}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-400">Completion:</span> {report.data.taskSummary.completionPercent}%</div>
                <div><span className="text-gray-400">Time progress:</span> {report.data.timeProgressPercent}%</div>
                <div><span className="text-gray-400">Overdue:</span> <span className="text-red-600">{report.data.overdueCount}</span></div>
                <div><span className="text-gray-400">Remaining:</span> {report.data.remainingWorkload}</div>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold mb-3">{report.data.employee.firstName} {report.data.employee.lastName} — Performance</h2>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div><p className="text-xs text-gray-400">Assigned</p><p className="text-xl font-bold">{report.data.taskSummary.totalAssigned}</p></div>
                <div><p className="text-xs text-gray-400">On Time</p><p className="text-xl font-bold text-green-600">{report.data.taskSummary.completedOnTime}</p></div>
                <div><p className="text-xs text-gray-400">Late</p><p className="text-xl font-bold text-red-600">{report.data.taskSummary.completedLate}</p></div>
                <div><p className="text-xs text-gray-400">Active</p><p className="text-xl font-bold text-blue-600">{report.data.taskSummary.activeWorkload}</p></div>
              </div>
              <div className="text-sm">
                <span className="text-gray-400">On-time rate:</span> {report.data.performanceMetrics.onTimeRate ?? 'N/A'}%
                &nbsp;· <span className="text-gray-400">Missed deadlines:</span> {report.data.performanceMetrics.missedDeadlines}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
