import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import useAuthStore from '@/stores/auth-store';

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    plan?: string;
  };
  token: string;
  refreshToken?: string;
}

export function useLogin() {
  const { login } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const { data } = await apiClient.post<AuthResponse>(
        '/auth/login',
        payload
      );
      return data;
    },
    onSuccess: (data) => {
      login(data.user, data.token, data.refreshToken);
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

export function useGoogleLogin() {
  const { login } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (idToken: string) => {
      const { data } = await apiClient.post<AuthResponse>('/auth/google', { idToken });
      return data;
    },
    onSuccess: (data) => {
      login(data.user, data.token, data.refreshToken);
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

export function useRegister() {
  const { login } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RegisterPayload) => {
      const { data } = await apiClient.post<AuthResponse>(
        '/auth/register',
        payload
      );
      return data;
    },
    onSuccess: (data) => {
      login(data.user, data.token, data.refreshToken);
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

export function useLogout() {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/auth/logout').catch(() => {});
    },
    onSettled: () => {
      logout();
      queryClient.clear();
    },
  });
}

export function useUser() {
  const { token } = useAuthStore();

  return useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const { data } = await apiClient.get('/auth/me');
      return data;
    },
    enabled: !!token,
  });
}
