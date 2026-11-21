import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Award, Download, ExternalLink, IndianRupee, Scale, Search, Sparkles, Users, Wallet, X } from 'lucide-react';
import { get, openAuthed } from '@/api/client';
import { Avatar, Badge, Button, Card, DataTable, Field, Input, KeyValue, Modal, PageHeader, Pagination, Select, StatCard, Tabs } from '@/components/ui';
import { bv, date, dateTime, incomeExplain, incomeNote, inr, titleCase } from '@/lib/format';

/** Every income type the backend accepts (Backend/src/modules/admin/income.ts → IncomeType) */
const TYPES = [
  { value: '', label: 'All income types' },
  { value: 'PAIR_MATCHING', label: 'Pair matching' },
  { value: 'RANK_BONUS', label: 'Rank bonus' },
  { value: 'SPECIAL_BONUS', label: 'Special bonus (women / divyang)' },
  { value: 'RETAIL_PROFIT', label: 'Retail profit' },
  { value: 'LEADERSHIP', label: 'Leadership bonus' },
  { value: 'ROYALTY', label: 'Royalty' },
  { value: 'LEVEL_REWARD', label: 'Level reward (LRB)' },
  { value: 'AUTOPOOL', label: 'Autopool' },
  { value: 'ADJUSTMENT', label: 'Admin adjustment' },
];
const typeLabel = (v: string) => TYPES.find((x) => x.value === v)?.label ?? v;

/** yyyy-mm-dd in Indian time */
const ymd = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const PRESETS: { key: string; label: string; range: () => [string, string] }[] = [
  { key: 'all', label: 'All time', range: () => ['', ''] },
  { key: 'today', label: 'Today', range: () => [ymd(new Date()), ymd(new Date())] },
  { key: '7d', label: 'Last 7 days', range: () => [ymd(new Date(Date.now() - 6 * 86_400_000)), ymd(new Date())] },
  { key: 'month', label: 'This month', range: () => { const n = new Date(Date.now() + 330 * 60_000); return [`${n.toISOString().slice(0, 7)}-01`, ymd(new Date())]; } },
  { key: '30d', label: 'Last 30 days', range: () => [ymd(new Date(Date.now() - 29 * 86_400_000)), ymd(new Date())] },
];

interface Row {
  memberId: string; code: string; name: string; mobile: string; tier: string; status: string; rank: string | null;
  totalIncome: number; pairIncome: number; pairs: number; flushed: number; rankBonus: number; specialBonus: number; otherIncome: number;
  lastIncomeAt: string | null; lines: number; walletBalance: number; withdrawn: number;
}

