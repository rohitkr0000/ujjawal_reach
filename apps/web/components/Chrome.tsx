'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Headphones, Layers, PhoneCall } from 'lucide-react';
import { ACTIVE_STATES, HELPLINE, LOCKED_STATES } from '../lib/config';
import { useLang } from '../lib/i18n';
import { getConsent, setConsent, track } from '../lib/tracking';

/** The admin area has its own menu, so the public header, footer and banner are hidden there. */
function useIsAdmin(): boolean {
  return (usePathname() ?? '').startsWith('/admin');
}

export function TopBar() {
  const { t } = useLang();
  if (useIsAdmin()) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-gradient-to-r from-orange-600 via-amber-600 to-blue-900 px-4 py-2 text-center text-xs font-medium text-white shadow-inner sm:text-sm">
      <span className="hidden rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider sm:inline">
        {t('topBarBadge')}
      </span>
      <span>{t('topBarText')}</span>
    </div>
  );
}

export function Header() {
  const { t, lang, setLang } = useLang();
  if (useIsAdmin()) return null;
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:h-20 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-900 to-orange-600 text-white shadow-md">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
              Ujjwal<span className="text-orange-600">Reach</span>
            </span>
            <p className="hidden text-xs font-medium text-slate-500 sm:block">{t('tagline')}</p>
          </div>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-orange-400 hover:text-orange-600"
          >
            {t('language')}
          </button>
          <a
            href={`tel:${HELPLINE}`}
            className="hidden items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-orange-600 md:inline-flex"
          >
            <Headphones className="h-4 w-4" />
            {t('helpline')}: {HELPLINE}
          </a>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const { t } = useLang();
  if (useIsAdmin()) return null;
  return (
    <footer className="border-t border-slate-800 bg-slate-900 py-12 text-slate-400">
      <div className="mx-auto mb-8 grid max-w-7xl grid-cols-1 gap-8 px-4 sm:px-6 md:grid-cols-4 lg:px-8">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-white">
              <Layers className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold text-white">Ujjwal Reach</span>
          </div>
          <p className="text-xs leading-relaxed">{t('footerAbout')}</p>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold text-white">{t('footerStates')}</h4>
          <ul className="space-y-2 text-xs">
            {ACTIVE_STATES.map((st) => (
              <li key={st.name}>{st.name}</li>
            ))}
            {LOCKED_STATES.filter((st) => st.name !== 'Other State').map((st) => (
              <li key={st.name} className="text-slate-600">
                {st.name} ({t('comingSoon')})
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold text-white">{t('footerNav')}</h4>
          <ul className="space-y-2 text-xs">
            <li><Link href="/" className="hover:text-white">{t('selectState')}</Link></li>
            <li><a href={`tel:${HELPLINE}`} className="hover:text-white">{t('helpline')}</a></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold text-white">{t('footerHelpline')}</h4>
          <p className="mb-2 text-xs">{t('footerAssist')}</p>
          <div className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
            <PhoneCall className="h-4 w-4 text-orange-500" />
            <a href={`tel:${HELPLINE}`} className="hover:underline">{HELPLINE}</a>
          </div>
          <p className="text-[11px] text-slate-500">{t('footerHours')}</p>
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-slate-800 px-4 pt-6 text-center text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-8">
        <p>&copy; {new Date().getFullYear()} Ujjwal Reach. {t('footerRights')}</p>
        <div className="flex gap-4">
          <Link href="/privacy" className="hover:text-slate-300">{t('privacy')}</Link>
          <Link href="/terms" className="hover:text-slate-300">{t('terms')}</Link>
        </div>
      </div>
    </footer>
  );
}

const PAGE_VIEW_KEY = 'ur_pv';

/** Asks once for permission to record anonymous usage, then records one page view per session. */
export function ConsentBanner() {
  const { t } = useLang();
  const admin = useIsAdmin();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (admin) return;
    const c = getConsent();
    if (c === null) setShow(true);
    if (c === 'granted') recordPageView();
  }, [admin]);

  if (admin || !show) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white p-4 shadow-2xl">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-xs text-slate-700 sm:text-sm">{t('consentBannerText')}</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
            onClick={() => {
              setConsent('granted');
              setShow(false);
              recordPageView();
            }}
          >
            {t('accept')}
          </button>
          <button
            type="button"
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            onClick={() => {
              setConsent('denied');
              setShow(false);
            }}
          >
            {t('decline')}
          </button>
        </div>
      </div>
    </div>
  );
}

function recordPageView() {
  try {
    if (sessionStorage.getItem(PAGE_VIEW_KEY)) return;
    sessionStorage.setItem(PAGE_VIEW_KEY, '1');
  } catch {
    /* if storage is blocked we may record a few extra page views, which is harmless */
  }
  track('page_view');
}
