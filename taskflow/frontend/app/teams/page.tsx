'use client';

import { FormEvent, useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

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

  const load = () => {
    api.get('/teams').then((r) => setTeams(r.data));
    api.get('/users').then((r) => setUsers(r.data));
  };

  useEffect(() => { load(); }, []);

  const isAdmin = user?.role === 'Administrator';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await api.post('/teams', { name, description });
    setName('');
    setDescription('');
    setShowForm(false);
    load();
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
            <h2 className="text-lg font-semibold">{team.name}</h2>
            <p className="text-sm text-gray-500 mt-1">{team.description}</p>
            <div className="mt-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Members ({team.members.length})
              </span>
              <ul className="mt-2 text-sm space-y-1">
                {team.members.map((m) => (
                  <li key={m._id} className="text-gray-700">
                    {m.firstName} {m.lastName} <span className="text-gray-400">({m.email})</span>
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
      </div>
    </div>
  );
}
