'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, FileSpreadsheet, LogOut, Shield, Upload, Users } from 'lucide-react';
import { adminApi, getAdminToken, setAdminToken, type AdminInfo } from '../../lib/admin-api';

const AdminContext = createContext<AdminInfo | null>(null);

export function useAdmin(): AdminInfo {
  const a = useContext(AdminContext);
  if (!a) throw new Error('useAdmin must be used inside AdminShell');
  return a;
}

const NAV: Array<{ href: string; label: string; icon: typeof BarChart3; superOnly?: boolean }> = [
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/schemes', label: 'Schemes', icon: FileSpreadsheet },
  { href: '/admin/imports', label: 'Excel upload', icon: Upload },
  { href: '/admin/users', label: 'User activity', icon: Users, superOnly: true },
  { href: '/admin/admins', label: 'Admins & audit', icon: Shield, superOnly: true },
];

/** Wraps every admin page: checks the login, shows the menu. The login page is left alone. */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Static hosting adds a trailing slash to addresses: ignore it.
  const path = (usePathname() ?? '').replace(/\/+$/, '');
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const isLogin = path === '/admin/login';

  useEffect(() => {
    if (isLogin) return;
    if (!getAdminToken()) {
      router.replace('/admin/login');
      return;
    }
    adminApi<{ admin: AdminInfo }>('/admin/auth/me')
      .then((r) => setAdmin(r.admin))
      .catch(() => {
        setAdminToken(null);
        router.replace('/admin/login');
      });
  }, [isLogin, router, path]);

  if (isLogin) return <>{children}</>;
  if (!admin) return <p className="p-10 text-center text-slate-500">Loading...</p>;

  return (
    <AdminContext.Provider value={admin}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <nav className="flex flex-wrap gap-1">
            {NAV.filter((n) => !n.superOnly || admin.role === 'super_admin').map((n) => {
              const active = path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    active ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <n.icon className="h-4 w-4" /> {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              {admin.email} <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold">{admin.role}</span>
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 font-semibold text-red-600 hover:underline"
              onClick={() => {
                setAdminToken(null);
                router.replace('/admin/login');
              }}
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
        {children}
      </div>
    </AdminContext.Provider>
  );
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      {message}
    </p>
  );
}
