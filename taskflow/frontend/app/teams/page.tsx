'use client';

import { FormEvent, useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/ui';

interface Team {
  _id: string;
  name: string;
  description: string;
  members: { _id: string; firstName: string; lastName: string; email: string }[];
}

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
}

export default function TeamsPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Edit/delete state
  const [editingId, setEditingId] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');

  const isAdmin = user?.role === 'Administrator';

  const load = () => {
    api.get('/teams').then((r) => setTeams(r.data)).catch(() => {});
    // The user list is only needed for the Admin-only “Add member” dropdown —
    // skip it for other roles so a direct visit never triggers a 403.
    if (isAdmin) api.get('/users').then((r) => setUsers(r.data)).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/teams', { name, description });
      setName('');
      setDescription('');
      setShowForm(false);
      load();
    } catch (err: any) {
      alert(errorMessage(err, 'Failed to create team'));
    }
  };

  const startEdit = (team: Team) => {
    setEditingId(team._id);
    setEditName(team.name);
    setEditDescription(team.description);
    setActionError('');
  };

  const saveEdit = async () => {
    if (!editName.trim()) return;
    setBusy(editingId);
    setActionError('');
    try {
      await api.patch(`/teams/${editingId}`, {
        name: editName,
        description: editDescription,
      });
      setEditingId('');
      load();
    } catch (err: any) {
      setActionError(errorMessage(err, 'Failed to update team'));
    }
    setBusy('');
  };

  const deleteTeam = async (teamId: string, teamName: string) => {
    if (!window.confirm(`Delete team "${teamName}"? This cannot be undone.`)) return;
    setBusy(teamId);
    setActionError('');
    try {
      await api.delete(`/teams/${teamId}`);
      load();
    } catch (err: any) {
      setActionError(errorMessage(err, 'Failed to delete team'));
    }
    setBusy('');
  };

  // DELETE /teams/:id/members/:userId — Admin only (matches backend @Roles).
  const removeMember = async (teamId: string, memberId: string) => {
    setBusy(`${teamId}:${memberId}`);
    setActionError('');
    try {
      await api.delete(`/teams/${teamId}/members/${memberId}`);
      load();
    } catch (err: any) {
      setActionError(errorMessage(err, 'Failed to remove member'));
    }
    setBusy('');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Teams (FR-003)</h1>
        {isAdmin && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : 'New Team'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Team Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700">
            Create Team
          </button>
        </form>
      )}

      <div className="grid gap-4">
        {teams.map((team) => (
          <div key={team._id} className="bg-white rounded-lg shadow p-5">
            <div className="flex items-start justify-between">
              <div>
                {editingId === team._id ? (
                  <div className="space-y-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="border rounded px-3 py-1.5 text-sm w-full"
                    />
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={2}
                      className="border rounded px-3 py-1.5 text-sm w-full"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        disabled={busy === team._id}
                        className="px-3 py-1 rounded text-xs bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {busy === team._id ? 'Saving…' : 'Save'}
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
                    <h2 className="text-lg font-semibold">{team.name}</h2>
                    <p className="text-sm text-gray-500 mt-1">{team.description}</p>
                  </>
                )}
              </div>
              {isAdmin && editingId !== team._id && (
                <div className="flex gap-2 text-xs shrink-0">
                  <button
                    onClick={() => startEdit(team)}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteTeam(team._id, team.name)}
                    disabled={busy === team._id}
                    className="text-red-600 hover:underline disabled:opacity-50"
                  >
                    {busy === team._id ? '…' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
            <div className="mt-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Members ({team.members.length})
              </span>
              <ul className="mt-2 text-sm space-y-1">
                {team.members.map((m) => (
                  <li key={m._id} className="text-gray-700 flex items-center justify-between group">
                    <span>
                      {m.firstName} {m.lastName} <span className="text-gray-400">({m.email})</span>
                    </span>
                    {isAdmin && (
                      <button
                        onClick={() => removeMember(team._id, m._id)}
                        disabled={busy === `${team._id}:${m._id}`}
                        className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {busy === `${team._id}:${m._id}` ? '…' : 'Remove'}
                      </button>
                    )}
                  </li>
                ))}
                {team.members.length === 0 && (
                  <li className="text-gray-400 italic">No members yet</li>
                )}
              </ul>
              {isAdmin && (
                <div className="mt-3 flex gap-2">
                  <select
                    className="border rounded px-2 py-1 text-xs"
                    onChange={async (e) => {
                      if (!e.target.value) return;
                      await api.post(`/teams/${team._id}/members`, { userIds: [e.target.value] });
                      e.target.value = '';
                      load();
                    }}
                  >
                    <option value="">+ Add member…</option>
                    {users
                      .filter((u) => u.status === 'Active' && !team.members.some((m) => m._id === u._id))
                      .map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.firstName} {u.lastName}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        ))}
        {teams.length === 0 && (
          <p className="text-gray-400 italic">No teams defined yet.</p>
        )}
        {actionError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{actionError}</p>
        )}
      </div>
    </div>
  );
}
