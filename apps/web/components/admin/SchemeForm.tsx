'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BENEFICIARIES,
  CASTES,
  CHANNELS,
  EDUCATION_LEVELS,
  GENDER_FOCUS,
  LEVELS,
  RESIDENCE_TYPES,
  SCOPES,
  STATES,
  STATUSES,
} from '@ujjwal/schemes';
import { ApiError } from '../../lib/api';
import { adminApi } from '../../lib/admin-api';
import { ErrorNote, PageTitle, useAdmin } from './AdminShell';
import { Badge, Btn, Panel, fmtDate } from './bits';

type Row = Record<string, string | number | null>;

interface Loaded {
  scheme: { id: string; reviewStatus: 'ok' | 'needs_review'; state: string };
  row: Row;
  versions: Array<{ id: number; action: string; created_at: string; admin_email: string | null }>;
}

const SINGLE: Array<{ key: string; label: string; options: readonly string[]; blank?: string }> = [
  { key: 'State', label: 'State *', options: STATES, blank: 'Select' },
  { key: 'Level', label: 'Level *', options: LEVELS, blank: 'Select' },
  { key: 'Scope', label: 'Scope', options: SCOPES },
  { key: 'Gender_Focus', label: 'Gender focus', options: GENDER_FOCUS },
  { key: 'Residence_Type', label: 'Residence', options: RESIDENCE_TYPES },
  { key: 'Application_Channel', label: 'Application channel', options: CHANNELS },
  { key: 'Status', label: 'Status', options: STATUSES },
];

