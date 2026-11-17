import { useEffect, useState } from "react";
import ApiService from "../../api";

export function useUnreadNotificationCount(token: string): number {
  const [unread, setUnread] = useState({ token: "", count: 0 });

  useEffect(() => {
    if (!token) return;
    let active = true;
    let latestRequest = 0;
    const refresh = () => {
      const request = ++latestRequest;
      void ApiService.getUnreadNotificationCount(token)
        .then((value) => {
          if (active && request === latestRequest)
            setUnread({ token, count: value.count });
        })
        .catch(() => {
          if (active && request === latestRequest)
            console.warn("Could not refresh the unread notification count.");
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("notifications-updated", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("notifications-updated", refresh);
    };
  }, [token]);

  return unread.token === token ? unread.count : 0;
}
