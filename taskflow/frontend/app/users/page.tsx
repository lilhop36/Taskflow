'use client';

import { FormEvent, useEffect, useState } from 'react';
import api from '@/lib/api';
import { roleColor, userStatusBadge, errorMessage } from '@/lib/ui';
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
  // Inline edit state
  const [editingId, setEditingId] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('TeamMember');
  const [savingEdit, setSavingEdit] = useState(false);

  const load = () => {
    setError('');
    api.get('/users')
      .then((r) => setUsers(r.data))
      .catch(() => setError('Unable to load users.'));
  };
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
      setError(errorMessage(err, 'Failed to deactivate user'));
    }
  };

  // FR-002.2: inline edit of a user's profile (name, email, role) — Admin only,
  // backed by PATCH /users/:id. The backend re-validates role enum + BR-007 email
  // uniqueness and rejects any change with a clear message.
  const startEdit = (u: User) => {
    setEditingId(u._id);
    setEditFirstName(u.firstName);
    setEditLastName(u.lastName);
    setEditEmail(u.email);
    setEditRole(u.role);
    setError('');
  };

  const saveEdit = async () => {
    if (!editFirstName.trim() || !editLastName.trim()) return;
    setSavingEdit(true);
    setError('');
    try {
      await api.patch(`/users/${editingId}`, {
        firstName: editFirstName,
        lastName: editLastName,
        email: editEmail,
        role: editRole,
      });
      setEditingId('');
      load();
    } catch (err: any) {
      setError(errorMessage(err, 'Failed to update user'));
    }
    setSavingEdit(false);
  };

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
            {users.map((u) =>
              editingId === u._id ? (
                // Inline edit row — replaces the user's row while editing
                <tr key={u._id} className="bg-blue-50/50">
                  <td colSpan={isAdmin ? 5 : 4} className="px-4 py-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">First</label>
                        <input
                          value={editFirstName}
                          onChange={(e) => setEditFirstName(e.target.value)}
                          className="border rounded px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Last</label>
                        <input
                          value={editLastName}
                          onChange={(e) => setEditLastName(e.target.value)}
                          className="border rounded px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="border rounded px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="border rounded px-2 py-1.5 text-sm"
                        >
                          <option value="TeamMember">Team Member</option>
                          <option value="ProjectManager">Project Manager</option>
                          <option value="Administrator">Administrator</option>
                        </select>
                      </div>
                      <button
                        onClick={saveEdit}
                        disabled={savingEdit}
                        className="px-3 py-1.5 rounded text-xs bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingId('')}
                        className="px-3 py-1.5 rounded text-xs bg-gray-200 text-gray-700 hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={u._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{u.firstName} {u.lastName}</td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className={`px-4 py-3 font-medium ${roleColor(u.role)}`}>{u.role}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${userStatusBadge(u.status)}`}>
                      {u.status}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        {u.status === 'Active' && (
                          <button onClick={() => startEdit(u)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                            Edit
                          </button>
                        )}
                        {u.status === 'Active' && u._id !== user?._id && (
                          <button onClick={() => handleDeactivate(u._id)} className="text-red-600 hover:text-red-800 text-xs font-medium">
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
