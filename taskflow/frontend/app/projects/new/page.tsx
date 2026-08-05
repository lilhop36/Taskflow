'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { canManage, errorMessage } from '@/lib/ui';

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
}

const daysFromNow = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
};

/**
 * New Project page — FR-004.1 project creation.
 *
 * The owner dropdown lists only Project Managers (BR-008: a project must
 * have exactly one PM owner) — the backend rejects any other role.
 *
 * POST /api/projects requires ProjectManager or Administrator (class-level
 * @Roles), so the form is hidden for TeamMembers.
 */
export default function NewProjectPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [managers, setManagers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(daysFromNow(0));
  const [endDate, setEndDate] = useState(daysFromNow(30));
  const [ownerId, setOwnerId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isPM = canManage(user?.role);

  useEffect(() => {
    api.get('/users')
      .then((r) =>
        setManagers(
          (r.data as User[]).filter(
            (u) => u.role === 'ProjectManager' && u.status === 'Active',
          ),
        ),
      )
      .catch(() => setManagers([]));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/projects', {
        name,
        description,
        startDate,
        endDate,
        owner: ownerId,
      });
      router.push(`/projects/${res.data._id}`);
    } catch (err: any) {
      setError(errorMessage(err, 'Failed to create project'));
      setSubmitting(false);
    }
  };

  if (!isPM) {
    return (
      <div>
        <p className="eyebrow">Create</p>
        <h1 className="page-title mt-1">New Project</h1>
        <p className="mt-4 text-sm text-sage">
          Only Project Managers and Administrators can create projects.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Link href="/projects" className="text-sm text-gold-deep hover:underline">
        &larr; Back to projects
      </Link>
      <header className="my-4">
        <p className="eyebrow">Create</p>
        <h1 className="page-title mt-1">New Project</h1>
        <span className="thread mt-3 w-14" aria-hidden="true" />
      </header>

      {error && (
        <p className="mb-4 text-sm text-ember bg-ember-soft border border-ember/30 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Project Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="e.g. Mobile App Launch"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
            placeholder="What is this project about?"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
            />
          </div>
        </div>
        {endDate < startDate && (
          <p className="text-xs text-ember">
            End date must be on or after the start date (BR-006).
          </p>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">
            Project Owner{' '}
            <span className="text-xs text-sage">(Project Manager — BR-008)</span>
          </label>
          <select
            required
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="input"
          >
            <option value="">Select a Project Manager…</option>
            {managers.map((m) => (
              <option key={m._id} value={m._id}>
                {m.firstName} {m.lastName} ({m.email})
              </option>
            ))}
          </select>
          {managers.length === 0 && (
            <p className="text-xs text-sage mt-1">
              No active Project Managers found — create a PM user first.
            </p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={submitting || endDate < startDate}
            className="btn-gold"
          >
            {submitting ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
