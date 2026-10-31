import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Award, CheckCheck, ClipboardList, Download, FileText, HandCoins, Play, Send, Trash2 } from 'lucide-react';
import { del, get, openAuthed, patch, post, put } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Callout, Card, DataTable, Field, Input, Modal, PageHeader, PageLoader, Pagination, Select, StatCard, Tabs } from '@/components/ui';
import { bv, compactInr, date, dateTime, inr, num, titleCase } from '@/lib/format';
import { useAction } from '@/lib/hooks';

/* ============ CLOSINGS ============ */
export function Closings() {
  const nav = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['closings', page], queryFn: () => get('/admin/closings', { page }) });
  const { hasRole } = useAuth();
  const { busy, run } = useAction();
  const open = data?.items.find((c: any) => ['PREVIEWED', 'APPROVED'].includes(c.status));
  return (
    <div>
      <PageHeader icon={<ClipboardList className="h-5 w-5" />} title="Closings" subtitle="Pair matching & rank bonuses are calculated here: Run → Preview → Approve (finance) → Post"
        actions={hasRole('ADMIN_SUPER', 'ADMIN_FINANCE', 'ADMIN_OPS') && <Button icon={<Play className="h-4 w-4" />} disabled={!!open} loading={busy === 'run'}
          onClick={() => run('run', () => post('/admin/closings/run', {}), { success: 'Closing calculated — review the preview', invalidate: ['closings'] }).then((c: any) => c && nav(`/admin/closings/${c.id}`))}>Run today’s closing</Button>} />
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        {[['1. Run', 'Calculates pairs, caps, carry and ranks for the period. Nothing is paid.'], ['2. Preview', 'Check totals, payout % of sales and each line.'], ['3. Approve', 'A finance user (not the one who ran it) approves.'], ['4. Post', 'Wallets are credited, carry & caps updated, ranks awarded.']].map(([t, d]) => (
          <div key={t} className="card p-4"><p className="text-sm font-bold text-brand-800">{t}</p><p className="mt-1 text-xs text-slate-500">{d}</p></div>
        ))}
      </div>
      {open && <div className="mb-4"><Callout tone="warn" title={`Closing for ${date(open.periodStart)} is ${open.status.toLowerCase()}`}><button className="link" onClick={() => nav(`/admin/closings/${open.id}`)}>Open it →</button></Callout></div>}
      <Card noPad>
        <DataTable loading={isLoading} rows={data?.items} onRowClick={(r: any) => nav(`/admin/closings/${r.id}`)} columns={[
          { key: 'period', header: 'Period', render: (r: any) => <b>{date(r.periodStart)}</b> },
          { key: 'status', header: 'Status', render: (r: any) => <Badge status={r.status === 'APPROVED' ? 'CONFIRMED' : r.status}>{titleCase(r.status)}</Badge> },
          { key: 'lines', header: 'Lines', align: 'right', render: (r: any) => r._count.lines },
          { key: 'turnover', header: 'Sales', align: 'right', render: (r: any) => inr(r.turnover) },
          { key: 'totalPayout', header: 'Payout', align: 'right', render: (r: any) => <b>{inr(r.totalPayout)}</b> },
          { key: 'ratio', header: 'Payout %', align: 'right', render: (r: any) => (num(r.turnover) ? `${((num(r.totalPayout) / num(r.turnover)) * 100).toFixed(1)}%` : '—') },
          { key: 'runBy', header: 'Run / approved by', render: (r: any) => <span className="text-xs">{r.runByName ?? '—'}<br />{r.approvedByName ?? ''}</span> },
          { key: 'postedAt', header: 'Posted', render: (r: any) => dateTime(r.postedAt) },
        ]} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}

