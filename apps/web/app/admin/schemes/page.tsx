'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Plus } from 'lucide-react';
import { STATES } from '@ujjwal/schemes';
import { ApiError } from '../../../lib/api';
import { adminApi, adminDownload } from '../../../lib/admin-api';
import { ErrorNote, PageTitle } from '../../../components/admin/AdminShell';
import { Badge, Btn, Panel, Table, Td } from '../../../components/admin/bits';

interface Item {
  id: string;
  state: string;
  name: string;
  sector: string;
  level: string;
  scope: string;
  status: 'active' | 'inactive';
  reviewStatus: 'ok' | 'needs_review';
  tags: string[];
  lastVerified: string | null;
}

interface ListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: Item[];
}

export default function SchemesPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ state: '', status: '', review: '', tag: '', q: '', stale: '' });
  const [summary, setSummary] = useState<{ total: number; active: number; needsReview: number; neverVerified: number; stale90: number } | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setError('');
    const p = new URLSearchParams({ page: String(page), pageSize: '50' });
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
    try {
      setData(await adminApi<ListResponse>(`/admin/schemes?${p}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load');
    }
  }, [f, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    adminApi<NonNullable<typeof summary>>('/admin/schemes/summary').then(setSummary).catch(() => undefined);
  }, []);

  const set = (patch: Partial<typeof f>) => {
    setPage(1);
    setF((x) => ({ ...x, ...patch }));
  };

  return (
    <>
      <PageTitle title="Schemes">
        <Btn onClick={() => void adminDownload(`/admin/schemes/export${f.state ? `?state=${encodeURIComponent(f.state)}` : ''}`, 'schemes.xlsx').catch((e) => setError(e.message))}>
          <Download className="h-4 w-4" /> Export Excel
        </Btn>
        <Link href="/admin/schemes/new" className="inline-flex items-center gap-1.5 rounded-xl bg-blue-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-800">
          <Plus className="h-4 w-4" /> New scheme
        </Link>
      </PageTitle>
      <ErrorNote message={error} />
      {summary && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <button type="button" className="rounded-full bg-white px-3 py-1.5 font-semibold shadow-sm" onClick={() => set({ status: '', review: '', stale: '' })}>
            All {summary.total} <span className="font-normal text-slate-500">({summary.active} active)</span>
          </button>
          <button type="button" className="rounded-full bg-amber-100 px-3 py-1.5 font-semibold text-amber-900" onClick={() => set({ review: 'needs_review', stale: '' })}>
            Needs review: {summary.needsReview}
          </button>
          <button type="button" className="rounded-full bg-blue-100 px-3 py-1.5 font-semibold text-blue-900" onClick={() => set({ stale: '90', review: '' })}>
            Not verified in 90 days: {summary.neverVerified + summary.stale90}
          </button>
        </div>
      )}
      <Panel>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input className="field" placeholder="Search name or ID" value={f.q} onChange={(e) => set({ q: e.target.value })} aria-label="Search" />
          <select className="field" value={f.state} onChange={(e) => set({ state: e.target.value })} aria-label="State">
            <option value="">All states</option>
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="field" value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select className="field" value={f.review} onChange={(e) => set({ review: e.target.value })} aria-label="Review">
            <option value="">Any review state</option>
            <option value="needs_review">Needs review</option>
            <option value="ok">Reviewed</option>
          </select>
          <select className="field" value={f.stale} onChange={(e) => set({ stale: e.target.value })} aria-label="Verification">
            <option value="">Any verification date</option>
            <option value="90">Never or over 90 days ago</option>
            <option value="180">Never or over 180 days ago</option>
          </select>
          <input className="field" placeholder="Tag, e.g. #student" value={f.tag} onChange={(e) => set({ tag: e.target.value })} aria-label="Tag" />
        </div>
        <Table headers={['ID', 'Scheme', 'State', 'Level', 'Status', 'Tags', 'Verified']} empty={data && data.items.length === 0 ? 'No schemes match.' : undefined}>
          {data?.items.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50">
              <Td className="whitespace-nowrap font-mono text-xs">
                <Link href={`/admin/schemes/edit/?id=${encodeURIComponent(s.id)}`} className="font-semibold text-blue-900 hover:underline">{s.id}</Link>
              </Td>
              <Td className="max-w-xs">{s.name}</Td>
              <Td>{s.state}</Td>
              <Td>{s.level}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  <Badge tone={s.status === 'active' ? 'green' : 'slate'}>{s.status}</Badge>
                  {s.reviewStatus === 'needs_review' && <Badge tone="amber">needs review</Badge>}
                </div>
              </Td>
              <Td className="max-w-[16rem] text-xs text-slate-500">{s.tags.map((t) => `#${t}`).join(' ')}</Td>
              <Td className="whitespace-nowrap text-xs">{s.lastVerified ?? 'never'}</Td>
            </tr>
          ))}
        </Table>
        {data && (
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <span>{data.total} scheme(s)</span>
            <div className="flex gap-2">
              <Btn disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Btn>
              <Btn disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Btn>
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}
