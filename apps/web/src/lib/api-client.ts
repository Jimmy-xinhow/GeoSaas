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

// Response interceptor: unwrap { success, data } wrapper and handle errors
apiClient.interceptors.response.use(
  (response) => {
    // Unwrap TransformInterceptor's { success, data } wrapper
    if (response.data && typeof response.data === 'object' && 'success' in response.data && 'data' in response.data) {
      response.data = response.data.data;
    }
    return response;
  },
  (error) => {
    if (typeof window !== 'undefined') {
      const status = error.response?.status;
      const message = error.response?.data?.message;

      if (status === 401) {
        // Token expired or invalid — auto logout
        localStorage.removeItem('token');
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
