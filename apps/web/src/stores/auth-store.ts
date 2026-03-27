import { create } from 'zustand';
import apiClient from '@/lib/api-client';

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  plan?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  hydrate: () => Promise<void>;
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  isAuthenticated: false,
  isHydrated: false,

  login: (user, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
    }
    set({ user, token, isAuthenticated: true, isHydrated: true });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
    set({ user: null, token: null, isAuthenticated: false });
  },

  hydrate: async () => {
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('token');
    if (!token) {
      set({ token: null, isAuthenticated: false, isHydrated: true });
      return;
    }

    try {
      const { data } = await apiClient.get('/auth/me');
      set({ user: data, token, isAuthenticated: true, isHydrated: true });
    } catch {
      // Token is invalid or expired — clear it
      localStorage.removeItem('token');
      set({ user: null, token: null, isAuthenticated: false, isHydrated: true });
    }
  },
}));

export default useAuthStore;
