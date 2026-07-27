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
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * AuthProvider wraps the app and provides:
 * - user: the currently logged-in user (null if not authenticated)
 * - loading: true while checking session on first load
 * - login: email + password authentication
 * - logout: session termination
 *
 * On mount, it calls GET /auth/session (or /users/me) to see if there's
 * an active session from a persisted refresh-token cookie.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<User>('/auth/session')
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ accessToken: string; refreshToken: string; user: User }>('/auth/login', { email, password });
    setUser(res.data.user);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setUser(null);
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
