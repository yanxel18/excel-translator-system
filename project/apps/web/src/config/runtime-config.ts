import { normalizeApiBaseUrl, normalizeWebBasePath } from './paths';

export const WEB_BASE_PATH = normalizeWebBasePath(import.meta.env.VITE_BASE_PATH);
export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);
