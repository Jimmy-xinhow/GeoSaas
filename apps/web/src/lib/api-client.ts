import axios from 'axios';
import { toast } from 'sonner';

const apiClient = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: inject Authorization Bearer token from localStorage
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Track refresh state to avoid multiple simultaneous refreshes
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (token) prom.resolve(token);
    else prom.reject(error);
  });
  failedQueue = [];
}

// Response interceptor: unwrap { success, data } wrapper and handle errors
apiClient.interceptors.response.use(
  (response) => {
    // Unwrap TransformInterceptor's { success, data } wrapper
    if (response.data && typeof response.data === 'object' && 'success' in response.data && 'data' in response.data) {
      response.data = response.data.data;
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (typeof window !== 'undefined') {
      const status = error.response?.status;
      const message = error.response?.data?.message;

      // Auto-refresh on 401
      if (status === 401 && !originalRequest._retry) {
        const refreshToken = localStorage.getItem('refreshToken');

        if (refreshToken) {
          if (isRefreshing) {
            // Queue this request until refresh completes
            return new Promise((resolve, reject) => {
              failedQueue.push({
                resolve: (token: string) => {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
                  resolve(apiClient(originalRequest));
                },
                reject,
              });
            });
          }

          originalRequest._retry = true;
          isRefreshing = true;

          try {
            const { data } = await axios.post(
              `${process.env.NEXT_PUBLIC_API_URL}/api/auth/refresh`,
              { refreshToken },
            );

            const newToken = data?.data?.token || data?.token;
            const newRefresh = data?.data?.refreshToken || data?.refreshToken;

            if (newToken) {
              localStorage.setItem('token', newToken);
              if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              processQueue(null, newToken);
              return apiClient(originalRequest);
            }
          } catch {
            processQueue(error, null);
          } finally {
            isRefreshing = false;
          }
        }

        // Refresh failed or no refresh token — logout
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      } else if (status === 403) {
        toast.error('您沒有權限執行此操作', { id: 'forbidden-error' });
      } else if (status === 429) {
        toast.error('請求過於頻繁，請稍後再試', { id: 'rate-limit-error' });
      } else if (status && status >= 500) {
        toast.error(message || '伺服器發生錯誤，請稍後再試', { id: 'server-error' });
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
