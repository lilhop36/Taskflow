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
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="eyebrow">Org structure</p>
          <h1 className="page-title mt-1">Teams</h1>
          <span className="thread mt-3 w-14" aria-hidden="true" />
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className={showForm ? 'btn-ghost' : 'btn-gold'}
          >
            {showForm ? 'Cancel' : 'New team'}
          </button>
        )}
      </header>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-6 mb-6 space-y-4 max-w-lg">
          <div>
            <label className="block text-sm font-medium mb-1">Team Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              rows={2}
            />
          </div>
          <button type="submit" className="btn-gold">Create team</button>
        </form>
      )}

      <div className="grid gap-4">
        {teams.map((team) => (
          <div key={team._id} className="card p-5">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                {editingId === team._id ? (
                  <div className="space-y-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="input"
                    />
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={2}
                      className="input"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        disabled={busy === team._id}
                        className="rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
                      >
                        {busy === team._id ? 'Saving…' : 'Save'}
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
                    <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{team.name}</h2>
                    <p className="mt-1 text-sm text-sage">{team.description}</p>
                  </>
                )}
              </div>
              {isAdmin && editingId !== team._id && (
                <div className="flex gap-3 text-xs shrink-0">
                  <button
                    onClick={() => startEdit(team)}
                    className="font-semibold text-teal hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteTeam(team._id, team.name)}
                    disabled={busy === team._id}
                    className="font-semibold text-ember hover:underline disabled:opacity-50"
                  >
                    {busy === team._id ? '…' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
            <div className="mt-4 border-t border-black/5 pt-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage">
                Members ({team.members.length})
              </span>
              <ul className="mt-2 text-sm space-y-1">
                {team.members.map((m) => (
                  <li key={m._id} className="text-ink flex items-center justify-between group">
                    <span>
                      {m.firstName} {m.lastName} <span className="font-mono text-xs text-sand">({m.email})</span>
                    </span>
                    {isAdmin && (
                      <button
                        onClick={() => removeMember(team._id, m._id)}
                        disabled={busy === `${team._id}:${m._id}`}
                        className="text-xs font-semibold text-ember hover:underline disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {busy === `${team._id}:${m._id}` ? '…' : 'Remove'}
                      </button>
                    )}
                  </li>
                ))}
                {team.members.length === 0 && (
                  <li className="text-sand italic">No members yet</li>
                )}
              </ul>
              {isAdmin && (
                <div className="mt-3 flex gap-2">
                  <select
                    className="input w-48 py-1.5 text-xs"
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
          <p className="card px-5 py-10 text-center text-sm text-sage">
            No teams defined yet.
          </p>
        )}
        {actionError && (
          <p className="text-sm text-ember bg-ember-soft border border-ember/30 rounded-md px-3 py-2">{actionError}</p>
        )}
      </div>
    </div>
  );
}
