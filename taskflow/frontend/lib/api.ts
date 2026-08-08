import axios from 'axios';

// Backend base URL. Injected at build time via NEXT_PUBLIC_API_URL so the
// same codebase works locally (default) and on Vercel/Render (override).
// A trailing slash is stripped so callers can concatenate paths safely.
const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api').replace(
    /\/$/,
    '',
  );

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config;

    if (err.response?.status === 401 && !originalRequest._retry && typeof window !== 'undefined') {
      originalRequest._retry = true;

      try {
        await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        return api(originalRequest);
      } catch {
        // Session is gone. Skip the redirect for the auth bootstrap calls
        // (/auth/session, /auth/login, /auth/logout) — AuthProvider handles
        // those itself (demo auto sign-in, or staying logged out after a
        // deliberate sign-out). For any other call, send the user to the
        // login page.
        const isAuthBootstrap =
          originalRequest.url.includes('/auth/session') ||
          originalRequest.url.includes('/auth/login') ||
          originalRequest.url.includes('/auth/logout');
        if (!isAuthBootstrap) {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(err);
  },
);

export default api;
