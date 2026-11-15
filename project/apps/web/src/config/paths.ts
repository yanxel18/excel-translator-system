export function normalizeWebBasePath(value: string | undefined): string {
  const path = (value || "/excel-convert/").trim().replace(/^\/+|\/+$/g, "");
  return path ? `/${path}/` : "/";
}

export function normalizeApiBaseUrl(value: string | undefined): string {
  return (value || "http://localhost:3000/excel-convert")
    .trim()
    .replace(/\/+$/, "");
}

export function resolvePreviewUrl(value: string, origin: string): URL | null {
  if (!value) return null;
  try {
    const base = new URL(`${value.replace(/\/$/, "")}/`, origin);
    const url = new URL("bridge.html", base);
    url.searchParams.set("v", "2");
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}
