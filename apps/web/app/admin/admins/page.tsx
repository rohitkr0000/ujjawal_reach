'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../lib/api';
import { adminApi } from '../../../lib/admin-api';
import { ErrorNote, PageTitle, useAdmin } from '../../../components/admin/AdminShell';
import { Badge, Btn, Panel, Table, Td, fmtDate } from '../../../components/admin/bits';

interface AdminRow { id: string; email: string; role: 'super_admin' | 'editor'; active: boolean; totp_enabled: boolean; created_at: string; last_login_at: string | null }
interface AuditRow { id: number; ts: string; admin_email: string | null; action: string; target: string | null; details: unknown; ip: string | null }

export default function AdminsPage() {
  const me = useAdmin();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ email: '', password: '', role: 'editor' as 'editor' | 'super_admin' });

  const load = useCallback(async () => {
    try {
      setAdmins((await adminApi<{ items: AdminRow[] }>('/admin/admins')).items);
      setAudit((await adminApi<{ items: AuditRow[] }>('/admin/audit?limit=100')).items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load');
    }
  }, []);

  useEffect(() => {
    if (me.role === 'super_admin') void load();
  }, [load, me.role]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(ok);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  };

  if (me.role !== 'super_admin') return <ErrorNote message="Only a super admin can open this page." />;

  return (
    <>
      <PageTitle title="Admins & audit log" />
      <ErrorNote message={error} />
      {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      <Panel title="Add an admin">
        <form
          className="grid gap-3 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => adminApi('/admin/admins', { body: form }), 'Admin created. They set up two-step login on their first sign in.').then(() => setForm({ email: '', password: '', role: 'editor' }));
          }}
        >
          <input className="field" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required aria-label="Email" />
          <input className="field" type="password" placeholder="Temporary password (12+ characters, letters and numbers)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={12} autoComplete="new-password" aria-label="Password" />
          <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'editor' | 'super_admin' })} aria-label="Role">
            <option value="editor">Editor (upload, edit, analytics)</option>
            <option value="super_admin">Super admin (everything)</option>
          </select>
          <Btn type="submit" tone="dark">Create</Btn>
        </form>
      </Panel>

      <Panel title="Admins">
        <Table headers={['Email', 'Role', 'Two-step', 'Last sign in', 'Status', '']}>
          {admins.map((a) => (
            <tr key={a.id}>
              <Td>{a.email}</Td>
              <Td><Badge tone={a.role === 'super_admin' ? 'blue' : 'slate'}>{a.role}</Badge></Td>
              <Td>{a.totp_enabled ? 'on' : 'not set up'}</Td>
              <Td className="text-xs">{fmtDate(a.last_login_at)}</Td>
              <Td><Badge tone={a.active ? 'green' : 'red'}>{a.active ? 'active' : 'disabled'}</Badge></Td>
              <Td>
                <div className="flex flex-wrap gap-2">
                  {a.id !== me.id && (
                    <Btn onClick={() => void run(() => adminApi(`/admin/admins/${a.id}`, { method: 'PATCH', body: { active: !a.active } }), a.active ? 'Admin disabled.' : 'Admin enabled.')}>
                      {a.active ? 'Disable' : 'Enable'}
                    </Btn>
                  )}
                  <Btn onClick={() => { if (window.confirm(`Reset two-step login for ${a.email}? They will set it up again on next sign in.`)) void run(() => adminApi(`/admin/admins/${a.id}`, { method: 'PATCH', body: { resetTotp: true } }), 'Two-step login reset.'); }}>
                    Reset 2-step
                  </Btn>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title="Audit log (latest 100)">
        <Table headers={['When', 'Admin', 'Action', 'Target', 'IP']}>
          {audit.map((a) => (
            <tr key={a.id}>
              <Td className="whitespace-nowrap text-xs">{fmtDate(a.ts)}</Td>
              <Td className="text-xs">{a.admin_email ?? 'system'}</Td>
              <Td className="font-mono text-xs">{a.action}</Td>
              <Td className="max-w-[14rem] truncate text-xs">{a.target ?? ''}</Td>
              <Td className="text-xs">{a.ip ?? ''}</Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
