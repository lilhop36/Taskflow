'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface Notification {
  _id: string; type: string; message: string; read: boolean; createdAt: string;
  task?: { _id: string; title: string };
  comment?: string;
}

/** Short human label for each alert type. */
const TYPE_LABEL: Record<string, string> = {
  CommentCreated: 'Comment',
  TaskAssigned: 'Assigned',
  TaskStatusChanged: 'Status',
  TaskDeadlineUrgent: 'Deadline',
};

/**
 * Notification center — FR-008.4
 *
 * Two views backed by GET /notifications:
 * - "Unread" (default, no param): the inbox — only unread alerts.
 * - "History" (?includeRead=true): full read + unread history so users
 *   can revisit alerts they already dismissed.
 *
 * SRS: FR-008.4 — "dedicated notification center where users can view and clear alerts"
 */
export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [view, setView] = useState<'unread' | 'history'>('unread');

  const load = () => {
    const suffix = view === 'history' ? '?includeRead=true' : '';
    api.get(`/notifications${suffix}`).then((r) => setNotifications(r.data));
  };
  useEffect(() => { load(); }, [view]);

  const markRead = async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    load();
  };

  const markAllRead = async () => {
    await api.patch('/notifications/read-all');
    load();
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="eyebrow">Alert center</p>
          <h1 className="page-title mt-1">Notifications</h1>
          <span className="thread mt-3 w-14" aria-hidden="true" />
        </div>
        {view === 'unread' && notifications.length > 0 && (
          <button onClick={markAllRead} className="btn-ghost">
            Mark all as read
          </button>
        )}
      </header>

      {/* Unread / History toggle */}
      <div className="mb-6 flex gap-1 rounded-lg border border-black/10 bg-card p-1 w-fit">
        <button
          onClick={() => setView('unread')}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
            view === 'unread'
              ? 'bg-ink text-card'
              : 'text-sage hover:text-ink'
          }`}
        >
          Unread {unreadCount > 0 && (
            <span className={`ml-1 font-mono text-xs ${view === 'unread' ? 'text-gold' : 'text-gold-deep'}`}>
              ({unreadCount})
            </span>
          )}
        </button>
        <button
          onClick={() => setView('history')}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
            view === 'history'
              ? 'bg-ink text-card'
              : 'text-sage hover:text-ink'
          }`}
        >
          History
        </button>
      </div>

      <div className="space-y-2">
        {notifications.map((n) => (
          <div
            key={n._id}
            className={`card relative flex items-start justify-between px-5 py-4 ${
              n.read ? 'opacity-60' : 'border-gold/40'
            }`}
          >
            {!n.read && (
              <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gold" aria-hidden="true" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm leading-relaxed ${n.read ? 'text-sage' : 'text-ink'}`}>{n.message}</p>
              <p className="mt-1.5 font-mono text-[11px] text-sage">
                <span className="text-gold-deep">{TYPE_LABEL[n.type] ?? n.type}</span>
                {' · '}{new Date(n.createdAt).toLocaleString()}
                {n.task && /^[a-fA-F0-9]{24}$/.test(n.task._id) && (
                  <> ·{' '}
                    <Link
                      href={`/tasks/${n.task._id}${n.comment ? `#comment-${n.comment}` : ''}`}
                      className="text-gold-deep underline-offset-2 hover:underline"
                    >
                      {n.task.title}
                    </Link>
                  </>
                )}
              </p>
            </div>
            {!n.read && view === 'unread' && (
              <button onClick={() => markRead(n._id)} className="ml-4 shrink-0 text-xs font-semibold text-gold-deep hover:underline">
                Dismiss
              </button>
            )}
            {n.read && view === 'history' && (
              <span className="ml-4 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-sand">read</span>
            )}
          </div>
        ))}
        {notifications.length === 0 && (
          <p className="card px-5 py-10 text-center text-sm text-sage">
            {view === 'unread' ? 'No unread notifications. The flow is quiet.' : 'No notification history yet.'}
          </p>
        )}
      </div>
    </div>
  );
}
