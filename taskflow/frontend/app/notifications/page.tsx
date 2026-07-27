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
 * Lists unread notifications with the ability to mark individual or all as read.
 * SRS: FR-008.4 — "dedicated notification center where users can view and clear alerts"
 */
export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const load = () => { api.get('/notifications').then((r) => setNotifications(r.data)); };
  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    load();
  };

  const markAllRead = async () => {
    await api.patch('/notifications/read-all');
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {notifications.length > 0 && (
          <button onClick={markAllRead} className="text-sm text-blue-600 hover:underline">
            Mark all as read
          </button>
        )}
      </div>

      <div className="space-y-2">
        {notifications.map((n) => (
          <div key={n._id} className={`flex items-start justify-between bg-white rounded-lg shadow px-4 py-3 ${n.read ? 'opacity-60' : ''}`}>
            <div className="flex-1">
              <p className="text-sm">{n.message}</p>
              <p className="text-xs text-gray-400 mt-1">
                {n.type} · {new Date(n.createdAt).toLocaleString()}
                {n.task && <> · <Link href={`/tasks/${n.task._id}`} className="text-blue-600 hover:underline">{n.task.title}</Link></>}
              </p>
            </div>
            {!n.read && (
              <button onClick={() => markRead(n._id)} className="text-xs text-blue-600 hover:underline ml-4">
                Dismiss
              </button>
            )}
          </div>
        ))}
        {notifications.length === 0 && (
          <p className="text-sm text-gray-400">No notifications yet.</p>
        )}
      </div>
    </div>
  );
}
