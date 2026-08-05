'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { canManage, errorMessage } from '@/lib/ui';

interface Member {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Project {
  _id: string;
  name: string;
  owner?: Member;
  members?: Member[];
}

/**
 * New Task page — FR-005.1 task creation + FR-008.1 assignment.
 *
 * The assignee dropdown is filtered to the selected project's members
 * (owner + members array), mirroring the backend's BR-003 rule: tasks can
 * only be assigned to users who are members of the project.
 *
 * POST /api/tasks requires ProjectManager or Administrator (class-level
 * @Roles), so the form is hidden for TeamMembers.
 */
export default function NewTaskPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isPM = canManage(user?.role);

  useEffect(() => {
    api.get('/projects')
      .then((r) => {
        const list = r.data as Project[];
        setProjects(list);
        // Pre-select the project when arriving from a project detail page
        // ("+ Create your first task" → /tasks/new?project=<id>).
        const param = new URLSearchParams(window.location.search).get('project');
        if (param && list.some((p) => p._id === param)) {
          setProjectId(param);
        }
      })
      .catch(() => setProjects([]));
  }, []);

  const selectedProject = projects.find((p) => p._id === projectId);

  // Owner + members = everyone the backend accepts as an assignee (BR-003).
  const assignable = useMemo(() => {
    if (!selectedProject) return [];
    const seen = new Set<string>();
    const list: Member[] = [];
    for (const m of [selectedProject.owner, ...(selectedProject.members ?? [])]) {
      if (m && m._id && !seen.has(m._id)) {
        seen.add(m._id);
        list.push(m);
      }
    }
    return list;
  }, [selectedProject]);

  const handleProjectChange = (id: string) => {
    setProjectId(id);
    setAssigneeId(''); // stale assignee from another project would violate BR-003
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/tasks', {
        title,
        description,
        priority,
        dueDate,
        project: projectId,
        assignee: assigneeId,
      });
      router.push(`/tasks/${res.data._id}`);
    } catch (err: any) {
      setError(errorMessage(err, 'Failed to create task'));
      setSubmitting(false);
    }
  };

  if (!isPM) {
    return (
      <div>
        <p className="eyebrow">Create</p>
        <h1 className="page-title mt-1">New Task</h1>
        <p className="mt-4 text-sm text-sage">
          Only Project Managers and Administrators can create tasks.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Link href="/tasks" className="text-sm text-gold-deep hover:underline">
        &larr; Back to tasks
      </Link>
      <header className="my-4">
        <p className="eyebrow">Create</p>
        <h1 className="page-title mt-1">New Task</h1>
        <span className="thread mt-3 w-14" aria-hidden="true" />
      </header>

      {error && (
        <p className="mb-4 text-sm text-ember bg-ember-soft border border-ember/30 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder="e.g. Fix login redirect"
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
            placeholder="What needs to be done?"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="input"
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Due Date</label>
            <input
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Project</label>
          <select
            required
            value={projectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="input"
          >
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Assignee{' '}
            {selectedProject && (
              <span className="text-xs text-sage">
                (members of {selectedProject.name})
              </span>
            )}
          </label>
          <select
            required
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            disabled={!selectedProject}
            className="input disabled:bg-black/5"
          >
            <option value="">
              {selectedProject ? 'Select a team member…' : 'Choose a project first'}
            </option>
            {assignable.map((m) => (
              <option key={m._id} value={m._id}>
                {m.firstName} {m.lastName} ({m.email})
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="btn-gold"
          >
            {submitting ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  );
}
