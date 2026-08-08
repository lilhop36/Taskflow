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
        // (/auth/session, /auth/login) — AuthProvider handles those itself
        // with the demo auto sign-in. For any other call, reload the app
        // so the session is re-established. There is no login page anymore.
        const isAuthBootstrap =
          originalRequest.url.includes('/auth/session') ||
          originalRequest.url.includes('/auth/login');
        if (!isAuthBootstrap) {
          window.location.href = '/';
        }
      }
    }

    return Promise.reject(err);
  },
);

export default api;