export default function AdminIncome() {
  const [qs, setQs] = useSearchParams();
  const nav = useNavigate();
  // every filter lives in the page address (?q=&type=&from=&to=&sort=&page=), so refresh / a shared link keeps it
  const search = qs.get('q') ?? '';
  const type = qs.get('type') ?? '';
  const from = qs.get('from') ?? '';
  const to = qs.get('to') ?? '';
  const sort = qs.get('sort') ?? 'total';
  const page = Math.max(1, Number(qs.get('page')) || 1);
  const open = qs.get('member');
  const [q, setQ] = useState(search);

  /** change filters; any filter change goes back to page 1 */
  const setFilters = (patch: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(qs);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (!keepPage) next.delete('page');
    if (next.get('sort') === 'total') next.delete('sort');
    setQs(next, { replace: true });
  };
  const setPage = (p: number) => setFilters({ page: p > 1 ? String(p) : null }, true);

  // search as you type (short delay)
  useEffect(() => {
    const t = setTimeout(() => { if (q.trim() !== search) setFilters({ q: q.trim() || null }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => { setQ(search); }, [search]); // back / forward buttons

  const dateError = from && to && to < from ? '"To" must be on or after "From"' : null;
  const params = { q: search || undefined, type: type || undefined, from: from || undefined, to: to || undefined, sort, page, pageSize: 20 };
  const { data, isLoading } = useQuery({ queryKey: ['admin-income', params], queryFn: () => get('/admin/income', params), enabled: !dateError });
  const s = data?.summary;
  const t = (k: string) => s?.byType.find((x: { type: string }) => x.type === k);
  const sumOf = (keys: string[]) => keys.reduce((a, k) => a + (t(k)?.amount ?? 0), 0);
  const OTHER = ['RETAIL_PROFIT', 'LEADERSHIP', 'ROYALTY', 'LEVEL_REWARD', 'AUTOPOOL', 'ADJUSTMENT'];

  const preset = PRESETS.find((p) => { const [f, tt] = p.range(); return f === from && tt === to; })?.key ?? 'custom';
  const applyPreset = (key: string) => {
    const [f, tt] = PRESETS.find((x) => x.key === key)!.range();
    setFilters({ from: f || null, to: tt || null });
  };
  const filtered = !!(search || type || from || to || sort !== 'total');
  const clearAll = () => { setQ(''); setQs(open ? new URLSearchParams({ member: open }) : new URLSearchParams(), { replace: true }); };
  const periodText = from || to ? `${from ? date(from) : 'start'} – ${to ? date(to) : 'today'}` : 'all time';
  const csvUrl = () => {
    // exactly the same filters as the screen
    const u = new URLSearchParams({ format: 'csv', sort });
    if (search) u.set('q', search);
    if (type) u.set('type', type);
    if (from) u.set('from', from);
    if (to) u.set('to', to);
    return `/admin/income?${u.toString()}`;
  };
  const openMember = (id: string | null) => setFilters({ member: id }, true);

  return (
    <div>
      <PageHeader icon={<IndianRupee className="h-5 w-5" />} title="Distributor income" subtitle="Income paid to every distributor from posted closings · Super Admin only"
        actions={<Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => openAuthed(csvUrl(), `distributor-income-${ymd(new Date())}.csv`)}>Download CSV</Button>} />

      {/* Filters */}
      <Card className="mb-5">
        <div className="mb-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => applyPreset(p.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${preset === p.key ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{p.label}</button>
          ))}
          {filtered && <button onClick={clearAll} className="ml-auto inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"><X className="h-3.5 w-3.5" /> Clear filters</button>}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_210px_160px_160px_170px]">
          <Field label="Distributor">
            <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-10" placeholder="ID, name or mobile" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </Field>
          <Field label="Income type"><Select value={type} onChange={(e) => setFilters({ type: e.target.value || null })} options={TYPES} /></Field>
          <Field label="From"><Input type="date" value={from} max={to || undefined} onChange={(e) => setFilters({ from: e.target.value || null })} /></Field>
          <Field label="To" error={dateError}><Input type="date" value={to} min={from || undefined} onChange={(e) => setFilters({ to: e.target.value || null })} /></Field>
          <Field label="Sort by"><Select value={sort} onChange={(e) => setFilters({ sort: e.target.value })} options={[{ value: 'total', label: 'Highest income' }, { value: 'recent', label: 'Most recent income' }, { value: 'name', label: 'Name (A–Z)' }]} /></Field>
        </div>
      </Card>

      {/* Totals — the first three follow every filter (period, type, search); the last one is "now" */}
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Period: {periodText}{type ? ` · ${typeLabel(type)}` : ''}{search ? ` · "${search}"` : ''}
      </p>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Total income${type ? ` · ${typeLabel(type)}` : ''} (period)`} value={inr(s?.totalIncome)}
          sub={`${s?.earners ?? 0} distributor(s) earned in this period`} icon={<IndianRupee className="h-5 w-5" />} />
        <StatCard label="Pair matching (period)" value={inr(t('PAIR_MATCHING')?.amount)} sub={`${t('PAIR_MATCHING')?.pairs ?? 0} ${t('PAIR_MATCHING')?.pairs === 1 ? 'pair' : 'pairs'} paid`} icon={<Scale className="h-5 w-5" />} tone="plum" />
        <StatCard label="Bonuses & other income (period)" value={inr(sumOf(['RANK_BONUS', 'SPECIAL_BONUS', ...OTHER]))}
          sub={`Rank ${inr(t('RANK_BONUS')?.amount)} · Special ${inr(t('SPECIAL_BONUS')?.amount)} · Other ${inr(sumOf(OTHER))}`} icon={<Award className="h-5 w-5" />} tone="gold" />
        <StatCard label="In wallets — now" value={inr(s?.walletBalance)}
          sub={`${s?.activeDistributors ?? 0} active distributor(s) now · ${inr(s?.paidOut)} paid to banks in the period`} icon={<Wallet className="h-5 w-5" />} tone="blue" />
      </div>
      {s && s.byType.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {s.byType.map((x: { type: string; amount: number; lines: number }) => (
            <button key={x.type} onClick={() => setFilters({ type: type === x.type ? null : x.type })}
              className={`rounded-xl border px-3 py-1.5 text-xs transition ${type === x.type ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
              {typeLabel(x.type)}: <b>{inr(x.amount)}</b> <span className="text-slate-400">· {x.lines} line(s)</span>
            </button>
          ))}
        </div>
      )}

      {/* Per distributor */}
      <Card noPad title={<span className="flex items-center gap-2"><Users className="h-4 w-4" /> Income by distributor</span>} subtitle="Click a row to see every income line with its calculation">
        <DataTable<Row & { id: string }>
          loading={isLoading}
          rows={data?.items.map((r: Row) => ({ ...r, id: r.memberId }))}
          onRowClick={(r) => openMember(r.memberId)}
          empty={dateError ?? (filtered ? 'No income in this period for these filters' : 'No income in this period')}
          columns={[
            { key: 'name', header: 'Distributor', render: (r) => <div className="flex items-center gap-3"><Avatar name={r.name} size={32} /><div><p className="font-semibold text-slate-900">{r.name}</p><p className="text-xs text-brand-700">{r.code} · {r.mobile}</p></div></div> },
            { key: 'tier', header: 'Package / rank', render: (r) => <div className="space-y-1"><Badge status={r.tier} />{r.rank && <p className="text-xs text-slate-500">{r.rank}</p>}</div> },
            { key: 'pairIncome', header: 'Pair income', align: 'right', render: (r) => <div>{inr(r.pairIncome)}<p className="text-xs text-slate-400">{r.pairs} {r.pairs === 1 ? 'pair' : 'pairs'}{r.flushed ? ` · ${r.flushed} over cap` : ''}</p></div> },
            { key: 'bonus', header: 'Bonuses', align: 'right', render: (r) => inr(r.rankBonus + r.specialBonus + r.otherIncome) },
            { key: 'totalIncome', header: 'Total income', align: 'right', render: (r) => <b className="text-brand-700">{inr(r.totalIncome)}</b> },
            { key: 'withdrawn', header: 'Withdrawn', align: 'right', render: (r) => inr(r.withdrawn) },
            { key: 'walletBalance', header: 'Wallet', align: 'right', render: (r) => inr(r.walletBalance) },
            { key: 'lastIncomeAt', header: 'Last income', render: (r) => date(r.lastIncomeAt) },
          ]}
        />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      <p className="mt-3 text-xs text-slate-500">Dates are Indian time (IST) and use the closing date; only POSTED closings and approved admin adjustments count. "Withdrawn" and "Wallet" are all-time figures.</p>

      {open && <DistributorIncome memberId={open} range={{ from, to, type }} onClose={() => openMember(null)} onProfile={(id) => nav(`/admin/members/${id}`)} />}
    </div>
  );
}

