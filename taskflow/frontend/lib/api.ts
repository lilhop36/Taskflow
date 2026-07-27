import axios from 'axios';

/**
 * Axios instance pre-configured to talk to the TaskFlow backend.
 *
 * The backend is at localhost:3000 with /api prefix.
 * Credentials: include sends HTTP-only cookies (refresh token).
 *
 * SRS: FR-001 — Authentication is cookie-based.
 */
const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Response interceptor — catches 401 (unauthorized) globally.
 * When the access token expires, the backend's refresh endpoint
 * (which reads the HTTP-only cookie) should rotate it silently.
 * If refresh fails, the user is redirected to /login.
 */
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export default api;
