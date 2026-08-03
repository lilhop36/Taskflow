'use client';

import { useEffect, useState, useMemo, FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/utils';
import { statusColor, canManage, errorMessage } from '@/lib/ui';

interface Task {
  _id: string; title: string; description: string; status: string; priority: string; dueDate: string;
  project?: { _id: string; name: string } | string;
  assignee?: { _id: string; firstName: string; lastName: string };
  createdBy?: { _id: string; firstName: string; lastName: string };
}

interface Member {
  _id: string; firstName: string; lastName: string; email?: string;
}

interface Comment {
  _id: string; content: string; createdAt: string; isEdited?: boolean;
  author?: { _id: string; firstName: string; lastName: string };
}

const statusTransitions: Record<string, string[]> = {
  'To Do': ['In Progress'],
  'In Progress': ['Done', 'To Do'],
  'Done': [],
};

/**
 * Task detail page — FR-005.4 status transitions + FR-007 comment thread.
 *
 * Shows full task info, allows status transitions via the state machine,
 * and displays a chronological comment thread at the bottom (FR-007.1).
 * SRS: FR-005.4, FR-007.1-3
 */
export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState('');
  const [newComment, setNewComment] = useState('');
  const [transitioning, setTransitioning] = useState('');
  // Assignee dropdown state
  const [members, setMembers] = useState<Member[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');
  // Comment edit state
  const [editingId, setEditingId] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [commentBusy, setCommentBusy] = useState('');

  const isPM = canManage(user?.role);

  // Reject malformed IDs (e.g. a hand-typed '/tasks/db-migration') before any
  // API call — the backend would otherwise return 400 for a non-ObjectId.
  const isInvalidId = !id || !/^[a-fA-F0-9]{24}$/.test(id);

  const load = () => {
    setError('');
    api.get(`/tasks/${id}`)
      .then((r) => {
        setTask(r.data);
        // Fetch the project's members so the "Assign to…" list mirrors BR-003
        // (owner + members array — the only users the backend accepts).
        const projectId =
          typeof r.data.project === 'string'
            ? r.data.project
            : r.data.project?._id;
        if (projectId) {
          api.get(`/projects/${projectId}`)
            .then((p) => {
              const list: Member[] = [];
              const seen = new Set<string>();
              for (const m of [p.data?.owner, ...(p.data?.members ?? [])]) {
                if (m && m._id && !seen.has(m._id)) {
                  seen.add(m._id);
                  list.push(m);
                }
              }
              setMembers(list);
            })
            .catch(() => setMembers([]));
        }
      })
      .catch(() => setError('Task not found or unavailable.'));
    api.get(`/tasks/${id}/comments`)
      .then((r) => setComments(r.data))
      .catch(() => setComments([]));
  };

  useEffect(() => { if (!isInvalidId) load(); }, [id, isInvalidId]);

  const handleTransition = async (status: string) => {
    setTransitioning(status);
    try {
      await api.patch(`/tasks/${id}/status`, { status });
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Transition rejected');
    }
    setTransitioning('');
  };

  // FR-008.1: reassign the task via PATCH /tasks/:id (PM/Admin only). The
  // backend re-validates BR-003 (project membership) and only notifies the
  // new assignee when the assignee actually changed.
  const handleAssign = async (assigneeId: string) => {
    if (!assigneeId || assigneeId === task?.assignee?._id) return;
    setAssigning(true);
    setAssignError('');
    try {
      await api.patch(`/tasks/${id}`, { assignee: assigneeId });
      load();
    } catch (err: any) {
      setAssignError(errorMessage(err, 'Failed to reassign task'));
    }
    setAssigning(false);
  };

  const handleComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      await api.post(`/tasks/${id}/comments`, { content: newComment });
      setNewComment('');
      load();
    } catch { alert('Failed to post comment'); }
  };

  // BR-005: edit a comment — the backend records the previous content in
  // editHistory and sets isEdited, preserving the audit trail.
  const startEdit = (c: Comment) => {
    setEditingId(c._id);
    setEditingContent(c.content);
  };

  const saveEdit = async () => {
    if (!editingContent.trim()) return;
    setCommentBusy(editingId);
    try {
      await api.patch(`/tasks/${id}/comments/${editingId}`, {
        content: editingContent,
      });
      setEditingId('');
      load();
    } catch (err: any) {
      alert(errorMessage(err, 'Failed to update comment'));
    }
    setCommentBusy('');
  };

  // BR-005: soft delete — the comment disappears from the thread but stays
  // in the DB with deletedAt/deletedBy for the audit trail.
  const deleteComment = async (commentId: string) => {
    if (!window.confirm('Delete this comment?')) return;
    setCommentBusy(commentId);
    try {
      await api.delete(`/tasks/${id}/comments/${commentId}`);
      load();
    } catch (err: any) {
      alert(errorMessage(err, 'Failed to delete comment'));
    }
    setCommentBusy('');
  };

  // Always include the current assignee in the dropdown, even if they were
  // removed from the project after assignment (BR-003 is only checked when
  // the assignee changes) — otherwise the controlled select would render
  // blank on an assigned task. (Computed unconditionally: hooks must run
  // before the conditional early returns below.)
  const assigneeOptions = useMemo(() => {
    if (members.some((m) => m._id === task?.assignee?._id)) return members;
    return task?.assignee ? [task.assignee as Member, ...members] : members;
  }, [members, task?.assignee]);

  if (isInvalidId || error) {
    return (
      <div>
        <Link href="/tasks" className="text-sm text-blue-600 hover:underline">&larr; Back to tasks</Link>
        <p className="mt-6 text-gray-500">{isInvalidId ? 'Task not found.' : error}</p>
      </div>
    );
  }

  if (!task) return <p className="text-gray-400 text-sm">Loading…</p>;

  const allowed = statusTransitions[task.status] ?? [];

  return (
    <div>
      <Link href="/tasks" className="text-sm text-blue-600 hover:underline">&larr; Back to tasks</Link>

      <div className="bg-white rounded-lg shadow p-6 mt-3 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{task.title}</h1>
            <p className="text-sm text-gray-500 mt-1">{task.description}</p>
          </div>
          <span className={`text-sm font-medium ${statusColor(task.status)}`}>{task.status}</span>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
          <div><span className="text-gray-400">Project:</span> {typeof task.project === 'string' ? '—' : (task.project?.name ?? '—')}</div>
          <div><span className="text-gray-400">Assignee:</span> {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : '—'}</div>
          <div><span className="text-gray-400">Priority:</span> {task.priority}</div>
          <div><span className="text-gray-400">Due:</span> {formatDate(task.dueDate)}</div>
        </div>

        {allowed.length > 0 && (
          <div className="mt-4 flex gap-2">
            {allowed.map((s) => (
              <button key={s} onClick={() => handleTransition(s)}
                disabled={transitioning === s}
                className="px-4 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {transitioning === s ? '…' : `Move to ${s}`}
              </button>
            ))}
          </div>
        )}

        {/* FR-008.1: reassign the task to another project member (PM/Admin) */}
        {isPM && members.length > 0 && (
          <div className="mt-4 flex items-center gap-2 border-t pt-3">
            <label htmlFor="assignee" className="text-sm text-gray-600 font-medium">
              Assign to:
            </label>
            <select
              id="assignee"
              value={task.assignee?._id ?? ''}
              onChange={(e) => handleAssign(e.target.value)}
              disabled={assigning}
              className="border rounded px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="" disabled>Select a member…</option>
              {assigneeOptions.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.firstName} {m.lastName}
                </option>
              ))}
            </select>
            {assigning && <span className="text-xs text-gray-400">Reassigning…</span>}
            {assignError && <span className="text-xs text-red-600">{assignError}</span>}
          </div>
        )}
      </div>

      {/* Comment thread — FR-007.1-3 */}
      <h2 className="text-lg font-semibold mb-3">Comments ({comments.length})</h2>
      <div className="space-y-3 mb-4">
        {comments.map((c) => (
          <div key={c._id} className="bg-white rounded-lg shadow px-4 py-3">
            {editingId === c._id ? (
              <div>
                <textarea
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  rows={2}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={saveEdit}
                    disabled={commentBusy === c._id}
                    className="px-3 py-1 rounded text-xs bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {commentBusy === c._id ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingId('')}
                    className="px-3 py-1 rounded text-xs bg-gray-200 text-gray-700 hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm">{c.content}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-400">
                    {c.author ? `${c.author.firstName} ${c.author.lastName}` : 'Unknown'}
                    &nbsp;· {formatDate(c.createdAt)}
                    {c.isEdited && <span className="text-gray-300"> (edited)</span>}
                  </p>
                  {/* BR-005: edit/soft-delete with audit trail (project members) */}
                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={() => startEdit(c)}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteComment(c._id)}
                      disabled={commentBusy === c._id}
                      className="text-red-600 hover:underline disabled:opacity-50"
                    >
                      {commentBusy === c._id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
        {comments.length === 0 && <p className="text-sm text-gray-400">No comments yet.</p>}
      </div>

      <form onSubmit={handleComment} className="flex gap-2">
        <input
          value={newComment} onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment… (FR-007.2)"
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
          Post
        </button>
      </form>
    </div>
  );
}
