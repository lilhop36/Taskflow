'use client';

import { useEffect, useState, useMemo, FormEvent, ReactNode } from 'react';
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
  replyTo?: string;
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
  // Threaded comments: which comment we're currently replying to
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [replyContent, setReplyContent] = useState('');

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

  // Deep-link from a notification (/tasks/:id#comment-<id>): scroll the
  // referenced comment into view and highlight it briefly once the thread loads.
  useEffect(() => {
    if (comments.length === 0) return;
    const match = window.location.hash.match(/^#comment-(.+)$/);
    if (!match) return;
    const el = document.getElementById(`comment-${match[1]}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-gold');
      setTimeout(() => el.classList.remove('ring-2', 'ring-gold'), 2500);
    }
  }, [comments]);

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

  // Threaded comments: post a reply nested under its parent comment, then
  // refresh the thread so the reply appears in place (chronological order).
  const handleReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!replyTo || !replyContent.trim()) return;
    try {
      await api.post(`/tasks/${id}/comments`, {
        content: replyContent,
        replyTo: replyTo.id,
      });
      setReplyContent('');
      setReplyTo(null);
      load();
    } catch (err: any) {
      alert(errorMessage(err, 'Failed to post reply'));
    }
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

  // Threaded comment tree: parent comment id -> its replies (chronological).
  // A reply whose parent is missing (deleted / not yet fetched) renders at
  // top level rather than being orphaned.
  const byId = useMemo(() => new Map(comments.map((c) => [c._id, c])), [comments]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, Comment[]>();
    for (const c of comments) {
      if (c.replyTo && byId.has(c.replyTo)) {
        const list = m.get(c.replyTo) ?? [];
        list.push(c);
        m.set(c.replyTo, list);
      }
    }
    return m;
  }, [comments, byId]);
  const topLevelComments = comments.filter((c) => !c.replyTo || !byId.has(c.replyTo));

  if (isInvalidId || error) {
    return (
      <div>
        <Link href="/tasks" className="text-sm text-gold-deep hover:underline">&larr; Back to tasks</Link>
        <p className="mt-6 text-sage">{isInvalidId ? 'Task not found.' : error}</p>
      </div>
    );
  }

  if (!task) return <p className="text-sage text-sm">Loading…</p>;

  const allowed = statusTransitions[task.status] ?? [];

  // BR-005: edit/delete is author-only; PM/Admin moderate. Non-authors who
  // are not moderators see no edit/delete controls (the backend enforces it).
  const canModerate = canManage(user?.role);
  const renderComment = (c: Comment): ReactNode => {
    const isAuthor = user?._id === c.author?._id;
    const showActions = isAuthor || canModerate;
    const parent = c.replyTo ? byId.get(c.replyTo) : undefined;
    return (
      <div
        key={c._id}
        id={`comment-${c._id}`}
        className="card px-5 py-4 transition-shadow"
      >
        {editingId === c._id ? (
          <div>
            <textarea
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              rows={2}
              className="input"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={saveEdit}
                disabled={commentBusy === c._id}
                className="rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
              >
                {commentBusy === c._id ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setEditingId('')}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink">{c.content}</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="font-mono text-[11px] text-sage">
                {c.author ? `${c.author.firstName} ${c.author.lastName}` : 'Unknown'}
                &nbsp;· {formatDate(c.createdAt)}
                {c.isEdited && <span className="text-sand"> (edited)</span>}
                {parent && (
                  <span className="text-sand">
                    &nbsp;· in reply to{' '}
                    <span className="text-gold-deep">
                      {parent.author ? `${parent.author.firstName} ${parent.author.lastName}` : 'Unknown'}
                    </span>
                  </span>
                )}
              </p>
              <div className="flex gap-3 text-xs shrink-0">
                <button
                  onClick={() => {
                    setReplyTo({
                      id: c._id,
                      name: c.author
                        ? `${c.author.firstName} ${c.author.lastName}`
                        : 'comment',
                    });
                    setEditingId('');
                  }}
                  className="font-semibold text-gold-deep hover:underline"
                >
                  Reply
                </button>
                {showActions && (
                  <>
                    <button
                      onClick={() => startEdit(c)}
                      className="font-semibold text-teal hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteComment(c._id)}
                      disabled={commentBusy === c._id}
                      className="font-semibold text-ember hover:underline disabled:opacity-50"
                    >
                      {commentBusy === c._id ? '…' : 'Delete'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
        {/* Nested replies — indented under the parent, threaded with a gold seam */}
        {(childrenOf.get(c._id) ?? []).length > 0 && (
          <div className="mt-3 ml-4 space-y-3 border-l-2 border-gold/25 pl-4">
            {(childrenOf.get(c._id) ?? []).map(renderComment)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <Link href="/tasks" className="text-sm text-gold-deep hover:underline">&larr; Back to tasks</Link>

      <div className="card p-6 mt-3 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Task detail</p>
            <h1 className="page-title mt-1">{task.title}</h1>
            <p className="mt-2 text-sm text-sage leading-relaxed">{task.description}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] ${statusColor(task.status)}`}>
            {task.status}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm border-t border-black/5 pt-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Project</p>
            <p className="mt-0.5 font-medium text-ink">{typeof task.project === 'string' ? '—' : (task.project?.name ?? '—')}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Assignee</p>
            <p className="mt-0.5 font-medium text-ink">{task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : '—'}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Priority</p>
            <p className="mt-0.5 font-medium text-ink">{task.priority}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Due</p>
            <p className="mt-0.5 font-medium font-mono text-ink">{formatDate(task.dueDate)}</p>
          </div>
        </div>

        {allowed.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-black/5 pt-4">
            {allowed.map((s) => (
              <button
                key={s}
                onClick={() => handleTransition(s)}
                disabled={transitioning === s}
                className="btn-gold"
              >
                {transitioning === s ? '…' : `Move to ${s}`}
              </button>
            ))}
          </div>
        )}

        {/* FR-008.1: reassign the task to another project member (PM/Admin) */}
        {isPM && members.length > 0 && (
          <div className="mt-5 flex items-center gap-2 border-t border-black/5 pt-4">
            <label htmlFor="assignee" className="font-mono text-[11px] uppercase tracking-[0.12em] text-sage">
              Assign to
            </label>
            <select
              id="assignee"
              value={task.assignee?._id ?? ''}
              onChange={(e) => handleAssign(e.target.value)}
              disabled={assigning}
              className="rounded-md border border-black/10 bg-card px-3 py-1.5 text-sm text-ink focus:border-gold focus:outline-none disabled:opacity-50"
            >
              <option value="" disabled>Select a member…</option>
              {assigneeOptions.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.firstName} {m.lastName}
                </option>
              ))}
            </select>
            {assigning && <span className="font-mono text-[11px] text-sage">Reassigning…</span>}
            {assignError && <span className="text-xs text-ember">{assignError}</span>}
          </div>
        )}
      </div>

      {/* Comment thread — FR-007.1-3 (threaded replies) */}
      <header className="mb-4">
        <p className="eyebrow">Discussion</p>
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          Comments <span className="font-mono text-sm font-medium text-sage">({comments.length})</span>
        </h2>
      </header>
      <div className="space-y-3 mb-4">
        {topLevelComments.map(renderComment)}
        {comments.length === 0 && (
          <p className="card px-5 py-8 text-center text-sm text-sage">
            No comments yet — start the discussion.
          </p>
        )}
      </div>

      {/* Reply box — appears when the user clicks "Reply" on a comment */}
      {replyTo && (
        <form onSubmit={handleReply} className="card mb-3 flex gap-2 items-center border-gold/40 bg-gold-soft/50 px-4 py-2.5">
          <span className="font-mono text-[11px] text-gold-deep whitespace-nowrap">
            Replying to <span className="font-semibold">{replyTo.name}</span>
          </span>
          <input
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Write a reply…"
            autoFocus
            className="input flex-1"
          />
          <button type="submit" disabled={!replyContent.trim()} className="btn-gold">
            Reply
          </button>
          <button
            type="button"
            onClick={() => { setReplyTo(null); setReplyContent(''); }}
            className="text-xs font-semibold text-sage hover:underline"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Top-level comment form — new threads only */}
      <form onSubmit={handleComment} className="flex gap-2">
        <input
          value={newComment} onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment…"
          className="input flex-1"
        />
        <button type="submit" className="btn-gold">
          Post
        </button>
      </form>
    </div>
  );
}
