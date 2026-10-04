'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, User, Users } from 'lucide-react';
import type { PublicSchemesFile } from '@ujjwal/schemes';
import { ACTIVE_STATES, LOCKED_STATES } from '../lib/config';
import { useLang } from '../lib/i18n';
import { loadSchemes } from '../lib/schemes';
import { api } from '../lib/api';
import { API_URL } from '../lib/config';
import { buildRegistrationPayload, type SaveResult } from '../lib/registration';
import { flush, getConsent, setConsent, track } from '../lib/tracking';
import { FamilyForm, PersonalForm, type SubmitData } from './forms';
import { Results, type SaveState } from './Results';

type View = 'state' | 'mode' | 'personal' | 'family' | 'results';

export function PortalFlow() {
  const { t, lang } = useLang();
  const [view, setView] = useState<View>('state');
  const [state, setState] = useState('');
  const [schemes, setSchemes] = useState<PublicSchemesFile | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState<SubmitData | null>(null);
  const [save, setSave] = useState<SaveState | undefined>(undefined);

  const started = useRef(false);
  const submitted = useRef(false);
  const modeRef = useRef<'personal' | 'family' | ''>('');
  const stateRef = useRef('');

  // If the visitor leaves in the middle of a form, record that the form was abandoned.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && started.current && !submitted.current) {
        started.current = false;
        track('form_abandoned', { state: stateRef.current, props: { mode: modeRef.current } });
        void flush();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchSchemes = useCallback((s: string) => {
    setLoadError(false);
    setSchemes(null);
    loadSchemes(s)
      .then(setSchemes)
      .catch(() => setLoadError(true));
  }, []);

  const selectState = (name: string) => {
    setState(name);
    stateRef.current = name;
    setNotice('');
    track('state_selected', { state: name });
    fetchSchemes(name);
    go('mode');
  };

  const openMode = (mode: 'personal' | 'family') => {
    modeRef.current = mode;
    started.current = false;
    submitted.current = false;
    track('mode_selected', { state, props: { mode } });
    go(mode);
  };

  const onStart = () => {
    if (started.current || submitted.current) return;
    started.current = true;
    track('form_started', { state, props: { mode: modeRef.current } });
  };

  const onStep = (step: string) =>
    track('form_step_completed', { state, props: { mode: modeRef.current, step } });

  /** Save the submitted form on the server. The visitor already agreed on the form; no login. */
  const saveRegistration = useCallback(async (d: SubmitData) => {
    if (!API_URL) return;
    setSave({ status: 'saving' });
    try {
      // The tracking choice made on the form is the visitor's latest decision.
      if (d.consentTracking && getConsent() !== 'granted') setConsent('granted');
      await flush(); // send queued events first so the server can link them to this person
      const r = await api<SaveResult>('/registrations', { body: buildRegistrationPayload(d) });
      setSave({ status: 'saved', cardId: r.cardId });
    } catch {
      setSave({ status: 'failed' });
    }
  }, []);

  const onSubmit = (d: SubmitData) => {
    submitted.current = true;
    track('form_submitted', { state, props: { mode: d.mode, people: d.people.length } });
    setResults(d);
    setSave(undefined);
    void saveRegistration(d);
    go('results');
  };

  const restart = () => {
    setResults(null);
    setSave(undefined);
    setState('');
    started.current = false;
    submitted.current = false;
    go('state');
  };

  const scheme_ready = schemes !== null;

  return (
    <>
      {/* Hero */}
      <section className="hero-gradient relative overflow-hidden py-12 text-white sm:py-16">
        <div className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-96 w-96 rounded-full bg-orange-600/20 blur-3xl" />
        <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-xs font-semibold text-orange-400 shadow-inner backdrop-blur-md sm:text-sm">
            ✨ {t('heroBy')}
          </div>
          <h1 className="mb-5 text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            {t('heroTitleA')}{' '}
            <span className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">
              {t('heroTitleB')}
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            {state && view !== 'state' ? t('heroSubtitleState', { state }) : t('heroSubtitle')}
          </p>
        </div>
      </section>

      <main className="mx-auto mb-20 max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        {view === 'state' && (
          <section aria-labelledby="step1" className="space-y-6">
            <div className="mx-auto mb-8 max-w-xl text-center">
              <h2 id="step1" className="mb-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">
                {t('step1Title')}
              </h2>
              <p className="text-sm text-slate-600">{t('step1Text')}</p>
            </div>
            {notice && (
              <p role="status" className="mx-auto max-w-xl rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-900">
                {notice}
              </p>
            )}
            <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3">
              {ACTIVE_STATES.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => selectState(s.name)}
                  className="group rounded-2xl border-2 border-slate-100 bg-white p-6 text-center shadow-md transition hover:border-orange-500 hover:shadow-xl"
                >
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-lg font-bold text-blue-900 transition group-hover:bg-orange-500 group-hover:text-white">
                    {s.code}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{s.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">{t('stateSub', { state: lang === 'hi' ? s.hindi : s.name })}</p>
                  <span className="mt-3 inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    {t('activeReady')}
                  </span>
                </button>
              ))}
              {LOCKED_STATES.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setNotice(t('lockedAlert', { state: s.name }))}
                  className="cursor-not-allowed rounded-2xl border-2 border-slate-200 bg-slate-50 p-6 text-center opacity-60 shadow-sm"
                >
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200 text-lg font-bold text-slate-600">
                    {s.code}
                  </div>
                  <h3 className="text-lg font-bold text-slate-700">{s.name === 'Other State' ? t('otherState') : s.name}</h3>
                  <p className="mt-1 text-xs text-slate-400">{t('comingSoon')}</p>
                  <span className="mt-3 inline-block rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    {t('locked')}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {view !== 'state' && view !== 'results' && loadError && (
          <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <span>{t('schemesLoadError')}</span>
            <button type="button" className="btn-secondary" onClick={() => fetchSchemes(state)}>
              {t('startOver')}
            </button>
          </div>
        )}

        {view === 'mode' && (
          <div className="grid gap-8 md:grid-cols-2 lg:gap-10">
            <ModeCard
              tone="blue"
              badge={t('individual')}
              icon={<User className="h-8 w-8" />}
              title={t('personalTitle')}
              desc={t('personalDesc', { state })}
              bullets={[t('personalB1'), t('personalB2'), t('personalB3')]}
              cta={t('proceedPersonal')}
              onClick={() => openMode('personal')}
            />
            <ModeCard
              tone="orange"
              badge={t('mostPopular')}
              icon={<Users className="h-8 w-8" />}
              title={t('familyTitle')}
              desc={t('familyDesc', { state })}
              bullets={[t('familyB1'), t('familyB2'), t('familyB3')]}
              cta={t('proceedFamily')}
              onClick={() => openMode('family')}
            />
          </div>
        )}

        {view === 'personal' && (
          <PersonalForm state={state} onSubmit={onSubmit} onBack={() => go('mode')} onStart={onStart} onStep={onStep} />
        )}
        {view === 'family' && (
          <FamilyForm state={state} onSubmit={onSubmit} onBack={() => go('mode')} onStart={onStart} onStep={onStep} />
        )}

        {view === 'results' && results && (
          scheme_ready ? (
            <Results data={results} schemes={schemes} onRestart={restart} save={save} onRetrySave={() => void saveRegistration(results)} />
          ) : loadError ? (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {t('schemesLoadError')}
              <button type="button" className="btn-secondary ml-3" onClick={() => fetchSchemes(state)}>
                {t('startOver')}
              </button>
            </div>
          ) : (
            <p className="p-6 text-center text-slate-500">{t('loadingSchemes')}</p>
          )
        )}
      </main>
    </>
  );
}