const MULTI: Array<{ key: string; label: string; options: readonly string[] }> = [
  { key: 'Caste_Category', label: 'Caste categories (blank = any)', options: CASTES },
  { key: 'Beneficiary_Type', label: 'Beneficiary types (blank = any)', options: BENEFICIARIES },
  { key: 'Education_Levels', label: 'Education levels (blank = any)', options: EDUCATION_LEVELS },
];

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** Create (no id) or edit (id) one scheme. The fields are the columns of the Excel template. */
export function SchemeForm({ id }: { id?: string }) {
  const router = useRouter();
  const admin = useAdmin();
  const [row, setRow] = useState<Row>({ Scope: 'Individual', Gender_Focus: 'All', Status: 'active', Residence_Type: 'Any', Application_Channel: 'Other' });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    adminApi<Loaded>(`/admin/schemes/${encodeURIComponent(id)}`)
      .then((r) => {
        setLoaded(r);
        setRow(r.row);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load'));
  }, [id]);

  const set = (k: string, v: string) => setRow((r) => ({ ...r, [k]: v }));
  const multi = (k: string) => text(row[k]).split(',').map((x) => x.trim()).filter(Boolean);
  const toggle = (k: string, v: string, on: boolean) => {
    const cur = multi(k).filter((x) => x !== v);
    set(k, (on ? [...cur, v] : cur).join(', '));
  };

  const call = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError('');
    setFieldErrors({});
    setOk('');
    try {
      await fn();
      setOk(success);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        const errs = e.details?.errors as Array<{ field: string; message: string }> | undefined;
        if (errs) setFieldErrors(Object.fromEntries(errs.map((x) => [x.field, x.message])));
      } else setError('Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    call(async () => {
      if (id) {
        const r = await adminApi<{ scheme: Loaded['scheme'] }>(`/admin/schemes/${encodeURIComponent(id)}`, { method: 'PATCH', body: { row } });
        setLoaded((l) => (l ? { ...l, scheme: r.scheme as Loaded['scheme'] } : l));
      } else {
        await adminApi('/admin/schemes', { body: { row } });
        router.replace(`/admin/schemes/edit/?id=${encodeURIComponent(text(row['Scheme_ID']))}`);
      }
    }, 'Saved. The public site is updated.');

  const err = (k: string) => fieldErrors[k] && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors[k]}</p>;
  const input = (key: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label">{label}</label>
      <input className={`field ${fieldErrors[key] ? 'field-error' : ''}`} value={text(row[key])} onChange={(e) => set(key, e.target.value)} {...props} />
      {err(key)}
    </div>
  );

  return (
    <>
      <PageTitle title={id ? `Edit ${id}` : 'New scheme'}>
        <Link href="/admin/schemes" className="rounded-xl bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200">Back to list</Link>
      </PageTitle>
      <ErrorNote message={error} />
      {ok && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{ok}</p>}

      {loaded?.scheme.reviewStatus === 'needs_review' && (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-amber-900">
              <Badge tone="amber">needs review</Badge> The rules of this scheme were unclear in the source file, so it is <b>hidden from the public</b>. Check the rules below against the official page, then confirm.
            </p>
            <Btn tone="orange" disabled={busy} onClick={() => void call(async () => {
              const r = await adminApi<{ scheme: Loaded['scheme'] }>(`/admin/schemes/${encodeURIComponent(id!)}/confirm-review`, { body: {} });
              setLoaded((l) => (l ? { ...l, scheme: r.scheme } : l));
              const fresh = await adminApi<Loaded>(`/admin/schemes/${encodeURIComponent(id!)}`);
              setRow(fresh.row);
            }, 'Confirmed. The scheme is now public.')}>
              I checked it: make it public
            </Btn>
          </div>
        </Panel>
      )}

      <Panel title="Basic details">
        <div className="grid gap-4 md:grid-cols-2">
          {input('Scheme_ID', 'Scheme ID *', { disabled: !!id, placeholder: 'DEL-084' })}
          {input('Scheme Name', 'Scheme name *')}
          {input('Category / Sector', 'Category / sector')}
          {SINGLE.slice(0, 2).map((s) => (
            <div key={s.key}>
              <label className="label">{s.label}</label>
              <select className={`field ${fieldErrors[s.key] ? 'field-error' : ''}`} value={text(row[s.key])} onChange={(e) => set(s.key, e.target.value)}>
                {s.blank && <option value="">{s.blank}</option>}
                {s.options.map((o) => <option key={o}>{o}</option>)}
              </select>
              {err(s.key)}
            </div>
          ))}
          {input('Application_URL', 'Official link *', { type: 'url', placeholder: 'https://' })}
          <div className="md:col-span-2">
            <label className="label">Description (English)</label>
            <textarea className={`field min-h-[80px] ${fieldErrors['Description'] ? 'field-error' : ''}`} value={text(row['Description'])} onChange={(e) => set('Description', e.target.value)} />
            {err('Description')}
          </div>
          <div className="md:col-span-2">
            <label className="label">Description (Hindi)</label>
            <textarea className="field min-h-[80px]" value={text(row['Description_Hindi'])} onChange={(e) => set('Description_Hindi', e.target.value)} />
            {err('Description_Hindi')}
          </div>
        </div>
      </Panel>

      <Panel title="Who is eligible (rules)">
        <div className="grid gap-4 md:grid-cols-3">
          {input('Age_Min', 'Minimum age', { inputMode: 'numeric' })}
          {input('Age_Max', 'Maximum age (blank = no limit)', { inputMode: 'numeric' })}
          {input('Income_Max', 'Income limit in rupees', { inputMode: 'numeric' })}
          {SINGLE.slice(2, 4).map((s) => (
            <div key={s.key}>
              <label className="label">{s.label}</label>
              <select className="field" value={text(row[s.key])} onChange={(e) => set(s.key, e.target.value)}>
                {s.options.map((o) => <option key={o}>{o}</option>)}
              </select>
              {err(s.key)}
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {MULTI.map((m) => (
            <fieldset key={m.key}>
              <legend className="label">{m.label}</legend>
              <div className="space-y-1.5">
                {m.options.map((o) => (
                  <label key={o} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={multi(m.key).includes(o)} onChange={(e) => toggle(m.key, o, e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-orange-600" />
                    {o}
                  </label>
                ))}
              </div>
              {err(m.key)}
            </fieldset>
          ))}
        </div>
      </Panel>

      <Panel title="Publishing">
        <div className="grid gap-4 md:grid-cols-3">
          {SINGLE.slice(4).map((s) => (
            <div key={s.key}>
              <label className="label">{s.label}</label>
              <select className="field" value={text(row[s.key])} onChange={(e) => set(s.key, e.target.value)}>
                {s.options.map((o) => <option key={o}>{o}</option>)}
              </select>
              {err(s.key)}
            </div>
          ))}
          {input('Last_Verified_Date', 'Last verified on', { type: 'date' })}
          {input('Tags', 'Extra tags', { placeholder: '#featured #newscheme' })}
          <div className="md:col-span-3">
            <label className="label">Source note (write &quot;needs review&quot; if rules are unclear)</label>
            <input className={`field ${fieldErrors['Source_Note'] ? 'field-error' : ''}`} value={text(row['Source_Note'])} onChange={(e) => set('Source_Note', e.target.value)} />
            {err('Source_Note')}
          </div>
        </div>
      </Panel>

      <div className="mb-8 flex flex-wrap gap-3">
        <Btn tone="orange" onClick={() => void save()} disabled={busy}>{busy ? 'Saving...' : id ? 'Save changes' : 'Create scheme'}</Btn>
        {id && admin.role === 'super_admin' && (
          <Btn tone="red" disabled={busy} onClick={() => {
            if (!window.confirm(`Delete ${id} permanently? It disappears from the public site.`)) return;
            void call(async () => {
              await adminApi(`/admin/schemes/${encodeURIComponent(id)}`, { method: 'DELETE' });
              router.replace('/admin/schemes');
            }, 'Deleted');
          }}>Delete</Btn>
        )}
      </div>

      {loaded && loaded.versions.length > 0 && (
        <Panel title="History">
          <ul className="space-y-1 text-sm text-slate-600">
            {loaded.versions.map((v) => (
              <li key={v.id}>{fmtDate(v.created_at)} · {v.action} · {v.admin_email ?? 'system'}</li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