export function ClosingDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['closing', id, type, page], queryFn: () => get(`/admin/closings/${id}`, { type: type || undefined, page }) });
  const { hasRole } = useAuth();
  const { busy, run } = useAction();
  const [line, setLine] = useState<any>(null);
  if (!data) return <PageLoader />;
  const c = data.closing;
  const ratio = num(c.turnover) ? (num(c.totalPayout) / num(c.turnover)) * 100 : 0;
  const fin = hasRole('ADMIN_SUPER', 'ADMIN_FINANCE');
  const act = (k: string, fn: () => Promise<unknown>, msg: string) => run(k, fn, { success: msg, invalidate: ['closing', 'closings', 'admin-dashboard'] });
  return (
    <div>
      <button onClick={() => nav('/admin/closings')} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> All closings</button>
      <PageHeader title={`Closing · ${date(c.periodStart)}`} subtitle={`${dateTime(c.periodStart)} → ${dateTime(c.periodEnd)} · plan settings v${c.settingsVer}`}
        actions={<>
          <Badge status={c.status === 'APPROVED' ? 'CONFIRMED' : c.status} className="text-sm">{titleCase(c.status)}</Badge>
          {c.status !== 'POSTED' && <Button variant="outline" icon={<Trash2 className="h-4 w-4" />} loading={busy === 'd'} onClick={() => confirm('Delete this closing so it can be re-run?') && act('d', () => del(`/admin/closings/${id}`), 'Closing deleted').then(() => nav('/admin/closings'))}>Delete</Button>}
          {c.status === 'PREVIEWED' && fin && <Button icon={<CheckCheck className="h-4 w-4" />} loading={busy === 'a'} onClick={() => act('a', () => post(`/admin/closings/${id}/approve`), 'Closing approved')}>Approve</Button>}
          {c.status === 'APPROVED' && fin && <Button variant="gold" icon={<Send className="h-4 w-4" />} loading={busy === 'p'} onClick={() => act('p', () => post(`/admin/closings/${id}/post`), 'Posted — wallets credited')}>Post & credit wallets</Button>}
        </>} />
      {c.status === 'PREVIEWED' && <div className="mb-4"><Callout tone="info" title="Preview — nothing has been paid yet">Maker-checker: the closing must be approved by a different user than the one who ran it (try the Finance demo login).</Callout></div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total payout" value={inr(c.totalPayout)} tone="green" />
        <StatCard label="Sales in period" value={inr(c.turnover)} tone="gold" />
        <StatCard label="Payout % of sales" value={`${ratio.toFixed(1)}%`} tone={ratio > 50 ? 'red' : 'plum'} />
        <StatCard label="Lines" value={data.byType.reduce((a: number, t: any) => a + t._count, 0)} sub={data.byType.map((t: any) => `${titleCase(t.incomeType)} ${t._count}`).join(' · ')} tone="blue" />
      </div>
      <Tabs value={type} onChange={(v) => { setType(v); setPage(1); }} tabs={[{ value: '', label: 'All lines' }, ...data.byType.map((t: any) => ({ value: t.incomeType, label: `${titleCase(t.incomeType)} · ${compactInr(t._sum.amount)}` }))]} />
      <Card noPad>
        <DataTable rows={data.lines.items} onRowClick={setLine} empty="No income in this period" columns={[
          { key: 'member', header: 'Distributor', render: (r: any) => <div><p className="font-semibold">{r.member.fullName}</p><p className="text-xs text-brand-700">{r.member.distributorCode} · {r.member.packageTier === 'FULL' ? '100 BV' : '40 BV'}</p></div> },
          { key: 'type', header: 'Type', render: (r: any) => <Badge>{titleCase(r.incomeType)}</Badge> },
          { key: 'pairs', header: 'Pairs', align: 'right', render: (r: any) => (r.incomeType === 'PAIR_MATCHING' ? r.pairs : r.detail.rankName) },
          { key: 'flushed', header: 'Flushed', align: 'right', render: (r: any) => r.flushed || '—' },
          { key: 'amount', header: 'Amount', align: 'right', render: (r: any) => <b>{inr(r.amount)}</b> },
        ]} />
        <Pagination page={page} pageSize={data.lines.pageSize} total={data.lines.total} onChange={setPage} />
      </Card>
      <Modal open={!!line} onClose={() => setLine(null)} title="Line calculation" size="lg">
        {line && <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-brand-100">{JSON.stringify(line.detail, null, 2)}</pre>}
      </Modal>
    </div>
  );
}

/* ============ WITHDRAWALS ============ */
export function Withdrawals() {
  const [status, setStatus] = useState('REQUESTED');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['admin-withdrawals', status, page], queryFn: () => get('/admin/withdrawals', { status: status || undefined, page }) });
  const [paid, setPaid] = useState<any>(null);
  const [utr, setUtr] = useState('');
  const { busy, run } = useAction();
  const act = (id: string, action: string, extra: object = {}) => run(id + action, () => post(`/admin/withdrawals/${id}/decision`, { action, ...extra }), { success: `Withdrawal ${action.toLowerCase()}`, invalidate: ['admin-withdrawals', 'admin-dashboard'] });
  const s = (k: string) => data?.summary.find((x: any) => x.status === k);
  return (
    <div>
      <PageHeader icon={<HandCoins className="h-5 w-5" />} title="Withdrawals" subtitle="Approve requests, export the bank file, then mark paid with the UTR"
        actions={<Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => openAuthed('/admin/withdrawals/bank-file', `bank-file-${new Date().toISOString().slice(0, 10)}.csv`)}>Bank file (approved)</Button>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="New requests" value={s('REQUESTED')?._count ?? 0} sub={inr(s('REQUESTED')?._sum.net)} tone="gold" />
        <StatCard label="Approved, to pay" value={s('APPROVED')?._count ?? 0} sub={inr(s('APPROVED')?._sum.net)} tone="blue" />
        <StatCard label="Paid" value={s('PAID')?._count ?? 0} sub={inr(s('PAID')?._sum.net)} />
      </div>
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[{ value: 'REQUESTED', label: 'New' }, { value: 'APPROVED', label: 'Approved' }, { value: 'PAID', label: 'Paid' }, { value: 'REJECTED', label: 'Rejected' }]} />
      <Card noPad>
        <DataTable loading={isLoading} rows={data?.items} empty="Nothing here" columns={[
          { key: 'createdAt', header: 'Requested', render: (r: any) => dateTime(r.createdAt) },
          { key: 'member', header: 'Distributor', render: (r: any) => <div><p className="font-semibold">{r.member.fullName}</p><p className="text-xs text-brand-700">{r.member.distributorCode}</p></div> },
          { key: 'bank', header: 'Bank', render: (r: any) => r.member.bank ? <span className="text-xs">••••{r.member.bank.accountLast4} · {r.member.bank.ifsc}<br />{r.member.bank.verified ? '✓ verified' : '⚠ not verified'}</span> : <span className="text-red-600">No bank</span> },
          { key: 'gross', header: 'Gross', align: 'right', render: (r: any) => inr(r.gross, 2) },
          { key: 'ded', header: 'TDS + admin', align: 'right', render: (r: any) => inr(num(r.tds) + num(r.adminCharge), 2) },
          { key: 'net', header: 'Net', align: 'right', render: (r: any) => <b>{inr(r.net, 2)}</b> },
          { key: 'status', header: 'Status', render: (r: any) => <div><Badge status={r.status} />{r.utr && <p className="mt-1 text-xs text-slate-500">UTR {r.utr}</p>}</div> },
          { key: 'a', header: '', align: 'right', render: (r: any) => <div className="flex justify-end gap-1">
            {r.status === 'REQUESTED' && <Button size="sm" variant="secondary" loading={busy === r.id + 'APPROVE'} onClick={() => act(r.id, 'APPROVE')}>Approve</Button>}
            {r.status === 'APPROVED' && <Button size="sm" variant="secondary" onClick={() => setPaid(r)}>Mark paid</Button>}
            {['REQUESTED', 'APPROVED'].includes(r.status) && <Button size="sm" variant="ghost" loading={busy === r.id + 'REJECT'} onClick={() => confirm('Reject and refund the amount to the wallet?') && act(r.id, 'REJECT')}>Reject</Button>}
          </div> },
        ]} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      <Modal open={!!paid} onClose={() => setPaid(null)} title="Mark as paid" size="sm"
        footer={<Button disabled={!utr} loading={busy === paid?.id + 'PAID'} onClick={() => act(paid.id, 'PAID', { utr }).then(() => { setPaid(null); setUtr(''); })}>Confirm payment</Button>}>
        <p className="mb-3 text-sm">Net {inr(paid?.net, 2)} to {paid?.member.fullName}</p>
        <Field label="Bank UTR / reference number"><Input value={utr} onChange={(e) => setUtr(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}

/* ============ RANKS & REWARDS ============ */
export function RanksAdmin() {
  const [tab, setTab] = useState<'ranks' | 'achievers'>('ranks');
  const { data: ranks } = useQuery({ queryKey: ['admin-ranks'], queryFn: () => get('/admin/ranks') });
  const { data: ach } = useQuery({ queryKey: ['achievers'], queryFn: () => get('/admin/ranks/achievers', { pageSize: 100 }), enabled: tab === 'achievers' });
  const { hasRole } = useAuth();
  const [form, setForm] = useState<any>(null);
  const { busy, run } = useAction();
  return (
    <div>
      <PageHeader icon={<Award className="h-5 w-5" />} title="Ranks & rewards" subtitle="Rank thresholds (BV on each leg), bonuses and travel rewards" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'ranks', label: 'Rank master' }, { value: 'achievers', label: 'Achievers & rewards' }]} />
      {tab === 'ranks' ? (
        <Card noPad>
          <DataTable rows={ranks} columns={[
            { key: 'id', header: '#', render: (r: any) => <b>{r.id}</b> },
            { key: 'name', header: 'Rank', render: (r: any) => <div><b>{r.name}</b> <span className="hi text-xs text-slate-400">{r.nameHi}</span></div> },
            { key: 'thresholdBv', header: 'BV each leg', align: 'right', render: (r: any) => bv(r.thresholdBv) },
            { key: 'bonusAmount', header: 'Rank bonus', align: 'right', render: (r: any) => inr(r.bonusAmount) },
            { key: 'reward', header: 'Reward', render: (r: any) => r.reward ?? '—' },
            { key: 'achievers', header: 'Achievers', align: 'right' },
            { key: 'confirmed', header: 'Values', render: (r: any) => <Badge status={r.confirmed ? 'APPROVED' : 'PENDING'}>{r.confirmed ? 'Confirmed' : 'To confirm'}</Badge> },
            { key: 'a', header: '', render: (r: any) => hasRole('ADMIN_SUPER') && <Button size="sm" variant="ghost" onClick={() => setForm({ ...r, thresholdBv: num(r.thresholdBv), bonusAmount: num(r.bonusAmount) })}>Edit</Button> },
          ]} />
        </Card>
      ) : (
        <Card noPad>
          <DataTable rows={ach?.items} empty="No rank achievers yet" columns={[
            { key: 'member', header: 'Distributor', render: (r: any) => `${r.member.fullName} (${r.member.distributorCode})` },
            { key: 'rank', header: 'Rank', render: (r: any) => <b>{r.rank.name}</b> },
            { key: 'achievedAt', header: 'Achieved', render: (r: any) => date(r.achievedAt) },
            { key: 'reward', header: 'Reward', render: (r: any) => r.rank.reward ?? '—' },
            { key: 'rewardStatus', header: 'Fulfilment', render: (r: any) => hasRole('ADMIN_SUPER', 'ADMIN_OPS') && r.rank.reward
              ? <Select className="w-40 !py-1.5" value={r.rewardStatus} onChange={(e) => run(r.id, () => patch(`/admin/ranks/achievers/${r.id}`, { rewardStatus: e.target.value }), { success: 'Updated', invalidate: ['achievers'] })} options={['PENDING', 'CONFIRMED', 'COMPLETED', 'CASH_OPTION'].map((s) => ({ value: s, label: titleCase(s) }))} />
              : <Badge status={r.rewardStatus} /> },
          ]} />
        </Card>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={`Edit rank ${form?.id}`}
        footer={<Button loading={busy === 'r'} onClick={() => run('r', () => put(`/admin/ranks/${form.id}`, { name: form.name, nameHi: form.nameHi, thresholdBv: num(form.thresholdBv), bonusAmount: num(form.bonusAmount), reward: form.reward || null, confirmed: form.confirmed }), { success: 'Rank saved', invalidate: ['admin-ranks'] }).then((r) => r && setForm(null))}>Save</Button>}>
        {form && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Name (Hindi)"><Input value={form.nameHi ?? ''} onChange={(e) => setForm({ ...form, nameHi: e.target.value })} /></Field>
          <Field label="BV required on each leg"><Input type="number" value={form.thresholdBv} onChange={(e) => setForm({ ...form, thresholdBv: e.target.value })} /></Field>
          <Field label="Rank bonus (₹)"><Input type="number" value={form.bonusAmount} onChange={(e) => setForm({ ...form, bonusAmount: e.target.value })} /></Field>
          <Field label="Reward" className="sm:col-span-2"><Input value={form.reward ?? ''} onChange={(e) => setForm({ ...form, reward: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={form.confirmed} onChange={(e) => setForm({ ...form, confirmed: e.target.checked })} /> Values confirmed by the company</label>
        </div>}
      </Modal>
    </div>
  );
}

/* ============ REPORTS ============ */
const REPORTS = [
  { value: 'sales', label: 'Sales & GST', hint: 'Paid orders with taxable value, GST and BV' },
  { value: 'joinings', label: 'Joinings', hint: 'New registrations with sponsor and side' },
  { value: 'payouts', label: 'Payouts', hint: 'Every posted income line' },
  { value: 'top-earners', label: 'Top earners', hint: 'Highest income in the period' },
  { value: 'tds', label: 'TDS / withdrawals', hint: 'For the quarterly TDS return' },
  { value: 'income-disclosure', label: 'Income disclosure', hint: 'How much active distributors actually earned' },
];
export function Reports() {
  const [type, setType] = useState('sales');
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const { data, isLoading } = useQuery({ queryKey: ['report', type, from, to], queryFn: () => get(`/admin/reports/${type}`, { from, to }) });
  const rows = data?.rows ?? [];
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const fmt = (k: string, v: unknown) => (v === null || v === undefined ? '—' : /amount|total|taxable|gst|income|gross|tds|net|adminCharge/.test(k) && !isNaN(Number(v)) ? inr(v, 2) : String(v));
  return (
    <div>
      <PageHeader icon={<FileText className="h-5 w-5" />} title="Reports" subtitle="Filter, view and download as CSV (opens in Excel)"
        actions={<Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => openAuthed(`/admin/reports/${type}?from=${from}&to=${to}&format=csv`, `${type}-${from}-to-${to}.csv`)}>Download CSV</Button>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {REPORTS.map((r) => (
          <button key={r.value} onClick={() => setType(r.value)} className={`card p-3 text-left transition ${type === r.value ? 'ring-2 ring-brand-500' : 'hover:shadow-md'}`}>
            <p className="text-sm font-bold">{r.label}</p><p className="mt-0.5 text-[11px] text-slate-500">{r.hint}</p>
          </button>
        ))}
      </div>
      <Card className="mb-4"><div className="flex flex-wrap items-end gap-3"><Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field><p className="pb-3 text-sm text-slate-500">{rows.length} rows</p></div></Card>
      <Card noPad>
        <DataTable loading={isLoading} rows={rows.slice(0, 500).map((r: any, i: number) => ({ id: i, ...r }))} columns={cols.map((c) => ({ key: c, header: titleCase(c), align: typeof rows[0][c] === 'number' || /amount|total|income|gross|net|tds|bv|percent|distributors/.test(c) ? 'right' : 'left', render: (r: any) => fmt(c, r[c]) }))} />
      </Card>
    </div>
  );
}


