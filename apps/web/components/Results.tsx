'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, MapPin, RotateCcw } from 'lucide-react';
import { matchSchemes } from '@ujjwal/schemes';
import type { PublicScheme, PublicSchemesFile } from '@ujjwal/schemes';
import { useLang } from '../lib/i18n';
import { track } from '../lib/tracking';
import type { SubmitData } from './forms';

export function SchemeCard({
  scheme,
  tone,
  state,
}: {
  scheme: PublicScheme;
  tone: 'orange' | 'blue';
  state: string;
}) {
  const { t, lang } = useLang();
  const description = lang === 'hi' && scheme.descriptionHi ? scheme.descriptionHi : scheme.description;
  const btn = tone === 'orange' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-900 hover:bg-blue-800';
  const box = tone === 'orange' ? 'border-orange-100 bg-orange-50/50' : 'border-slate-200 bg-white';
  return (
    <div className={`flex flex-col justify-between gap-3 rounded-xl border p-4 shadow-sm md:flex-row md:items-center ${box}`}>
      <div className="min-w-0">
        <h5 className="text-sm font-semibold text-slate-900">{scheme.name}</h5>
        {description && <p className="mt-1 text-xs text-slate-600">{description}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
          {scheme.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
              #{tag}
            </span>
          ))}
          <span>
            {scheme.lastVerified ? t('verifiedOn', { date: scheme.lastVerified }) : t('notVerified')}
          </span>
        </p>
      </div>
      <a
        href={scheme.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('scheme_clicked', { schemeId: scheme.id, state })}
        className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-medium text-white shadow transition ${btn}`}
      >
        {t('officialPage')} <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

export type SaveState = { status: 'saving' } | { status: 'saved'; cardId: string } | { status: 'failed' };

export function Results({
  data,
  schemes,
  onRestart,
  save,
  onRetrySave,
}: {
  data: SubmitData;
  schemes: PublicSchemesFile;
  onRestart: () => void;
  /** What happened when the form was saved on the server (absent when there is no server). */
  save?: SaveState;
  onRetrySave?: () => void;
}) {
  const { t } = useLang();
  const [tab, setTab] = useState(0);

  const result = useMemo(
    () =>
      matchSchemes(
        schemes.schemes,
        data.people.map((p) => p.profile),
      ),
    [schemes, data],
  );
  const isPersonal = data.mode === 'personal';
  const personalList = result.perPerson[0] ?? [];
  const total = new Set([...result.household, ...result.perPerson.flat()].map((s) => s.id)).size;

  // Record which schemes were shown to this visitor (only if they allowed tracking).
  useEffect(() => {
    const ids = new Set([...result.household, ...result.perPerson.flat()].map((s) => s.id));
    ids.forEach((id) => track('scheme_shown', { schemeId: id, state: data.state }));
  }, [result, data.state]);

  const current = result.perPerson[tab] ?? [];
  const person = data.people[tab];

  return (
    <div className="space-y-6">
      <div className="card border-2 border-orange-200">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-orange-950">{t('resultsTitle', { state: data.state })}</h3>
            <p className="text-xs text-slate-500">{t('schemesFound', { n: total })}</p>
          </div>
          <button type="button" onClick={onRestart} className="btn-secondary">
            <RotateCcw className="h-4 w-4" /> {t('startOver')}
          </button>
        </div>
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3.5 text-xs font-medium text-blue-900 sm:text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>{t('addressLabel')}:</b> {data.addressText}
          </span>
        </div>
        {save && save.status === 'saving' && <p className="mb-4 text-xs text-slate-500">{t('saving')}</p>}
        {save && save.status === 'saved' && (
          <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
            {t('savedOk', { id: save.cardId })}
          </p>
        )}
        {save && save.status === 'failed' && (
          <p role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {t('savedFail')}
            {onRetrySave && (
              <button type="button" onClick={onRetrySave} className="font-semibold underline">
                {t('retrySave')}
              </button>
            )}
          </p>
        )}
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{t('disclaimer')}</p>

        <h4 className="mb-1 text-lg font-bold text-orange-950">🏠 {t('householdTitle')}</h4>
        <p className="mb-3 text-xs text-slate-600">{t('householdNote')}</p>
        <div className="space-y-3">
          {result.household.length > 0 ? (
            result.household.map((s) => <SchemeCard key={s.id} scheme={s} tone="orange" state={data.state} />)
          ) : (
            <p className="p-3 text-sm italic text-slate-500">{t('noHousehold')}</p>
          )}
        </div>
      </div>

      <div className="card">
        {isPersonal ? (
          <>
            <h4 className="mb-4 text-lg font-bold text-indigo-950">👤 {t('personalSchemesTitle')}</h4>
            <div className="space-y-3">
              {personalList.length > 0 ? (
                personalList.map((s) => <SchemeCard key={s.id} scheme={s} tone="blue" state={data.state} />)
              ) : (
                <p className="rounded-xl bg-slate-50 p-4 text-sm italic text-slate-500">{t('noIndividual')}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <h4 className="mb-1 text-lg font-bold text-indigo-950">👤 {t('individualTitle')}</h4>
            <p className="mb-4 text-xs text-slate-500">{t('individualNote')}</p>
            <div role="tablist" className="mb-6 flex flex-wrap gap-2 border-b border-slate-100 pb-4">
              {data.people.map((p, i) => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={i === tab}
                  type="button"
                  onClick={() => setTab(i)}
                  className={`rounded-xl px-4 py-2.5 text-sm font-medium shadow-sm transition ${
                    i === tab ? 'bg-blue-900 text-white shadow-blue-900/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {p.name} <span className="text-xs opacity-80">({p.relation})</span>
                </button>
              ))}
            </div>
            {person && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
                <div className="mb-4 flex flex-col justify-between gap-1 border-b border-blue-100 pb-3 text-sm text-slate-700 md:flex-row">
                  <span>
                    👤 <b>{person.name}</b> ({person.relation})
                  </span>
                  <span>📱 {person.mobile}</span>
                </div>
                <div className="space-y-3">
                  {current.length > 0 ? (
                    current.map((s) => <SchemeCard key={s.id} scheme={s} tone="blue" state={data.state} />)
                  ) : (
                    <p className="rounded-xl bg-white p-4 text-sm italic text-slate-500">{t('noIndividual')}</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
