import { useEffect, useState } from "react";
import type { View } from "./types";

const views: View[] = [
  "workspace",
  "history",
  "vocabulary",
  "notifications",
  "changelog",
  "profile",
  "settings/users",
  "settings/users/new",
  "settings/bases",
  "settings/files",
  "settings/authentication",
];
const base = import.meta.env.BASE_URL;
const returnRouteKey = "excel-translator-return-route";
const returnQueryKeys = new Set([
  "page",
  "pageSize",
  "q",
  "sort",
  "direction",
  "sourceLanguage",
  "targetLanguage",
  "baseId",
  "enabled",
  "tab",
]);
const historySortColumns = new Set([
  "fileName",
  "status",
  "fileSize",
  "sourceLanguage",
  "targetLanguage",
  "createdAt",
]);
const historyLanguages = new Set([
  "ENGLISH",
  "JAPANESE",
  "CHINESE",
  "en",
  "ja",
  "zh",
]);

function parseRoute(pathname: string, search: string) {
  const prefix = base === "/" ? "/" : base;
  const relative =
    pathname === prefix.slice(0, -1)
      ? ""
      : pathname.startsWith(prefix)
        ? pathname.slice(prefix.length)
        : null;
  const segment = relative?.replace(/\/$/, "");
  const userDetail = segment?.match(
    /^settings\/users\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  const view =
    segment === ""
      ? "workspace"
      : userDetail
        ? (segment as `settings/users/${string}`)
        : (views.find((item) => item === segment) ?? null);
  const rawPage = new URLSearchParams(search).get("page");
  const page =
    rawPage && /^[1-9]\d*$/.test(rawPage)
      ? Math.min(Number(rawPage), 100000)
      : 1;
  return { view, page: Number.isSafeInteger(page) ? page : 1, search };
}

export function readRoute() {
  const legacyDashboardPath = `${base}dashboard`.replace(/\/$/, "");
  if (window.location.pathname.replace(/\/$/, "") === legacyDashboardPath) {
    window.history.replaceState(
      null,
      "",
      `${base}profile${window.location.search}${window.location.hash}`,
    );
  }
  return parseRoute(window.location.pathname, window.location.search);
}

function safeReturnParams(search: string): URLSearchParams {
  const safe = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(search)) {
    if (!returnQueryKeys.has(key) || value.length > 200) continue;
    if (key === "page" && !/^[1-9]\d{0,5}$/.test(value)) continue;
    if (key === "pageSize" && !/^(10|20|30|40|50)$/.test(value)) continue;
    if (key === "enabled" && !/^(true|false)$/.test(value)) continue;
    if (
      (key === "sourceLanguage" || key === "targetLanguage") &&
      !historyLanguages.has(value)
    )
      continue;
    if (key === "sort" && !historySortColumns.has(value)) continue;
    if (key === "direction" && !/^(asc|desc)$/.test(value)) continue;
    if (key === "q" && value.length > 200) continue;
    if (key === "tab" && !/^(overview|account)$/.test(value)) continue;
    if (
      key === "baseId" &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    )
      continue;
    safe.set(key, value);
  }
  return safe;
}

export function preserveValidatedReturnRoute(): void {
  sessionStorage.removeItem(returnRouteKey);
  const { view } = readRoute();
  if (!view) return;
  const params = safeReturnParams(window.location.search);
  const query = params.toString();
  sessionStorage.setItem(
    returnRouteKey,
    `${base}${view}${query ? `?${query}` : ""}`,
  );
}

export function consumeValidatedReturnRoute(): {
  view: View;
  params: URLSearchParams;
} | null {
  const stored = sessionStorage.getItem(returnRouteKey);
  sessionStorage.removeItem(returnRouteKey);
  if (!stored) return null;
  try {
    const url = new URL(stored, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const route = parseRoute(url.pathname, url.search);
    if (!route.view) return null;
    return { view: route.view, params: safeReturnParams(url.search) };
  } catch {
    return null;
  }
}

export function useAppRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const navigate = (view: View, page?: number, params?: URLSearchParams) => {
    const path = `${base}${view}`;
    const query = params
      ? params.toString()
        ? `?${params}`
        : ""
      : page && page > 1
        ? `?page=${Math.min(Math.floor(page), 100000)}`
        : "";
    if (
      `${window.location.pathname}${window.location.search}` !==
      `${path}${query}`
    )
      window.history.pushState(null, "", `${path}${query}`);
    setRoute(readRoute());
  };
  return { ...route, navigate };
}
