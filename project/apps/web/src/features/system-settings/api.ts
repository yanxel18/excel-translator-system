import { request } from '../../api/client';

export type Base = { id: string; code: string; name: string };
export type User = { id: string; gid: string | null; username: string; email: string | null; baseId: string | null; enabled: boolean; base: Base | null };
type Page<T> = { data: T[]; total: number; page: number; pageSize: number };
const write = (method: string, body?: object): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
export const management = {
  bases: (token: string, query: string) => request<Page<Base>>(`/admin/bases?${query}`, {}, token),
  saveBase: (token: string, value: { code: string; name: string }, id?: string) => request<Base>(`/admin/bases${id ? `/${encodeURIComponent(id)}` : ''}`, write(id ? 'PATCH' : 'POST', value), token),
  deleteBase: (token: string, id: string) => request<Base>(`/admin/bases/${encodeURIComponent(id)}`, write('DELETE'), token),
  users: (token: string, query: string) => request<Page<User>>(`/admin/users?${query}`, {}, token),
  createUser: (token: string, value: { gid: string; username: string; email: string; baseId: string; password: string }) => request<User>('/admin/users', write('POST', value), token),
};
