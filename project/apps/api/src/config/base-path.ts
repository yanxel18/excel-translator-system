export function normalizeBasePath(value: string | undefined, fallback = '/excel-convert'): string {
  const path = (value || fallback).trim().replace(/^\/+|\/+$/g, '');
  return path ? `/${path}` : '';
}

export function pathAtBase(basePath: string, route: string): string {
  const suffix = route.replace(/^\/+/, '');
  return `${basePath}/${suffix}` || '/';
}
