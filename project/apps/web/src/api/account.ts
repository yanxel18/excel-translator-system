import { request } from './client';
import { ChangelogPage, UserProfile } from './types';

export const AccountApi = {
  getProfile: (token: string) => request<UserProfile>('/profile', {}, token),
  updateProfile: (profile: Pick<UserProfile, 'fullName' | 'email'>, token: string) => request<UserProfile>('/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) }, token),
  getChangelog: (token: string, cursor?: string) => request<ChangelogPage>(`/changelog${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {}, token),
};
