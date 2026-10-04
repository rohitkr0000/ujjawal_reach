'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileUp, RotateCcw } from 'lucide-react';
import { STATES } from '@ujjwal/schemes';
import { ApiError } from '../../../lib/api';
import { adminApi, adminDownload } from '../../../lib/admin-api';
import { ErrorNote, PageTitle } from '../../../components/admin/AdminShell';
import { Badge, Btn, Panel, Stat, Table, Td, fmtDate } from '../../../components/admin/bits';

interface Summary {
  id: string;
  filename: string;
  state: string | null;
  status: 'preview' | 'applied' | 'cancelled' | 'rolled_back' | 'failed';
  total: number;
  new: number;
  updated: number;
  unchanged: number;
  errors: number;
  createdAt?: string;
  appliedAt?: string | null;
  admin?: string | null;
}

interface PreviewRow {
  rowNumber: number;
  schemeId: string | null;
  name: string | null;
  action: 'new' | 'updated' | 'unchanged' | 'error';
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
  changedFields: string[];
}

const tone = { new: 'green', updated: 'blue', unchanged: 'slate', error: 'red' } as const;
const statusTone = { preview: 'amber', applied: 'green', cancelled: 'slate', rolled_back: 'slate', failed: 'red' } as const;

export default function ImportsPage() {
  const [history, setHistory] = useState<Summary[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ summary: Summary; rows: PreviewRow[] } | null>(null);
  const [filter, setFilter] = useState<'all' | PreviewRow['action']>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory((await adminApi<{ items: Summary[] }>('/admin/imports')).items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load history');
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const upload = () =>
    guard(async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new ApiError(0, 'Choose an .xlsx file first');
      const form = new FormData();
      form.append('file', file);
      if (state) form.append('state', state);
      const r = await adminApi<{ summary: Summary; rows: PreviewRow[] }>('/admin/imports', { form });
      setPreview(r);
      setFilter(r.summary.errors > 0 ? 'error' : 'all');
      await loadHistory();
    });

  const confirm = (onError: 'cancel' | 'skip') =>
    guard(async () => {
      const r = await adminApi<{ new: number; updated: number; published: string[] }>(`/admin/imports/${preview!.summary.id}/confirm`, { body: { onError } });
      setNotice(`Done: ${r.new} new, ${r.updated} updated. The public site now shows the new data${r.published.length ? ` for ${r.published.join(', ')}` : ''}.`);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      await loadHistory();
    });

  const cancel = () =>
    guard(async () => {
      await adminApi(`/admin/imports/${preview!.summary.id}/cancel`, { body: {} });
      setPreview(null);
      await loadHistory();
    });

  const rollback = (id: string) => {
    if (!window.confirm('Roll this import back? New schemes from it are removed and changed schemes return to how they were.')) return;
    void guard(async () => {
      const r = await adminApi<{ restored: number; removed: number }>(`/admin/imports/${id}/rollback`, { body: {} });
      setNotice(`Rolled back: ${r.restored} restored, ${r.removed} removed.`);
      await loadHistory();
    });
  };

  const rows = preview ? preview.rows.filter((r) => filter === 'all' || r.action === filter) : [];

  return (
    <>
      <PageTitle title="Excel upload">
        <Btn onClick={() => void adminDownload('/admin/template', 'Scheme_Template.xlsx').catch((e) => setError(e.message))}>
          <Download className="h-4 w-4" /> Download template
        </Btn>
      </PageTitle>
      <ErrorNote message={error} />
      {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      <Panel title="Step 1: upload a file">
        <p className="mb-4 text-sm text-slate-600">
          Use the template. You will see a preview first; nothing goes live until you confirm. Schemes missing from the file are not deleted.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="file">Excel file (.xlsx, up to 5 MB)</label>
            <input id="file" ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="state">State of this file</label>
            <select id="state" className="field" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">Any (use the State column)</option>
              {STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <Btn tone="dark" onClick={() => void upload()} disabled={busy}><FileUp className="h-4 w-4" /> {busy ? 'Checking...' : 'Check file'}</Btn>
        </div>
      </Panel>

      {preview && (
        <Panel title={`Step 2: preview of ${preview.summary.filename}`}>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Rows" value={preview.summary.total} />
            <Stat label="New" value={preview.summary.new} />
            <Stat label="Updated" value={preview.summary.updated} />
            <Stat label="Unchanged" value={preview.summary.unchanged} />
            <Stat label="Errors" value={preview.summary.errors} />
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {(['all', 'new', 'updated', 'unchanged', 'error'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                {f}
              </button>
            ))}
            {preview.summary.errors > 0 && (
              <Btn onClick={() => void adminDownload(`/admin/imports/${preview.summary.id}/errors`, 'import-errors.csv').catch((e) => setError(e.message))}>
                <Download className="h-4 w-4" /> Error report (CSV)
              </Btn>
            )}
          </div>
          <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-slate-200">
            <Table headers={['Excel row', 'ID', 'Scheme', 'Result', 'Details']}>
              {rows.map((r) => (
                <tr key={r.rowNumber}>
                  <Td>{r.rowNumber}</Td>
                  <Td className="font-mono text-xs">{r.schemeId ?? '-'}</Td>
                  <Td className="max-w-xs">{r.name ?? '-'}</Td>
                  <Td><Badge tone={tone[r.action]}>{r.action}</Badge></Td>
                  <Td className="text-xs">
                    {r.errors.map((e, i) => <div key={i} className="text-red-700">{e.field}: {e.message}</div>)}
                    {r.action === 'updated' && <div className="text-blue-800">Changed: {r.changedFields.join(', ')}</div>}
                    {r.warnings.map((w, i) => <div key={i} className="text-amber-700">{w.field}: {w.message}</div>)}
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Btn tone="orange" disabled={busy || preview.summary.errors > 0 || preview.summary.new + preview.summary.updated === 0} onClick={() => void confirm('cancel')}>
              Step 3: import and publish
            </Btn>
            {preview.summary.errors > 0 && (
              <Btn disabled={busy || preview.summary.new + preview.summary.updated === 0} onClick={() => void confirm('skip')}>
                Skip the {preview.summary.errors} error row(s) and import the rest
              </Btn>
            )}
            <Btn onClick={() => void cancel()} disabled={busy}>Cancel</Btn>
          </div>
        </Panel>
      )}

      <Panel title="Import history">
        <Table headers={['When', 'File', 'State', 'By', 'Result', 'Status', '']} empty={history.length === 0 ? 'No imports yet.' : undefined}>
          {history.map((h) => (
            <tr key={h.id}>
              <Td className="whitespace-nowrap text-xs">{fmtDate(h.createdAt)}</Td>
              <Td className="max-w-[14rem] truncate">{h.filename}</Td>
              <Td>{h.state ?? 'any'}</Td>
              <Td className="text-xs">{h.admin ?? 'system'}</Td>
              <Td className="text-xs">{h.new} new · {h.updated} updated · {h.unchanged} same · {h.errors} errors</Td>
              <Td><Badge tone={statusTone[h.status]}>{h.status.replace('_', ' ')}</Badge></Td>
              <Td>
                {h.status === 'applied' && (
                  <Btn onClick={() => rollback(h.id)} disabled={busy}><RotateCcw className="h-3.5 w-3.5" /> Roll back</Btn>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
