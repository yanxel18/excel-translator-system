export function normalizeWebBasePath(value: string | undefined): string {
  const path = (value || "/excel-convert/").trim().replace(/^\/+|\/+$/g, "");
  return path ? `/${path}/` : "/";
}

export function normalizeApiBaseUrl(value: string | undefined): string {
  return (value || "http://localhost:3000/excel-convert")
    .trim()
    .replace(/\/+$/, "");
}
