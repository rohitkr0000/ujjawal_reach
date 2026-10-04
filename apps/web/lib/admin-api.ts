import { API_URL } from './config';
import { ApiError } from './api';

const KEY = 'ur_admin_token';

/** The admin token lives in sessionStorage: closing the tab signs the admin out. */
export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(t: string | null): void {
  try {
    if (t) sessionStorage.setItem(KEY, t);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  token?: string | null;
}

async function request(path: string, opts: Options): Promise<Response> {
  if (!API_URL) throw new ApiError(0, 'The server is not configured');
  const headers: Record<string, string> = {};
  const token = opts.token === undefined ? getAdminToken() : opts.token;
  if (token) headers['authorization'] = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  try {
    return await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
      headers,
      body,
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server');
  }
}

/** JSON call to an admin endpoint. A 401 clears the token so the layout sends the admin to login. */
export async function adminApi<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await request(path, opts);
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401 && opts.token === undefined) setAdminToken(null);
    throw new ApiError(res.status, data?.message ?? res.statusText, data?.code, data?.details);
  }
  return data as T;
}

/** Download a file endpoint (Excel, CSV) through the browser with the admin token attached. */
export async function adminDownload(path: string, fallbackName: string): Promise<void> {
  const res = await request(path, {});
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).message ?? msg;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface AdminInfo {
  id: string;
  email: string;
  role: 'super_admin' | 'editor';
}
