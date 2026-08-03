'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface Notification {
  _id: string; type: string; message: string; read: boolean; createdAt: string;
  task?: { _id: string; title: string };
}

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {view === 'unread' && notifications.length > 0 && (
          <button onClick={markAllRead} className="text-sm text-blue-600 hover:underline">
            Mark all as read
          </button>
        )}
      </div>

      {/* Unread / History toggle */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setView('unread')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'unread'
              ? 'bg-white text-gray-900 shadow'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Unread {unreadCount > 0 && <span className="ml-1 text-xs text-blue-600 font-semibold">({unreadCount})</span>}
        </button>
        <button
          onClick={() => setView('history')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'history'
              ? 'bg-white text-gray-900 shadow'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          History
        </button>
      </div>

      <div className="space-y-2">
        {notifications.map((n) => (
          <div key={n._id} className={`flex items-start justify-between bg-white rounded-lg shadow px-4 py-3 ${n.read ? 'opacity-60' : ''}`}>
            <div className="flex-1">
              <p className="text-sm">{n.message}</p>
              <p className="text-xs text-gray-400 mt-1">
                {n.type} · {new Date(n.createdAt).toLocaleString()}
                {n.task && /^[a-fA-F0-9]{24}$/.test(n.task._id) && (
                  <> · <Link href={`/tasks/${n.task._id}`} className="text-blue-600 hover:underline">{n.task.title}</Link></>
                )}
              </p>
            </div>
            {!n.read && view === 'unread' && (
              <button onClick={() => markRead(n._id)} className="text-xs text-blue-600 hover:underline ml-4">
                Dismiss
              </button>
            )}
            {n.read && view === 'history' && (
              <span className="text-xs text-gray-300 ml-4 shrink-0">read</span>
            )}
          </div>
        ))}
        {notifications.length === 0 && (
          <p className="text-sm text-gray-400">
            {view === 'unread' ? 'No unread notifications.' : 'No notification history yet.'}
          </p>
        )}
      </div>
    </div>
  );
}
