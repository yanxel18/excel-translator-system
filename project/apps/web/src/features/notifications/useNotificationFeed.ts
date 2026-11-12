import { useCallback, useEffect, useRef, useState } from "react";
import ApiService, { type JobNotification } from "../../api";

export function useNotificationFeed(token: string) {
  const [items, setItems] = useState<JobNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const generation = useRef(0);
  const load = useCallback(
    async (next?: string) => {
      if (pending.current) return;
      pending.current = true;
      setLoading(true);
      setError("");
      const current = generation.current;
      try {
        const page = await ApiService.getNotifications(token, next);
        if (current !== generation.current) return;
        setTotal(page.total);
        setItems((previous) =>
          next
            ? [
                ...previous,
                ...page.data.filter(
                  (item) => !previous.some((entry) => entry.id === item.id),
                ),
              ]
            : page.data,
        );
        setCursor(page.nextCursor === next ? null : page.nextCursor);
      } catch (reason) {
        if (current === generation.current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load notifications.",
          );
      } finally {
        if (current === generation.current) {
          pending.current = false;
          setLoading(false);
        }
      }
    },
    [token],
  );
  useEffect(() => {
    generation.current += 1;
    pending.current = false;
    setItems([]);
    setTotal(0);
    setCursor(null);
    void load();
    return () => {
      generation.current += 1;
      pending.current = false;
    };
  }, [load]);
  const markRead = async (id: string) => {
    try {
      await ApiService.markNotificationRead(id, token);
      setItems((previous) =>
        previous.map((item) =>
          item.id === id ? { ...item, isRead: true } : item,
        ),
      );
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update notification.",
      );
    }
  };
  const [markingAll, setMarkingAll] = useState(false);
  const markAllRead = async () => {
    setMarkingAll(true);
    setError("");
    try {
      let next: string | undefined;
      const seen = new Set<string>();
      do {
        const page = await ApiService.getNotifications(token, next);
        for (const item of page.data)
          if (!item.isRead) {
            await ApiService.markNotificationRead(item.id, token);
            setItems((previous) =>
              previous.map((entry) =>
                entry.id === item.id ? { ...entry, isRead: true } : entry,
              ),
            );
          }
        next = page.nextCursor ?? undefined;
        if (next && seen.has(next))
          throw new Error("Could not load notifications.");
        if (next) seen.add(next);
      } while (next);
      setItems((previous) =>
        previous.map((item) => ({ ...item, isRead: true })),
      );
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update notification.",
      );
    } finally {
      setMarkingAll(false);
      window.dispatchEvent(new Event("notifications-updated"));
    }
  };
  return {
    items,
    cursor,
    total,
    loading,
    error,
    load,
    markRead,
    markAllRead,
    markingAll,
  };
}