/* ---------- one distributor ---------- */
function DistributorIncome({ memberId, range, onClose, onProfile }: { memberId: string; range: { from: string; to: string; type: string }; onClose: () => void; onProfile: (id: string) => void }) {
  const [type, setType] = useState(range.type);
  const [page, setPage] = useState(1);
  const [line, setLine] = useState<any>(null);
  const params = { type: type || undefined, from: range.from || undefined, to: range.to || undefined, page, pageSize: 10 };
  const { data } = useQuery({ queryKey: ['admin-income-member', memberId, params], queryFn: () => get(`/admin/income/${memberId}`, params) });
  const m = data?.member;
  const sum = (k: string) => data?.summary.byType.find((x: { type: string }) => x.type === k);

  return (
    <Modal open onClose={onClose} size="xl" title={m ? `${m.name} · ${m.code}` : 'Distributor income'}
      footer={<>{m && <Button variant="outline" icon={<ExternalLink className="h-4 w-4" />} onClick={() => onProfile(m.id)}>Open profile</Button>}<Button onClick={onClose}>Close</Button></>}>
      {!data ? <p className="py-10 text-center text-sm text-slate-500">Loading…</p> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={m.status} /><Badge status={m.tier} />{m.rank && <Badge><Sparkles className="h-3 w-3" />{m.rank}</Badge>}<Badge status={m.kycStatus}>KYC {titleCase(m.kycStatus)}</Badge>
            {m.walletOnHold && <Badge status="BLOCKED">Wallet on hold</Badge>}
            {(range.from || range.to) && <span className="text-xs text-slate-500">Period: {range.from ? date(range.from) : 'start'} – {range.to ? date(range.to) : 'today'}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total income" value={inr(data.summary.totalIncome)} />
            <StatCard label="Pair matching" value={inr(sum('PAIR_MATCHING')?.amount)} sub={`${sum('PAIR_MATCHING')?.pairs ?? 0} pairs · ${sum('PAIR_MATCHING')?.flushed ?? 0} over cap`} tone="plum" />
            <StatCard label="Bonuses & other" value={inr(data.summary.totalIncome - (sum('PAIR_MATCHING')?.amount ?? 0))} sub={data.summary.byType.filter((x: any) => x.type !== 'PAIR_MATCHING').map((x: any) => `${typeLabel(x.type)} ${inr(x.amount)}`).join(' · ') || '—'} tone="gold" />
            <StatCard label="Wallet / withdrawn" value={inr(m.walletBalance)} sub={`${inr(data.summary.withdrawn)} withdrawn (all time)`} tone="blue" />
          </div>
          <KeyValue cols={3} items={[
            ['Mobile', m.mobile], ['Sponsor', m.sponsor ? `${m.sponsor.fullName} (${m.sponsor.distributorCode})` : 'Company'], ['Activated', date(m.activatedAt)],
            ['Left BV / IDs', `${bv(m.volume?.totalLeftBv)} / ${m.volume?.totalLeftCount ?? 0}`], ['Right BV / IDs', `${bv(m.volume?.totalRightBv)} / ${m.volume?.totalRightCount ?? 0}`], ['Joined', date(m.joinedAt)],
          ]} />

          <div>
            <Tabs value={type} onChange={(v) => { setType(v); setPage(1); }} tabs={TYPES.map((x) => ({ value: x.value, label: x.value ? x.label : 'All', count: x.value ? data.summary.byType.find((b: any) => b.type === x.value)?.lines : undefined }))} />
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <DataTable rows={data.lines.items} onRowClick={setLine} empty="No income in this period" columns={[
                { key: 'date', header: 'Closing date', render: (r: any) => date(r.closing.periodStart) },
                { key: 'type', header: 'Type', render: (r: any) => <Badge>{titleCase(r.incomeType)}</Badge> },
                { key: 'pairs', header: 'Pairs / rank', align: 'right', render: (r: any) => (r.incomeType === 'PAIR_MATCHING' ? r.pairs : incomeNote(r)) },
                { key: 'rate', header: 'Calculation', align: 'right', render: (r: any) => r.incomeType !== 'PAIR_MATCHING' ? '—'
                    : r.detail?.fullPairs && r.detail?.basicPairs ? `${r.detail.fullPairs}×₹${r.detail.rates.FULL_FULL} + ${r.detail.basicPairs}×₹${r.detail.rates.DEFAULT}`
                    : `${r.pairs}×${inr(r.rate)}` },
                { key: 'flushed', header: 'Over cap', align: 'right', render: (r: any) => r.flushed || '—' },
                { key: 'amount', header: 'Amount', align: 'right', render: (r: any) => <b className="text-brand-700">{inr(r.amount)}</b> },
              ]} />
              <Pagination page={page} pageSize={data.lines.pageSize} total={data.lines.total} onChange={setPage} />
            </div>
          </div>

          {data.adjustments?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Admin wallet adjustments in this period</p>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <DataTable rows={data.adjustments} columns={[
                  { key: 'at', header: 'Date', render: (r: any) => dateTime(r.at) },
                  { key: 'note', header: 'Details', render: (r: any) => <span className="text-xs">{r.note}</span> },
                  { key: 'amount', header: 'Amount', align: 'right', render: (r: any) => <b className={r.type === 'CREDIT' ? 'text-brand-700' : 'text-red-600'}>{r.type === 'CREDIT' ? '+' : '−'} {inr(r.amount, 2)}</b> },
                ]} />
              </div>
            </div>
          )}

          {data.withdrawals.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Recent withdrawals</p>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <DataTable rows={data.withdrawals} columns={[
                  { key: 'createdAt', header: 'Requested', render: (r: any) => dateTime(r.createdAt) },
                  { key: 'gross', header: 'Amount', align: 'right', render: (r: any) => inr(r.gross, 2) },
                  { key: 'net', header: 'Net', align: 'right', render: (r: any) => inr(r.net, 2) },
                  { key: 'status', header: 'Status', render: (r: any) => <Badge status={r.status} /> },
                  { key: 'utr', header: 'UTR', render: (r: any) => r.utr ?? '—' },
                ]} />
              </div>
            </div>
          )}
        </div>
      )}
      <Modal open={!!line} onClose={() => setLine(null)} title="Calculation details" size="lg">
        {line && (line.incomeType === 'PAIR_MATCHING' ? (
          <div className="space-y-4 text-sm">
            <KeyValue items={[
              ['Package at closing', line.detail.tier === 'FULL' ? '100 BV' : '40 BV'],
              ['Closing date', date(line.closing.periodStart)],
              ['Unmatched before (L / R)', `${line.detail.carryBefore.lf + line.detail.carryBefore.lb} / ${line.detail.carryBefore.rf + line.detail.carryBefore.rb}`],
              ['Pairs allowed by caps', line.detail.capRemaining],
              [`100:100 pairs @ ₹${line.detail.rates.FULL_FULL}`, line.detail.fullPairs],
              [`Other pairs @ ₹${line.detail.rates.DEFAULT}`, line.detail.basicPairs],
              ['Over the cap (not paid)', line.flushed],
              ['Unmatched after (L / R)', `${line.detail.carryAfter.lf + line.detail.carryAfter.lb} / ${line.detail.carryAfter.rf + line.detail.carryAfter.rb}`],
            ]} />
            <div className="rounded-xl bg-brand-50 p-3 font-semibold text-brand-900">{line.detail.fullPairs} × ₹{line.detail.rates.FULL_FULL} + {line.detail.basicPairs} × ₹{line.detail.rates.DEFAULT} = {inr(line.amount)}</div>
          </div>
        ) : (
          <KeyValue items={incomeExplain(line)} />
        ))}
      </Modal>
    </Modal>
  );
}
