'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface User {
  _id: string; firstName: string; lastName: string; email: string;
  role: string; status: string;
}

/**
 * User management page — FR-002 (Admin only)
 *
 * Lists all users with role and status. Admin can view the user directory.
 * SRS: FR-002.1-3 — user creation, modification, deactivation
 * (CRUD actions are wireframed here; full forms added when auth guards are ready).
 */
export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => { api.get('/users').then((r) => setUsers(r.data)); }, []);

  const roleColor = (r: string) =>
    r === 'Administrator' ? 'text-purple-600' : r === 'ProjectManager' ? 'text-blue-600' : 'text-gray-600';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Users (FR-002)</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u._id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{u.firstName} {u.lastName}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className={`px-4 py-3 font-medium ${roleColor(u.role)}`}>{u.role}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${u.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
