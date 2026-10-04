'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { STATES } from '@ujjwal/schemes';
import { ApiError } from '../../../lib/api';
import { adminApi, adminDownload } from '../../../lib/admin-api';
import { ErrorNote, PageTitle, useAdmin } from '../../../components/admin/AdminShell';
import { Badge, Btn, Panel, Stat, Table, Td } from '../../../components/admin/bits';

type Tab = 'overview' | 'funnel' | 'schemes' | 'tags' | 'geography';
const TABS: Tab[] = ['overview', 'funnel', 'schemes', 'tags', 'geography'];

// The API groups everything by India (IST) day, so the date pickers must use India dates too.
// Using the browser's UTC date would hide the last few hours of the day.
const IST_MS = 5.5 * 3600 * 1000;
const ymd = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86_400_000));

interface Overview {
  totals: Record<'visitors' | 'stateSelected' | 'formsStarted' | 'formsSubmitted' | 'formsAbandoned' | 'resultsViewed' | 'schemeClicks' | 'registrations' | 'completionRate', number>;
  series: Array<{ day: string; visited: number; formsStarted: number; formsSubmitted: number; registrations: number }>;
}
interface Funnel {
  steps: Array<{ step: string; sessions: number; pctOfPrevious: number; pctOfFirst: number; lostFromPrevious: number }>;
  abandoned: number;
}
interface SchemeRow { id: string; name: string; state: string; level: string; tags: string[]; shown: number; clicked: number; rate: number }
interface Schemes { total: number; items: SchemeRow[]; top: SchemeRow[]; bottom: SchemeRow[]; minShown: number }
interface TagRow { tag: string; kind: string; schemes: number; shown: number; clicked: number; rate: number }
interface GeoRow { state: string; district: string; registrations: number; clicks: number }

const STEP_LABEL: Record<string, string> = {
  visited: 'Visited the site',
  state_selected: 'Chose a state',
  mode_selected: 'Chose personal / family',
  form_started: 'Started the form',
  form_submitted: 'Submitted the form',
  results_viewed: 'Saw scheme results',
  scheme_clicked: 'Clicked an official link',
};

function Bar({ value, max, tone = 'bg-blue-600' }: { value: number; max: number; tone?: string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2.5 w-full rounded-full bg-slate-100">
      <div className={`h-2.5 rounded-full ${tone}`} style={{ width: `${value > 0 ? w : 0}%` }} />
    </div>
  );
}

