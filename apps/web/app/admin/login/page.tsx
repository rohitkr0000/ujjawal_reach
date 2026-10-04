'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { ShieldCheck } from 'lucide-react';
import { ApiError } from '../../../lib/api';
import { adminApi, setAdminToken, type AdminInfo } from '../../../lib/admin-api';
import { ErrorNote } from '../../../components/admin/AdminShell';

type Stage = 'password' | 'totp' | 'setup';

interface LoginResponse {
  status: 'ok' | 'totp_required' | 'setup_required';
  token?: string;
  setupToken?: string;
  admin?: AdminInfo;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [setupToken, setSetupToken] = useState('');
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');

  const done = (token: string) => {
    setAdminToken(token);
    router.replace('/admin/analytics');
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const login = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await adminApi<LoginResponse>('/admin/auth/login', {
        token: null,
        body: { email, password, ...(stage === 'totp' ? { totp: code } : {}) },
      });
      if (r.status === 'ok' && r.token) return done(r.token);
      if (r.status === 'totp_required') {
        setStage('totp');
        setCode('');
        return;
      }
      if (r.status === 'setup_required' && r.setupToken) {
        const s = await adminApi<{ secret: string; otpauthUrl: string }>('/admin/auth/totp/setup', { token: r.setupToken, body: {} });
        setSetupToken(r.setupToken);
        setSecret(s.secret);
        setQr(await QRCode.toDataURL(s.otpauthUrl, { width: 220, margin: 1 }));
        setStage('setup');
        setCode('');
      }
    });
  };

  const enable = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await adminApi<LoginResponse>('/admin/auth/totp/enable', { token: setupToken, body: { code } });
      if (r.token) done(r.token);
    });
  };

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="card">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin sign in</h1>
            <p className="text-xs text-slate-500">Ujjwal Reach</p>
          </div>
        </div>
        <ErrorNote message={error} />

        {stage !== 'setup' ? (
          <form onSubmit={login} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={stage === 'totp'} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={stage === 'totp'} />
            </div>
            {stage === 'totp' && (
              <div>
                <label className="label" htmlFor="totp">6 digit code from your authenticator app</label>
                <input id="totp" className="field font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required />
              </div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Please wait...' : stage === 'totp' ? 'Verify and sign in' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={enable} className="space-y-4">
            <p className="text-sm text-slate-700">
              First sign in: set up two-step login. Scan this code with Google Authenticator, Microsoft Authenticator or a similar app, then type the 6 digit code it shows.
            </p>
            {qr && (
              <img src={qr} alt="Authenticator QR code" width={220} height={220} className="mx-auto rounded-xl border border-slate-200" />
            )}
            <p className="break-all rounded-xl bg-slate-50 p-3 text-center font-mono text-xs text-slate-600">Or enter this key by hand: {secret}</p>
            <div>
              <label className="label" htmlFor="setupcode">6 digit code</label>
              <input id="setupcode" className="field font-mono tracking-widest" inputMode="numeric" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Please wait...' : 'Turn on and sign in'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
