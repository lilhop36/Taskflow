'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { canManage, errorMessage } from '@/lib/ui';
import { useAuth } from '@/contexts/AuthContext';
import {
  BoardTask,
  useSprint,
  useSprintBoard,
  useSprintBurndown,
  useSprintReport,
  startSprint,
  completeSprint,
  addTasksToSprint,
  removeTaskFromSprint,
  updateTaskStatus,
  nextStatuses,
  prevStatuses,
} from '@/hooks/useSprints';

const columnStyles: Record<string, string> = {
  Backlog: 'bg-sage/10',
  'To Do': 'bg-black/5',
  'In Progress': 'bg-gold-soft/60',
  'In Review': 'bg-ember-soft/50',
  Done: 'bg-teal-soft/60',
};

const priorityStyles: Record<string, string> = {
  High: 'bg-ember-soft text-ember',
  Medium: 'bg-gold-soft text-gold-deep',
  Low: 'bg-black/5 text-sage',
};

interface RawTask {
  _id: string;
  title: string;
  status: string;
  sprintId?: string | null;
}

export default function SprintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isPM = canManage(user?.role);

  const { data: sprint, loading: sprintLoading, refetch: refetchSprint } = useSprint(id);
  const { data: board, loading: boardLoading, refetch: refetchBoard } = useSprintBoard(id);
  const { data: burndown } = useSprintBurndown(id);
  const { data: report, refetch: refetchReport } = useSprintReport(isPM ? id : undefined);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'error' | 'ok'; text: string } | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [availableTasks, setAvailableTasks] = useState<RawTask[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  const projectId = typeof sprint?.project === 'object' ? sprint.project._id : undefined;

  const allTasks = useMemo(() => {
    const map = new Map<string, BoardTask>();
    board?.forEach((col) => col.tasks.forEach((t) => map.set(t._id, t)));
    return map;
  }, [board]);

  const flash = (type: 'error' | 'ok', text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 4000);
  };

  const loadAvailableTasks = async () => {
    if (!projectId) return;
    try {
      const res = await api.get('/tasks', { params: { project: projectId, limit: 200 } });
      const tasks: RawTask[] = res.data.data ?? res.data;
      setAvailableTasks(tasks.filter((t) => t.sprintId !== id && t.status !== 'Archived'));
      setSelected([]);
    } catch {
      setAvailableTasks([]);
    }
  };

  const toggleAddModal = (open: boolean) => {
    setShowAddModal(open);
    if (open) loadAvailableTasks();
  };

  const handleAdd = async () => {
    if (!selected.length) return;
    setBusy(true);
    try {
      await addTasksToSprint(id, selected);
      setShowAddModal(false);
      flash('ok', `Added ${selected.length} task(s) to the sprint.`);
      refetchBoard();
      refetchSprint();
      refetchReport();
    } catch (err) {
      flash('error', errorMessage(err, 'Failed to add tasks.'));
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (task: BoardTask, direction: 'forward' | 'back') => {
    const candidates = direction === 'forward' ? nextStatuses(task.status) : prevStatuses(task.status);
    if (!candidates.length) return;
    setBusy(true);
    try {
      await updateTaskStatus(task._id, candidates[0]);
      flash('ok', `Task moved to ${candidates[0]}.`);
      refetchBoard();
      refetchReport();
    } catch (err) {
      flash('error', errorMessage(err, 'Cannot move task.'));
    } finally {
      setBusy(false);
    }
  };

  const canMoveTask = (task: BoardTask) => isPM || task.assignee?._id === user?._id;

  const doStart = async () => {
    setBusy(true);
    try {
      await startSprint(id);
      flash('ok', 'Sprint is now active.');
      refetchSprint();
      refetchReport();
    } catch (err) {
      flash('error', errorMessage(err, 'Failed to start sprint.'));
    } finally {
      setBusy(false);
    }
  };

  const doComplete = async () => {
    setBusy(true);
    try {
      await completeSprint(id);
      flash('ok', 'Sprint completed.');
      refetchSprint();
      refetchBoard();
      refetchReport();
    } catch (err) {
      flash('error', errorMessage(err, 'Failed to complete sprint.'));
    } finally {
      setBusy(false);
    }
  };

  const removeFromSprint = async (taskId: string) => {
    setBusy(true);
    try {
      await removeTaskFromSprint(id, taskId);
      flash('ok', 'Task moved back to the backlog.');
      refetchBoard();
      refetchSprint();
      refetchReport();
    } catch (err) {
      flash('error', errorMessage(err, 'Failed to remove task.'));
    } finally {
      setBusy(false);
    }
  };

  const stats = useMemo(() => {
    const tasks = [...allTasks.values()];
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'Done').length;
    const overdue = tasks.filter((t) => t.status !== 'Done' && new Date(t.dueDate) < new Date()).length;
    const blocked = tasks.filter((t) => t.isBlocked).length;
    return { total, done, overdue, blocked, percent: total ? Math.round((done / total) * 100) : 0 };
  }, [allTasks]);

  if (sprintLoading || boardLoading) {
    return <p className="card px-5 py-10 text-center text-sm text-sage">Loading sprint…</p>;
  }

  if (!sprint) {
    return <p className="card px-5 py-10 text-center text-sm text-ember">Sprint not found.</p>;
  }

  return (
    <div className="space-y-6">
      <Link href="/sprints" className="text-xs font-semibold text-gold-deep hover:underline">
        &larr; Back to sprints
      </Link>

      {notice && (
        <p
          className={`rounded-md px-4 py-2.5 text-sm ${
            notice.type === 'error' ? 'bg-ember-soft text-ember' : 'bg-teal-soft text-teal'
          }`}
        >
          {notice.text}
        </p>
      )}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">{sprint.name}</h1>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                sprint.status === 'Active'
                  ? 'bg-gold-soft text-gold-deep'
                  : sprint.status === 'Completed'
                    ? 'bg-teal-soft text-teal'
                    : 'bg-black/5 text-sage'
              }`}
            >
              {sprint.status}
            </span>
          </div>
          {typeof sprint.project === 'object' && (
            <Link href={`/projects/${sprint.project._id}`} className="mt-1 inline-block text-sm text-gold-deep hover:underline">
              {sprint.project.name}
            </Link>
          )}
          <p className="mt-1 font-mono text-[11px] text-sage">
            {formatDate(sprint.startDate)} – {formatDate(sprint.endDate)}
          </p>
          {sprint.goal && <p className="mt-2 max-w-xl text-sm text-sage">{sprint.goal}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isPM && sprint.status === 'Planned' && (
            <button className="btn-gold" onClick={doStart} disabled={busy}>
              Start sprint
            </button>
          )}
          {isPM && sprint.status === 'Active' && (
            <button className="btn-ghost" onClick={doComplete} disabled={busy}>
              Complete sprint
            </button>
          )}
          {isPM && sprint.status !== 'Completed' && (
            <button className="btn-ghost" onClick={() => toggleAddModal(true)}>
              + Add tasks
            </button>
          )}
          {isPM && allTasks.size > 0 && (
            <button className="btn-ghost" onClick={() => setShowRemoveModal(true)}>
              Manage tasks
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: 'Total tasks', value: stats.total, color: 'text-ink' },
          { label: 'Done', value: stats.done, color: 'text-teal' },
          { label: 'Completion', value: `${stats.percent}%`, color: 'text-gold-deep' },
          { label: 'Overdue', value: stats.overdue, color: stats.overdue ? 'text-ember' : 'text-sage' },
          { label: 'Blocked', value: stats.blocked, color: stats.blocked ? 'text-ember' : 'text-sage' },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <p className="eyebrow">{s.label}</p>
            <p className={`mt-1 font-display text-2xl font-semibold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {board?.map((col) => (
          <div key={col.status} className={`rounded-lg border border-black/5 p-2 ${columnStyles[col.status] ?? 'bg-black/5'}`}>
            <div className="flex items-center justify-between px-1 py-1.5">
              <h3 className="eyebrow">{col.status}</h3>
              <span className="font-mono text-[11px] text-sage">{col.tasks.length}</span>
            </div>
            <div className="space-y-2">
              {col.tasks.map((task) => (
                <div key={task._id} className="card space-y-2 p-2.5">
                  <Link href={`/tasks/${task._id}`} className="block text-sm font-medium text-ink hover:text-gold-deep">
                    {task.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${priorityStyles[task.priority] ?? 'bg-black/5 text-sage'}`}>
                      {task.priority}
                    </span>
                    {task.isBlocked && (
                      <span className="rounded bg-ember-soft px-1.5 py-0.5 text-[10px] font-semibold text-ember">
                        Blocked
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-sage">
                    <span className="truncate">
                      {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : 'Unassigned'}
                    </span>
                    <span className="shrink-0">Due {formatDate(task.dueDate)}</span>
                  </div>
                  {canMoveTask(task) && task.status !== 'Done' && (
                    <div className="flex gap-1">
                      {prevStatuses(task.status).length > 0 && (
                        <button
                          onClick={() => handleMove(task, 'back')}
                          disabled={busy}
                          className="flex-1 rounded border border-black/10 px-2 py-1 text-[11px] text-sage hover:border-gold hover:text-ink"
                        >
                          &larr; {prevStatuses(task.status)[0]}
                        </button>
                      )}
                      {nextStatuses(task.status).length > 0 && (
                        <button
                          onClick={() => handleMove(task, 'forward')}
                          disabled={busy}
                          className="flex-1 rounded border border-black/10 px-2 py-1 text-[11px] text-sage hover:border-gold hover:text-ink"
                        >
                          {nextStatuses(task.status)[0]} &rarr;
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {col.tasks.length === 0 && (
                <p className="py-3 text-center font-mono text-[11px] text-sage/70">No tasks</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {burndown && burndown.days.length > 0 && (
        <div className="card p-5">
          <h3 className="font-display text-lg font-semibold text-ink">Burndown</h3>
          <p className="eyebrow mt-0.5">Remaining work vs ideal line</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={burndown.days} margin={{ top: 5, right: 20, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#00000012" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="actual" name="Remaining" stroke="#14736a" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="ideal" name="Ideal" stroke="#a99f89" strokeWidth={2} strokeDasharray="6 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {report && report.velocity.length > 0 && (
        <div className="card p-5">
          <h3 className="font-display text-lg font-semibold text-ink">Previous sprint velocity</h3>
          <p className="eyebrow mt-0.5">Completed work per finished sprint</p>
          <div className="mt-4 space-y-3">
            {report.velocity.map((v) => (
              <div key={v.sprintId} className="flex items-center justify-between gap-4 text-sm">
                <Link href={`/sprints/${v.sprintId}`} className="font-medium text-gold-deep hover:underline">
                  {v.name}
                </Link>
                <div className="flex flex-1 items-center justify-end gap-3">
                  <span className="font-mono text-[11px] text-sage">
                    {v.completedTasks}/{v.totalTasks} tasks
                  </span>
                  <div className="h-1.5 w-32 rounded-full bg-black/5 overflow-hidden">
                    <div className="h-full rounded-full bg-teal" style={{ width: `${v.completionPercent}%` }} />
                  </div>
                  <span className="w-10 text-right font-mono text-[11px] text-sage">{v.completionPercent}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="card w-full max-w-lg p-6">
            <h2 className="font-display text-xl font-semibold text-ink">Add tasks to sprint</h2>
            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
              {availableTasks.length === 0 ? (
                <p className="py-6 text-center text-sm text-sage">
                  No backlog tasks available for this project.
                </p>
              ) : (
                availableTasks.map((t) => (
                  <label
                    key={t._id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-black/5 px-3 py-2 hover:border-gold"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(t._id)}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked ? [...prev, t._id] : prev.filter((x) => x !== t._id),
                        )
                      }
                      className="h-4 w-4 rounded border-black/20 accent-gold"
                    />
                    <span className="text-sm text-ink">{t.title}</span>
                    <span className="ml-auto font-mono text-[10px] text-sage">{t.status}</span>
                  </label>
                ))
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button className="btn-gold" onClick={handleAdd} disabled={!selected.length || busy}>
                Add selected ({selected.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {showRemoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="card w-full max-w-lg p-6">
            <h2 className="font-display text-xl font-semibold text-ink">Remove tasks from sprint</h2>
            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
              {[...allTasks.values()].map((t) => (
                <div
                  key={t._id}
                  className="flex items-center justify-between gap-3 rounded-md border border-black/5 px-3 py-2"
                >
                  <Link href={`/tasks/${t._id}`} className="text-sm text-ink hover:text-gold-deep">
                    {t.title}
                  </Link>
                  <button
                    className="btn-danger-text"
                    onClick={() => removeFromSprint(t._id)}
                    disabled={busy}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {allTasks.size === 0 && <p className="py-6 text-center text-sm text-sage">No tasks in this sprint.</p>}
            </div>
            <div className="mt-6 flex justify-end">
              <button className="btn-ghost" onClick={() => setShowRemoveModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}