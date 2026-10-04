'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, Trash2 } from 'lucide-react';
import { ApiError } from '../../../lib/api';
import { adminApi } from '../../../lib/admin-api';
import { ErrorNote, PageTitle, useAdmin } from '../../../components/admin/AdminShell';
import { Badge, Btn, Panel, Table, Td, fmtDate } from '../../../components/admin/bits';

interface UserItem { userId: string; mobile: string; createdAt: string; cards: number; shown: number; clicked: number; lastActivity: string | null }
interface PerScheme { schemeId: string; name: string | null; tags: string[]; times: number; firstAt: string; lastAt: string }
interface Activity {
  user: { id: string; mobile: string; createdAt: string };
  registrations: Array<{ cardId: string; mode: string; state: string; district: string; trackingConsent: boolean; createdAt: string; people: Array<{ name: string; relation: string; mobile: string; age: number; occupation: string }> }>;
  shown: PerScheme[];
  clicked: PerScheme[];
  timeline: Array<{ ts: string; type: string; schemeId: string | null; name: string | null }>;
}

export default function UsersPage() {
  const admin = useAdmin();
  const [items, setItems] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [active, setActive] = useState<Activity | null>(null);
  const [reveal, setReveal] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (q) p.set('q', q);
      const r = await adminApi<{ items: UserItem[]; total: number }>(`/admin/analytics/users?${p}`);
      setItems(r.items);
      setTotal(r.total);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load');
    }
  }, [q, page]);

  useEffect(() => {
    if (admin.role === 'super_admin') void load();
  }, [load, admin.role]);

  const open = async (id: string, revealMobile = false) => {
    setError('');
    try {
      setActive(await adminApi<Activity>(`/admin/analytics/users/${id}/activity?reveal=${revealMobile}`));
      setReveal(revealMobile);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete everything stored about this person (cards, activity, mobile number)? This cannot be undone.')) return;
    try {
      await adminApi(`/admin/users/${id}`, { method: 'DELETE' });
      setActive(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete');
    }
  };

  if (admin.role !== 'super_admin') return <ErrorNote message="Only a super admin can open this page." />;

  return (
    <>
      <PageTitle title="User activity" />
      <p className="mb-4 text-sm text-slate-600">
        Registered users who allowed activity tracking. Mobile numbers are masked; showing a full number is recorded in the audit log, and so is every time you open a person.
      </p>
      <ErrorNote message={error} />

      {!active ? (
        <Panel>
          <input className="field mb-4 max-w-md" placeholder="Search by card ID, full mobile number or member name" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} aria-label="Search" />
          <Table headers={['Mobile', 'Cards', 'Schemes shown', 'Clicks', 'Last activity', '']} empty={items.length === 0 ? 'No users found.' : undefined}>
            {items.map((u) => (
              <tr key={u.userId}>
                <Td className="font-mono">{u.mobile}</Td>
                <Td>{u.cards}</Td>
                <Td>{u.shown}</Td>
                <Td>{u.clicked}</Td>
                <Td className="whitespace-nowrap text-xs">{fmtDate(u.lastActivity)}</Td>
                <Td><Btn onClick={() => void open(u.userId)}><Eye className="h-4 w-4" /> Open</Btn></Td>
              </tr>
            ))}
          </Table>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <span>{total} user(s)</span>
            <div className="flex gap-2">
              <Btn disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Btn>
              <Btn disabled={page * 25 >= total} onClick={() => setPage((p) => p + 1)}>Next</Btn>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Btn onClick={() => setActive(null)}>← Back to list</Btn>
            {!reveal && <Btn onClick={() => void open(active.user.id, true)}><Eye className="h-4 w-4" /> Show full mobile numbers</Btn>}
            <Btn tone="red" onClick={() => void remove(active.user.id)}><Trash2 className="h-4 w-4" /> Delete this person&apos;s data</Btn>
          </div>
          <Panel title={`Mobile ${active.user.mobile}`}>
            {active.registrations.map((r) => (
              <div key={r.cardId} className="mb-3 rounded-xl border border-slate-200 p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <b>{r.cardId}</b> <Badge>{r.mode}</Badge> <span className="text-slate-600">{r.state}, {r.district}</span>
                  <Badge tone={r.trackingConsent ? 'green' : 'amber'}>{r.trackingConsent ? 'tracking allowed' : 'no tracking consent'}</Badge>
                </div>
                <ul className="text-xs text-slate-600">
                  {r.people.map((p, i) => <li key={i}>{p.name} ({p.relation}), age {p.age}, {p.occupation}, {p.mobile}</li>)}
                </ul>
              </div>
            ))}
          </Panel>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Schemes shown to this person">
              <Table headers={['Scheme', 'Times', 'Last']} empty={active.shown.length === 0 ? 'None recorded.' : undefined}>
                {active.shown.map((s) => <tr key={s.schemeId}><Td>{s.name ?? s.schemeId}</Td><Td>{s.times}</Td><Td className="text-xs">{fmtDate(s.lastAt)}</Td></tr>)}
              </Table>
            </Panel>
            <Panel title="Schemes this person clicked (tried to apply)">
              <Table headers={['Scheme', 'Times', 'Last']} empty={active.clicked.length === 0 ? 'None recorded.' : undefined}>
                {active.clicked.map((s) => <tr key={s.schemeId}><Td>{s.name ?? s.schemeId}</Td><Td>{s.times}</Td><Td className="text-xs">{fmtDate(s.lastAt)}</Td></tr>)}
              </Table>
            </Panel>
          </div>
          <Panel title="Recent activity">
            <ul className="space-y-1 text-xs text-slate-600">
              {active.timeline.map((t, i) => <li key={i}>{fmtDate(t.ts)} · {t.type}{t.name ? ` · ${t.name}` : ''}</li>)}
            </ul>
          </Panel>
        </>
      )}
    </>
  );
}
