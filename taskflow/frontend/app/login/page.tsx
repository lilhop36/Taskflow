'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { homeForRole } from '@/lib/nav';

/**
 * Login page — FR-001: User Authentication
 *
 * A simple email + password form that calls the backend's /auth/login.
 * On success the AuthContext updates, and the router pushes to the
 * role-appropriate landing page.
 *
 * SRS: FR-001.1-4 — credential validation, session establishment, error display
 */
export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(email, password);
      router.push(homeForRole(user.role));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Wordmark */}
        <div className="mb-6 text-center">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
            Task<span className="text-gold-deep">Flow</span>
          </h1>
          <span className="thread thread-draw mx-auto mt-3 w-16" aria-hidden="true" />
        </div>

        {/* Ink panel */}
        <div className="card bg-ink border-ink-line shadow-[0_12px_40px_rgba(25,23,18,0.28)] px-8 py-8">
          <p className="eyebrow text-gold">Sign in</p>
          <p className="mt-1 text-sm text-sand">
            Enter your workspace credentials to open the flow.
          </p>

          {error && (
            <p className="mt-4 text-sm text-ember-soft bg-ember/20 border border-ember/40 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block mb-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-sand">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-ink-line bg-ink-soft px-3 py-2.5 text-sm text-card placeholder:text-sand/50 focus:border-gold focus:outline-none"
                placeholder="you@taskflow.dev"
              />
            </div>
            <div>
              <label className="block mb-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-sand">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-ink-line bg-ink-soft px-3 py-2.5 text-sm text-card placeholder:text-sand/50 focus:border-gold focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-gold px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-gold-deep hover:text-white disabled:opacity-50"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Demo access readout */}
          <div className="mt-7 border-t border-ink-line pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sand/70">
              Demo access
            </p>
            <ul className="mt-2 space-y-1 font-mono text-[11px] text-sand">
              <li><span className="text-gold">admin</span> · liya@taskflow.dev</li>
              <li><span className="text-gold">manager</span> · abebe@taskflow.dev</li>
              <li><span className="text-gold">member</span> · hanna@taskflow.dev</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