export default function AnalyticsPage() {
  const admin = useAdmin();
  const [tab, setTab] = useState<Tab>('overview');
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(ymd(new Date()));
  const [state, setState] = useState('');
  const [tag, setTag] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('clicked');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [schemes, setSchemes] = useState<Schemes | null>(null);
  const [tags, setTags] = useState<TagRow[] | null>(null);
  const [geo, setGeo] = useState<GeoRow[] | null>(null);

  const query = useCallback(() => {
    const p = new URLSearchParams({ from, to });
    if (state) p.set('state', state);
    return p;
  }, [from, to, state]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const p = query();
      if (tab === 'overview') setOverview(await adminApi<Overview>(`/admin/analytics/overview?${p}`));
      if (tab === 'funnel') setFunnel(await adminApi<Funnel>(`/admin/analytics/funnel?${p}`));
      if (tab === 'schemes') {
        if (tag) p.set('tag', tag);
        if (q) p.set('q', q);
        p.set('sort', sort);
        setSchemes(await adminApi<Schemes>(`/admin/analytics/schemes?${p}`));
      }
      if (tab === 'tags') setTags((await adminApi<{ items: TagRow[] }>(`/admin/analytics/tags?${p}`)).items);
      if (tab === 'geography') setGeo((await adminApi<{ items: GeoRow[] }>(`/admin/analytics/geography?${p}`)).items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  }, [tab, query, tag, q, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportReport = (format: 'xlsx' | 'csv') => {
    const p = query();
    p.set('report', tab);
    p.set('format', format);
    if (tab === 'schemes') {
      if (tag) p.set('tag', tag);
      if (q) p.set('q', q);
    }
    void adminDownload(`/admin/analytics/export?${p}`, `${tab}.${format}`).catch((e) => setError(e.message));
  };

  const rebuild = async () => {
    try {
      await adminApi('/admin/analytics/rebuild', { body: { days: 30 } });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not rebuild');
    }
  };

  const maxSeries = Math.max(1, ...(overview?.series.map((s) => s.visited) ?? [1]));
  const maxClicks = Math.max(1, ...(tags?.map((t) => t.clicked) ?? [1]));

  return (
    <>
      <PageTitle title="Analytics">
        <Btn onClick={() => exportReport('xlsx')}><Download className="h-4 w-4" /> Excel</Btn>
        <Btn onClick={() => exportReport('csv')}><Download className="h-4 w-4" /> CSV</Btn>
        {admin.role === 'super_admin' && <Btn onClick={() => void rebuild()}><RefreshCw className="h-4 w-4" /> Refresh numbers</Btn>}
      </PageTitle>
      <ErrorNote message={error} />

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="from">From</label>
            <input id="from" type="date" className="field" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="to">To</label>
            <input id="to" type="date" className="field" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="st">State</label>
            <select id="st" className="field" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">All states</option>
              {STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            {[7, 30, 90].map((n) => (
              <Btn key={n} onClick={() => { setFrom(daysAgo(n - 1)); setTo(ymd(new Date())); }}>{n}d</Btn>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Numbers are refreshed every hour. Dates are India dates.</p>
      </Panel>

      <div role="tablist" className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={t === tab} type="button" onClick={() => setTab(t)} className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize ${t === tab ? 'bg-blue-900 text-white' : 'bg-white text-slate-700 shadow-sm hover:bg-slate-100'}`}>
            {t}
          </button>
        ))}
        {loading && <span className="self-center text-xs text-slate-500">Loading...</span>}
      </div>

      {tab === 'overview' && overview && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Visitors" value={overview.totals.visitors} />
            <Stat label="Forms started" value={overview.totals.formsStarted} />
            <Stat label="Forms completed" value={overview.totals.formsSubmitted} note={`${overview.totals.completionRate}% completion`} />
            <Stat label="Forms abandoned" value={overview.totals.formsAbandoned} />
            <Stat label="Saved registrations" value={overview.totals.registrations} />
            <Stat label="Saw results" value={overview.totals.resultsViewed} />
            <Stat label="Clicked official link" value={overview.totals.schemeClicks} />
            <Stat label="Chose a state" value={overview.totals.stateSelected} />
          </div>
          <Panel title="Per day">
            <Table headers={['Day', 'Visitors', 'Forms started', 'Forms completed', 'Registrations', '']} empty={overview.series.length === 0 ? 'No data in this period yet.' : undefined}>
              {overview.series.map((d) => (
                <tr key={d.day}>
                  <Td className="whitespace-nowrap">{d.day}</Td>
                  <Td>{d.visited}</Td>
                  <Td>{d.formsStarted}</Td>
                  <Td>{d.formsSubmitted}</Td>
                  <Td>{d.registrations}</Td>
                  <Td className="w-48"><Bar value={d.visited} max={maxSeries} /></Td>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      )}

      {tab === 'funnel' && funnel && (
        <Panel title="Where do visitors drop off?">
          <div className="space-y-4">
            {funnel.steps.map((s) => (
              <div key={s.step}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold text-slate-800">{STEP_LABEL[s.step] ?? s.step}</span>
                  <span className="text-slate-600">
                    {s.sessions} · {s.pctOfFirst}% of visitors
                    {s.lostFromPrevious > 0 && <span className="ml-2 text-red-600">-{s.lostFromPrevious} from previous step</span>}
                  </span>
                </div>
                <Bar value={s.sessions} max={funnel.steps[0]?.sessions || Math.max(...funnel.steps.map((x) => x.sessions), 1)} />
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-600">Forms abandoned (left without submitting): <b>{funnel.abandoned}</b>. With a state selected, the &quot;visited&quot; step is empty because page views are not tied to a state.</p>
        </Panel>
      )}

      {tab === 'schemes' && schemes && (
        <>
          <Panel>
            <div className="grid gap-3 sm:grid-cols-3">
              <input className="field" placeholder="Search scheme" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search scheme" />
              <input className="field" placeholder="Filter by tag, e.g. #student" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag" />
              <select className="field" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
                <option value="clicked">Most clicks</option>
                <option value="shown">Most shown</option>
                <option value="rate">Highest click rate</option>
                <option value="name">Name</option>
              </select>
            </div>
          </Panel>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Top 10 (most clicked)">
              <Table headers={['Scheme', 'Clicks', 'Shown']} empty={schemes.top.length === 0 ? 'No clicks yet.' : undefined}>
                {schemes.top.map((s) => (
                  <tr key={s.id}><Td>{s.name}</Td><Td>{s.clicked}</Td><Td>{s.shown}</Td></tr>
                ))}
              </Table>
            </Panel>
            <Panel title={`Bottom 10 (lowest click rate, shown at least ${schemes.minShown} times)`}>
              <Table headers={['Scheme', 'Rate', 'Shown']} empty={schemes.bottom.length === 0 ? 'Not enough data yet.' : undefined}>
                {schemes.bottom.map((s) => (
                  <tr key={s.id}><Td>{s.name}</Td><Td>{s.rate}%</Td><Td>{s.shown}</Td></tr>
                ))}
              </Table>
            </Panel>
          </div>
          <Panel title={`All schemes (${schemes.total})`}>
            <Table headers={['Scheme', 'State', 'Tags', 'Shown', 'Clicks', 'Click rate']}>
              {schemes.items.map((s) => (
                <tr key={s.id}>
                  <Td className="max-w-xs">{s.name}<div className="font-mono text-[11px] text-slate-400">{s.id}</div></Td>
                  <Td>{s.state}</Td>
                  <Td className="max-w-[14rem] text-xs text-slate-500">{s.tags.map((t) => `#${t}`).join(' ')}</Td>
                  <Td>{s.shown}</Td>
                  <Td>{s.clicked}</Td>
                  <Td>{s.rate}%</Td>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      )}

      {tab === 'tags' && tags && (
        <Panel title="Performance by tag">
          <Table headers={['Tag', 'Kind', 'Schemes', 'Shown', 'Clicks', 'Click rate', '']} empty={tags.length === 0 ? 'No tags yet. Upload schemes first.' : undefined}>
            {tags.map((t) => (
              <tr key={t.tag}>
                <Td className="font-semibold">#{t.tag}</Td>
                <Td><Badge tone={t.kind === 'admin' ? 'blue' : 'slate'}>{t.kind}</Badge></Td>
                <Td>{t.schemes}</Td>
                <Td>{t.shown}</Td>
                <Td>{t.clicked}</Td>
                <Td>{t.rate}%</Td>
                <Td className="w-40"><Bar value={t.clicked} max={maxClicks} tone="bg-orange-500" /></Td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}

      {tab === 'geography' && geo && (
        <Panel title="Registrations and clicks by district">
          <Table headers={['State', 'District', 'Registrations', 'Scheme clicks']} empty={geo.length === 0 ? 'No registrations in this period.' : undefined}>
            {geo.map((g) => (
              <tr key={`${g.state}-${g.district}`}><Td>{g.state}</Td><Td>{g.district}</Td><Td>{g.registrations}</Td><Td>{g.clicks}</Td></tr>
            ))}
          </Table>
        </Panel>
      )}
    </>
  );
}
