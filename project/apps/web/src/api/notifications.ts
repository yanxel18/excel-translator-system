import { request } from "./client";
import { NotificationPage } from "./types";

export const NotificationsApi = {
  getUnreadNotificationCount: (token: string) =>
    request<{ count: number }>("/notifications/unread-count", {}, token),
  getNotifications: (token: string, cursor?: string) =>
    request<NotificationPage>(
      `/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      {},
      token,
    ),
  markNotificationRead: (id: string, token: string) =>
    request<{ ok: boolean }>(
      `/notifications/${encodeURIComponent(id)}/read`,
      { method: "PATCH" },
      token,
    ),
};
