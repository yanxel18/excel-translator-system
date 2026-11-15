import { request } from "../../api/client";

export type Base = { id: string; code: string; name: string };
export type User = {
  id: string;
  gid: string | null;
  username: string;
  fullName: string | null;
  email: string | null;
  baseId: string | null;
  enabled: boolean;
  base: Base | null;
};
export type UserDetail = User & {
  sessionVersion: number;
  identityProviders: string[];
  hasLocalPassword: boolean;
};
export type ApplicationSettings = {
  maxUploadSizeMb: number;
  maxConcurrentTranslations: number;
};
export type MaintenanceSchedule = {
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
};
export type MaintenanceNotice =
  | { active: false }
  | { active: true; startsAt: string; endsAt: string };
type Page<T> = { data: T[]; total: number; page: number; pageSize: number };
const write = (method: string, body?: object): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
export const management = {
  maintenanceSchedule: (token: string, signal?: AbortSignal) =>
    request<MaintenanceSchedule>(
      "/admin/maintenance-schedule",
      { signal },
      token,
    ),
  updateMaintenanceSchedule: (
    token: string,
    value: MaintenanceSchedule,
    signal?: AbortSignal,
  ) =>
    request<MaintenanceSchedule>(
      "/admin/maintenance-schedule",
      { ...write("PUT", value), signal },
      token,
    ),
  applicationSettings: (token: string) =>
    request<ApplicationSettings>("/admin/application-settings", {}, token),
  updateApplicationSettings: (
    token: string,
    value: Partial<ApplicationSettings>,
  ) =>
    request<ApplicationSettings>(
      "/admin/application-settings",
      write("PATCH", value),
      token,
    ),
  bases: (token: string, query: string) =>
    request<Page<Base>>(`/admin/bases?${query}`, {}, token),
  saveBase: (
    token: string,
    value: { code: string; name: string },
    id?: string,
  ) =>
    request<Base>(
      `/admin/bases${id ? `/${encodeURIComponent(id)}` : ""}`,
      write(id ? "PATCH" : "POST", value),
      token,
    ),
  deleteBase: (token: string, id: string) =>
    request<Base>(
      `/admin/bases/${encodeURIComponent(id)}`,
      write("DELETE"),
      token,
    ),
  users: (token: string, query: string) =>
    request<Page<User>>(`/admin/users?${query}`, {}, token),
  user: (token: string, id: string) =>
    request<UserDetail>(`/admin/users/${encodeURIComponent(id)}`, {}, token),
  updateUser: (
    token: string,
    id: string,
    value: Partial<Pick<
      UserDetail,
      "gid" | "username" | "fullName" | "email" | "baseId" | "enabled"
    >>,
  ) =>
    request<UserDetail>(
      `/admin/users/${encodeURIComponent(id)}`,
      write("PATCH", value),
      token,
    ),
  resetLocalPassword: (token: string, id: string, password: string) =>
    request<{ id: string; enabled: boolean; sessionVersion: number }>(
      `/admin/users/${encodeURIComponent(id)}/password`,
      write("PATCH", { password }),
      token,
    ),
  assignBase: (token: string, id: string, baseId: string) =>
    request<User>(
      `/admin/users/${encodeURIComponent(id)}/base`,
      write("PATCH", { baseId }),
      token,
    ),
  createUser: (
    token: string,
    value: {
      username: string;
      fullName: string;
      email: string;
      baseId: string;
      password: string;
    },
  ) => request<User>("/admin/users", write("POST", value), token),
};

export const getMaintenanceNotice = (
  token: string,
  signal?: AbortSignal,
) =>
  request<MaintenanceNotice>(
    "/maintenance-notice",
    { signal },
    token,
    { silent: true },
  );
