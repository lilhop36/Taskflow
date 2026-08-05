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
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="eyebrow">Directory</p>
          <h1 className="page-title mt-1">Users</h1>
          <span className="thread mt-3 w-14" aria-hidden="true" />
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className={showForm ? 'btn-ghost' : 'btn-gold'}
          >
            {showForm ? 'Cancel' : 'New user'}
          </button>
        )}
      </header>

      {error && (
        <p className="mb-4 text-sm text-ember bg-ember-soft border border-ember/30 rounded-md px-3 py-2">{error}</p>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-6 mb-6 space-y-4 max-w-md">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">First Name</label>
              <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Last Name</label>
              <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="input">
              <option value="TeamMember">Team Member</option>
              <option value="ProjectManager">Project Manager</option>
              <option value="Administrator">Administrator</option>
            </select>
          </div>
          <button type="submit" className="btn-gold">Create user</button>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-black/5 bg-black/[0.02] text-left">
            <tr>
              <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Name</th>
              <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Email</th>
              <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Role</th>
              <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Status</th>
              {isAdmin && <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-sage">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {users.map((u) =>
              editingId === u._id ? (
                // Inline edit row — replaces the user's row while editing
                <tr key={u._id} className="bg-gold-soft/40">
                  <td colSpan={isAdmin ? 5 : 4} className="px-5 py-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-xs font-medium text-sage mb-1">First</label>
                        <input
                          value={editFirstName}
                          onChange={(e) => setEditFirstName(e.target.value)}
                          className="input w-32"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-sage mb-1">Last</label>
                        <input
                          value={editLastName}
                          onChange={(e) => setEditLastName(e.target.value)}
                          className="input w-32"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-sage mb-1">Email</label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="input w-44"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-sage mb-1">Role</label>
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="input w-40"
                        >
                          <option value="TeamMember">Team Member</option>
                          <option value="ProjectManager">Project Manager</option>
                          <option value="Administrator">Administrator</option>
                        </select>
                      </div>
                      <button
                        onClick={saveEdit}
                        disabled={savingEdit}
                        className="rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
                      >
                        {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingId('')}
                        className="btn-ghost px-3 py-1.5 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={u._id} className="hover:bg-black/[0.015] transition-colors">
                  <td className="px-5 py-3 font-medium text-ink">{u.firstName} {u.lastName}</td>
                  <td className="px-5 py-3 font-mono text-xs text-sage">{u.email}</td>
                  <td className={`px-5 py-3 font-semibold ${roleColor(u.role)}`}>{u.role}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${userStatusBadge(u.status)}`}>
                      {u.status}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-3">
                      <div className="flex gap-3">
                        {u.status === 'Active' && (
                          <button onClick={() => startEdit(u)} className="text-xs font-semibold text-teal hover:underline">
                            Edit
                          </button>
                        )}
                        {u.status === 'Active' && u._id !== user?._id && (
                          <button onClick={() => handleDeactivate(u._id)} className="text-xs font-semibold text-ember hover:underline">
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
