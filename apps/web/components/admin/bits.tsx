'use client';

import type { ReactNode } from 'react';

export function Badge({ tone = 'slate', children }: { tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue'; children: ReactNode }) {
  const c = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-800',
  }[tone];
  return <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${c}`}>{children}</span>;
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export function Panel({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-base font-bold text-slate-900">{title}</h2>}
          <div className="flex flex-wrap gap-2">{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export function Table({ headers, children, empty }: { headers: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <p className="p-4 text-center text-sm text-slate-500">{empty}</p>}
    </div>
  );
}

export const Td = ({ children, className = '' }: { children?: ReactNode; className?: string }) => (
  <td className={`px-3 py-2 align-top ${className}`}>{children}</td>
);

export function Btn({
  children,
  onClick,
  tone = 'light',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'light' | 'dark' | 'orange' | 'red';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const c = {
    light: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
    dark: 'bg-blue-900 text-white hover:bg-blue-800',
    orange: 'bg-orange-600 text-white hover:bg-orange-700',
    red: 'bg-red-600 text-white hover:bg-red-700',
  }[tone];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${c}`}>
      {children}
    </button>
  );
}

export const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : '-');
