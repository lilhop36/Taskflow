'use client';

import { FormEvent, useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface User {
  _id: string; firstName: string; lastName: string; email: string;
  role: string; status: string;
}

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('TeamMember');
  const [error, setError] = useState('');

  const load = () => api.get('/users').then((r) => setUsers(r.data));
  useEffect(() => { load(); }, []);

  const isAdmin = user?.role === 'Administrator';

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/users', { firstName, lastName, email, password, role });
      setShowForm(false);
      setFirstName(''); setLastName(''); setEmail(''); setPassword(''); setRole('TeamMember');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create user');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await api.patch(`/users/${id}/deactivate`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to deactivate user');
    }
  };

  const roleColor = (r: string) =>
    r === 'Administrator' ? 'text-purple-600' : r === 'ProjectManager' ? 'text-blue-600' : 'text-gray-600';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Users (FR-002)</h1>
        {isAdmin && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : 'New User'}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg shadow mb-6 space-y-4 max-w-md">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">First Name</label>
              <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Last Name</label>
              <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
              <option value="TeamMember">Team Member</option>
              <option value="ProjectManager">Project Manager</option>
              <option value="Administrator">Administrator</option>
            </select>
          </div>
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700">
            Create User
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {isAdmin && <th className="px-4 py-3 font-medium">Actions</th>}
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
                {isAdmin && (
                  <td className="px-4 py-3">
                    {u.status === 'Active' && u._id !== user?._id && (
                      <button onClick={() => handleDeactivate(u._id)} className="text-red-600 hover:text-red-800 text-xs font-medium">
                        Deactivate
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
