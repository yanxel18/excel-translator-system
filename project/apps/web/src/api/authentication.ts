import { request } from './client';
import type { OidcAdminSettings, OidcPublicConfig } from './types';

export const AuthenticationApi = {
  login: (username: string, password: string) => request<{ access_token: string }>('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  }),
  exchangeKeycloakToken: (accessToken: string) => request<{ access_token: string }>('/auth/oidc/exchange', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken }),
  }),
  getOidcConfig: () => request<OidcPublicConfig>('/auth/oidc/config'),
  getOidcSettings: (token: string) => request<OidcAdminSettings>('/auth/oidc/settings', {}, token),
  updateOidcSettings: (settings: OidcAdminSettings, token: string) => request<OidcAdminSettings>('/auth/oidc/settings', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
  }, token),
};
