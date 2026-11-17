import { useEffect, useRef, useState } from "react";
import type { Job } from "../../api";
import { useLocale } from "../shared/LocaleProvider";
import type { View } from "./types";

export function useBrowserTitle(
  token: string,
  view: View | null,
  jobs: Job[],
  jobsLoading: boolean,
  unreadCount: number,
) {
  const { t, locale } = useLocale();
  const [attention, setAttention] = useState<{ status: "completed" | "failed" } | null>(null);
  const [showAttention, setShowAttention] = useState(true);
  const previous = useRef<{ token: string; statuses: Map<string, Job["status"]> } | null>(null);

  useEffect(() => {
    if (!token) {
      previous.current = null;
      setAttention(null);
      return;
    }
    if (jobsLoading) return;
    const snapshot = previous.current;
    const statuses = new Map(jobs.map((job) => [job.id, job.status]));
    previous.current = { token, statuses };
    if (!snapshot || snapshot.token !== token || (!document.hidden && document.hasFocus())) return;
    const changed = jobs.find((job) =>
      (job.status === "COMPLETED" || job.status === "FAILED") &&
      snapshot.statuses.get(job.id) !== job.status,
    );
    if (changed) {
      setAttention({ status: changed.status === "FAILED" ? "failed" : "completed" });
    }
  }, [token, jobs, jobsLoading]);

  useEffect(() => {
    const clear = () => setAttention(null);
    const onVisibilityChange = () => {
      if (!document.hidden) clear();
    };
    window.addEventListener("focus", clear);
    window.addEventListener("notifications-updated", clear);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", clear);
      window.removeEventListener("notifications-updated", clear);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!attention) return;
    setShowAttention(true);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let interval: number | undefined;
    const updateMotion = () => {
      if (interval !== undefined) window.clearInterval(interval);
      setShowAttention(true);
      interval = motion.matches
        ? undefined
        : window.setInterval(() => setShowAttention((visible) => !visible), 1000);
    };
    updateMotion();
    motion.addEventListener("change", updateMotion);
    const timeout = window.setTimeout(() => setAttention(null), 10000);
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
      window.clearTimeout(timeout);
      motion.removeEventListener("change", updateMotion);
    };
  }, [attention]);

  useEffect(() => {
    let page: string;
    if (!token) page = t("Sign in");
    else if (!view) page = t("Page not found");
    else if (view.startsWith("settings/")) {
      const settingsLabels: Record<string, string> = {
        "settings/users": "Users",
        "settings/users/new": "Create user",
        "settings/bases": "Bases",
        "settings/files": "Files & processing",
        "settings/authentication": "Authentication",
        "settings/maintenance": "Maintenance notices",
      };
      page = `${t(settingsLabels[view] ?? "User details")} · ${t("System Settings")}`;
    }
    else {
      const labels: Record<string, string> = {
        workspace: "Translate File",
        history: "Translation history",
        vocabulary: "Vocabulary",
        notifications: "Notifications",
        profile: "Profile",
        changelog: "Changelog",
      };
      page = t(labels[view]);
    }

    const active = token && jobs.find((job) => job.status === "PROCESSING");
    const latest = token && jobs.reduce<Job | undefined>((current, job) => {
      if (!current) return job;
      return Date.parse(job.updatedAt || job.createdAt) >
        Date.parse(current.updatedAt || current.createdAt) ? job : current;
    }, undefined);
    const status = active || latest;
    const parts = [page];
    if (status) parts.push(t(status.status.toLowerCase()));
    parts.push("Excel Translator");
    const prefix = token && unreadCount > 0
      ? `(${unreadCount.toLocaleString(locale)}) `
      : "";
    const alert = token && attention && showAttention
      ? `! ${t(attention.status)} · `
      : "";
    document.title = alert + prefix + parts.join(" · ");
  }, [token, view, jobs, unreadCount, t, locale, attention, showAttention]);
}