function ModeCard({
  tone,
  badge,
  icon,
  title,
  desc,
  bullets,
  cta,
  onClick,
}: {
  tone: 'blue' | 'orange';
  badge: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  bullets: string[];
  cta: string;
  onClick: () => void;
}) {
  const blue = tone === 'blue';
  return (
    <div
      onClick={onClick}
      className="group relative flex cursor-pointer flex-col justify-between rounded-3xl border border-slate-100 bg-white p-8 shadow-xl shadow-slate-200/50 transition-all duration-300 hover:-translate-y-2"
    >
      <span
        className={`absolute right-6 top-6 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
          blue ? 'border-blue-100 bg-blue-50 text-blue-700' : 'border-orange-100 bg-orange-50 text-orange-700'
        }`}
      >
        {badge}
      </span>
      <div>
        <div
          className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg transition-transform group-hover:scale-110 ${
            blue ? 'bg-gradient-to-tr from-blue-700 to-indigo-600 shadow-blue-500/30' : 'bg-gradient-to-tr from-orange-600 to-amber-500 shadow-orange-500/30'
          }`}
        >
          {icon}
        </div>
        <h2 className="mb-3 text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="mb-6 text-sm leading-relaxed text-slate-600">{desc}</p>
        <ul className="mb-8 space-y-3 text-sm text-slate-600">
          {bullets.map((b) => (
            <li key={b} className="flex items-center gap-2">
              <CheckCircle2 className={`h-4 w-4 shrink-0 ${blue ? 'text-blue-600' : 'text-orange-600'}`} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        className={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-white shadow-md ${
          blue ? 'bg-blue-900 hover:bg-blue-950' : 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700'
        }`}
      >
        <span>{cta}</span>
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </button>
    </div>
  );
}
