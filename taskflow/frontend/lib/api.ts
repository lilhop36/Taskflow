import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3002/api',
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
        await axios.post('http://localhost:3002/api/auth/refresh', {}, { withCredentials: true });
        return api(originalRequest);
      } catch {
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(err);
  },
);

export default api;
