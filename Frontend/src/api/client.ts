import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

/** Backend base URL. Default '/api/v1' uses the Vite proxy (dev) or the same server (prod).
 *  Set VITE_API_URL (e.g. https://api.example.com/api/v1) when Frontend and Backend are hosted separately. */
export const API_URL: string = import.meta.env.VITE_API_URL || '/api/v1';
export const api = axios.create({ baseURL: API_URL, withCredentials: true });

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

/** One shared /auth/refresh call at a time (page load, parallel 401s, StrictMode double effects). */
let sessionPromise: Promise<any> | null = null;
export function refreshSession() {
  sessionPromise ??= axios
    .post(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
    .then((r) => {
      setAccessToken(r.data.data.accessToken);
      return r.data.data;
    })
    .finally(() => setTimeout(() => (sessionPromise = null), 1000));
  return sessionPromise;
}

// When the 15-minute access token expires, refresh it once (using the httpOnly cookie) and retry.
let refreshing: Promise<string | null> | null = null;
let onSessionExpired: () => void = () => {};
export const setSessionExpiredHandler = (fn: () => void) => {
  onSessionExpired = fn;
};

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const cfg = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && cfg && !cfg._retry && !cfg.url?.startsWith('/auth/')) {
      cfg._retry = true;
      refreshing ??= refreshSession()
        .then((d) => d.accessToken as string)
        .catch(() => null)
        .finally(() => setTimeout(() => (refreshing = null), 0));
      const token = await refreshing;
      if (token) {
        cfg.headers.Authorization = `Bearer ${token}`;
        return api(cfg);
      }
      onSessionExpired();
    }
    return Promise.reject(error);
  },
);

export function errMsg(e: unknown): string {
  const ax = e as AxiosError<{ error?: { message?: string } }>;
  return ax?.response?.data?.error?.message ?? (ax?.message === 'Network Error' ? 'Cannot reach the server. Is the API running?' : ax?.message) ?? 'Something went wrong';
}

/** GET helper that unwraps { data } */
export const get = async <T = any>(url: string, params?: Record<string, unknown>) => (await api.get(url, { params })).data.data as T;
export const post = async <T = any>(url: string, body?: unknown) => (await api.post(url, body ?? {})).data.data as T;
export const put = async <T = any>(url: string, body?: unknown) => (await api.put(url, body ?? {})).data.data as T;
export const patch = async <T = any>(url: string, body?: unknown) => (await api.patch(url, body ?? {})).data.data as T;
export const del = async <T = any>(url: string) => (await api.delete(url)).data.data as T;

/** Download / open a file served by an authenticated endpoint */
export async function openAuthed(url: string, filename?: string) {
  const r = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(r.data);
  if (filename) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
  } else window.open(blobUrl, '_blank');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
