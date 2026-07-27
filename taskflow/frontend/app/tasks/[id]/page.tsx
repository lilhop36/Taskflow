'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

interface Task {
  _id: string; title: string; description: string; status: string; priority: string; dueDate: string;
  project?: { _id: string; name: string };
  assignee?: { _id: string; firstName: string; lastName: string };
  createdBy?: { _id: string; firstName: string; lastName: string };
}

interface Comment {
  _id: string; content: string; createdAt: string;
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
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [transitioning, setTransitioning] = useState('');

  const load = () => {
    api.get(`/tasks/${id}`).then((r) => setTask(r.data));
    api.get(`/tasks/${id}/comments`).then((r) => setComments(r.data));
  };

  useEffect(() => { load(); }, [id]);

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

  const handleComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      await api.post(`/tasks/${id}/comments`, { content: newComment });
      setNewComment('');
      load();
    } catch { alert('Failed to post comment'); }
  };

  if (!task) return <p className="text-gray-400 text-sm">Loading…</p>;

  const allowed = statusTransitions[task.status] ?? [];
  const statusColor = (s: string) =>
    s === 'Done' ? 'text-green-600' : s === 'In Progress' ? 'text-blue-600' : 'text-gray-500';

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
          <div><span className="text-gray-400">Project:</span> {task.project?.name ?? '—'}</div>
          <div><span className="text-gray-400">Assignee:</span> {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : '—'}</div>
          <div><span className="text-gray-400">Priority:</span> {task.priority}</div>
          <div><span className="text-gray-400">Due:</span> {new Date(task.dueDate).toLocaleDateString()}</div>
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
      </div>

      {/* Comment thread — FR-007.1-3 */}
      <h2 className="text-lg font-semibold mb-3">Comments ({comments.length})</h2>
      <div className="space-y-3 mb-4">
        {comments.map((c) => (
          <div key={c._id} className="bg-white rounded-lg shadow px-4 py-3">
            <p className="text-sm">{c.content}</p>
            <p className="text-xs text-gray-400 mt-1">
              {c.author ? `${c.author.firstName} ${c.author.lastName}` : 'Unknown'}
              &nbsp;· {new Date(c.createdAt).toLocaleString()}
            </p>
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
