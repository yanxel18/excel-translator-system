import { useEffect, useState } from 'react';
import type { View } from './types';

const views: View[] = ['dashboard', 'workspace', 'history', 'vocabulary', 'notifications', 'changelog', 'profile', 'settings/users', 'settings/users/new', 'settings/bases', 'settings/authentication'];
const base = import.meta.env.BASE_URL;

export function readRoute() {
  const { pathname, search } = window.location;
  const prefix = base === '/' ? '/' : base;
  const relative = pathname === prefix.slice(0, -1) ? '' : pathname.startsWith(prefix) ? pathname.slice(prefix.length) : null;
  const segment = relative?.replace(/\/$/, '');
  const view = segment === '' ? 'workspace' : views.find((item) => item === segment) ?? null;
  const rawPage = new URLSearchParams(search).get('page');
  const page = rawPage && /^[1-9]\d*$/.test(rawPage) ? Math.min(Number(rawPage), 100000) : 1;
  return { view, page: Number.isSafeInteger(page) ? page : 1, search };
}

export function useAppRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const navigate = (view: View, page?: number, params?: URLSearchParams) => {
    const path = `${base}${view === 'workspace' ? '' : view}`;
    const query = params ? (params.toString() ? `?${params}` : '') : page && page > 1 ? `?page=${Math.min(Math.floor(page), 100000)}` : '';
    if (`${window.location.pathname}${window.location.search}` !== `${path}${query}`) window.history.pushState(null, '', `${path}${query}`);
    setRoute(readRoute());
  };
  return { ...route, navigate };
}
