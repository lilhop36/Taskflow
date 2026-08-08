'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import api from '@/lib/api';

/**
 * Shape of the authenticated user returned by the backend.
 * Fields match the User schema (minus passwordHash).
 */
export interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'Administrator' | 'ProjectManager' | 'TeamMember';
  status: 'Active' | 'Inactive';
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Frictionless demo mode: when no session exists (first visit) the app
// silently signs in as a seeded demo user so the workspace opens straight
// into the product — no login wall. Disable for a real deployment by
// setting NEXT_PUBLIC_DEMO_MODE=false (visitors then get the login page
// instead of an automatic account).
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? 'abebe@taskflow.dev';
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? 'DemoPass123!';

// When the user deliberately signs out we must NOT silently sign them
// back in as the demo user — otherwise "Sign out" is a no-op. Setting
// this flag (localStorage, per-browser) makes the bootstrap skip the
// demo auto-login so the login page actually stays visible. Any real
// login (manual or demo) clears it.
const SIGNED_OUT_FLAG = 'taskflow_signed_out';

/**
 * AuthProvider wraps the app and provides:
 * - user: the currently logged-in user (null if not authenticated)
 * - loading: true while checking session on first load
 * - login: email + password authentication
 * - logout: session termination
 *
 * On mount, it calls GET /auth/session to restore a persisted session
 * from the refresh-token cookie. If none exists, it silently signs in
 * with the seeded demo account so the app opens ready to use.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const session = await api.get<User>('/auth/session');
        if (!cancelled) setUser(session.data);
      } catch {
        const signedOut = localStorage.getItem(SIGNED_OUT_FLAG) === '1';
        if (DEMO_MODE && !signedOut) {
          // No session and not deliberately signed out — auto sign-in
          // with the demo account.
          try {
            const res = await api.post<{
              accessToken: string;
              refreshToken: string;
              user: User;
            }>('/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD });
            if (!cancelled) {
              setUser(res.data.user);
              localStorage.removeItem(SIGNED_OUT_FLAG);
            }
          } catch {
            if (!cancelled) setUser(null);
          }
        } else if (!cancelled) {
          // Signed out on purpose (or demo mode disabled) → stay logged
          // out so the login page shows.
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // Only an explicit login (manual or demo) clears the signed-out flag.
  // A plain session restore does NOT — otherwise a failed logout (cookies
  // still valid) followed by a reload would silently sign the user back in
  // and defeat their deliberate sign-out.
  const clearSignedOut = () => localStorage.removeItem(SIGNED_OUT_FLAG);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ accessToken: string; refreshToken: string; user: User }>('/auth/login', { email, password });
    setUser(res.data.user);
    clearSignedOut();
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      // Mark the deliberate sign-out BEFORE clearing state so a reload
      // (or the interceptor) won't auto-login as the demo user.
      localStorage.setItem(SIGNED_OUT_FLAG, '1');
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
