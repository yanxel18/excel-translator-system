import { request } from './client';

export const AuthenticationApi = {
  login: (username: string, password: string) => request<{ access_token: string }>('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  }),
};
