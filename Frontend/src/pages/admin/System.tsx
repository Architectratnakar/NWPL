import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileClock, Headphones, Save, Settings2 } from 'lucide-react';
import { get, post } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import TicketThread from '@/components/TicketThread';
import { Badge, Button, Callout, Card, DataTable, Field, Input, Modal, PageHeader, PageLoader, Pagination, Select, Tabs } from '@/components/ui';
import { dateTime, titleCase } from '@/lib/format';
import { useAction } from '@/lib/hooks';

/* ============ PLAN SETTINGS ============ */
const FEATURES: [string, string, boolean][] = [
  ['retailProfitReport', 'Retail profit report', false], ['leadershipBonus', 'Leadership bonus', false], ['levelReward', 'Level reward', false],
  ['royaltyCto', 'Royalty 5% of company turnover', false], ['jeevanSuraksha', 'Jeevan Suraksha (life cover)', false],
  ['autopool', 'Autopool (non-working income)', true], ['directReturnViaCto', '₹7,500 return after 2 directs', true],
];
export function Settings() {
  const { data: cur } = useQuery({ queryKey: ['settings'], queryFn: () => get('/admin/settings/current') });
  const { data: hist } = useQuery({ queryKey: ['settings-history'], queryFn: () => get('/admin/settings/history') });
  const { hasRole } = useAuth();
  const [v, setV] = useState<any>(null);
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const { busy, run } = useAction();
  useEffect(() => { if (cur) setV(structuredClone(cur.values)); }, [cur]);
  if (!v) return <PageLoader />;
  const set = (path: string, val: unknown) => { const n = structuredClone(v); const ks = path.split('.'); let o = n; ks.slice(0, -1).forEach((k) => (o = o[k] ??= {})); o[ks.at(-1)!] = val; setV(n); };
  const numIn = (path: string, label: string, hint?: string) => {
    const val = path.split('.').reduce((o: any, k) => o?.[k], v);
    return <Field label={label} hint={hint}><Input type="number" value={val ?? ''} onChange={(e) => set(path, e.target.value === '' ? null : Number(e.target.value))} disabled={!hasRole('ADMIN_SUPER')} /></Field>;
  };
  return (
    <div>
      <PageHeader icon={<Settings2 className="h-5 w-5" />} title="Plan settings" subtitle={`Every number the commission engine uses. Current version: v${cur.version}. Saving creates a new version — old ones are kept.`}
        actions={hasRole('ADMIN_SUPER') && <Button icon={<Save className="h-4 w-4" />} loading={busy === 's'} onClick={() => confirm('Save as a new version? It applies from the next closing.') && run('s', () => post('/admin/settings', { values: v }), { success: 'New settings version saved', invalidate: ['settings', 'settings-history'] })}>Save new version</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'form', label: 'Settings' }, { value: 'history', label: 'Version history', count: hist?.length }]} />
      {tab === 'form' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Pair matching">
            <div className="grid gap-4 sm:grid-cols-2">
              {numIn('pairRates.FULL_FULL', 'Rate for 100 BV : 100 BV pair (₹)')}{numIn('pairRates.DEFAULT', 'Rate for other pairs (₹)')}
              {numIn('caps.day', 'Cap per day (pairs)')}{numIn('caps.week', 'Cap per week (pairs)')}{numIn('caps.month', 'Cap per month (pairs)')}
              <Field label="Pairs above the cap"><Select value={v.capOverflow} onChange={(e) => set('capOverflow', e.target.value)} options={[{ value: 'FLUSH', label: 'Flush (not paid, removed)' }, { value: 'CARRY', label: 'Carry to next closing' }]} disabled={!hasRole('ADMIN_SUPER')} /></Field>
            </div>
          </Card>
          <Card title="Payouts & deductions">
            <div className="grid gap-4 sm:grid-cols-2">
              {numIn('deductions.tdsPercent', 'TDS %', 'Confirm the rate with your CA')}{numIn('deductions.adminChargePercent', 'Admin charge %')}
              {numIn('withdrawal.minAmount', 'Minimum withdrawal (₹)')}{numIn('payoutAlertPercent', 'Alert when payout > % of sales')}
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!v.withdrawal.enforceDays} onChange={(e) => set('withdrawal.enforceDays', e.target.checked)} /> Allow withdrawals only on: {v.withdrawal.allowedDays.join(', ')}</label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!v.makerChecker} onChange={(e) => set('makerChecker', e.target.checked)} /> Maker-checker: closing approver must differ from the person who ran it</label>
            </div>
          </Card>
          <Card title="Bonuses & compliance">
            <div className="grid gap-4 sm:grid-cols-2">
              {numIn('specialBonus.amount', 'Women / divyang bonus per rank (₹)')}{numIn('specialBonus.fromRankId', 'Bonus applies from rank #')}
              {numIn('coolingOffDays', 'Return / cooling-off period (days)', 'Confirm with your legal advisor')}
            </div>
          </Card>
          <Card title="Optional income modules">
            <Callout tone="warn" title="Legal review first">Recruitment-linked or non-working income (autopool, return after 2 directs) can be treated as a money-circulation scheme under the Direct Selling Rules, 2021. Keep them OFF until a lawyer approves.</Callout>
            <div className="mt-4 space-y-2">
              {FEATURES.map(([k, l, risky]) => (
                <label key={k} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2">{l}{risky && <Badge status="REJECTED">legal risk</Badge>}</span>
                  <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!v.features[k]} onChange={(e) => set(`features.${k}`, e.target.checked)} disabled={!hasRole('ADMIN_SUPER')} />
                </label>
              ))}
              <p className="text-xs text-slate-500">These switches are stored now; the calculation for each module is added once its rules are signed off.</p>
            </div>
          </Card>
        </div>
      ) : (
        <Card noPad>
          <DataTable rows={hist} columns={[
            { key: 'version', header: 'Version', render: (r: any) => <b>v{r.version}</b> },
            { key: 'effectiveFrom', header: 'Effective from', render: (r: any) => dateTime(r.effectiveFrom) },
            { key: 'createdBy', header: 'Created by', render: (r: any) => r.createdBy },
            { key: 'caps', header: 'Caps (d/w/m)', render: (r: any) => `${r.values.caps?.day}/${r.values.caps?.week}/${r.values.caps?.month}` },
            { key: 'rates', header: 'Pair rates', render: (r: any) => `₹${r.values.pairRates?.FULL_FULL} / ₹${r.values.pairRates?.DEFAULT}` },
            { key: 'cur', header: '', render: (r: any) => r.version === cur.version && <Badge status="ACTIVE">In force</Badge> },
          ]} />
        </Card>
      )}
    </div>
  );
}

/* ============ TICKETS ============ */
export function AdminTickets() {
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['admin-tickets', status, page], queryFn: () => get('/admin/tickets', { status: status || undefined, page }) });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <PageHeader icon={<Headphones className="h-5 w-5" />} title="Support tickets" subtitle="Sorted by SLA due time (48 hours)" />
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED', ''].map((s) => ({ value: s, label: s ? titleCase(s) : 'All' }))} />
      <Card noPad>
        <DataTable loading={isLoading} rows={data?.items} onRowClick={(r: any) => setOpen(r.id)} empty="No tickets" columns={[
          { key: 'subject', header: 'Subject', render: (r: any) => <div><p className="font-semibold">{r.subject}</p><p className="max-w-md truncate text-xs text-slate-500">{r.lastMessage?.text}</p></div> },
          { key: 'member', header: 'Distributor', render: (r: any) => `${r.member.fullName} (${r.member.distributorCode})` },
          { key: 'category', header: 'Category', render: (r: any) => <Badge>{r.category}</Badge> },
          { key: 'status', header: 'Status', render: (r: any) => <Badge status={r.status} /> },
          { key: 'sla', header: 'SLA due', render: (r: any) => <span className={r.overdue ? 'font-semibold text-red-600' : ''}>{dateTime(r.slaDueAt)}{r.overdue ? ' · overdue' : ''}</span> },
        ]} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      {open && <TicketThread id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ============ AUDIT LOG ============ */
export function Audit() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['audit', action, page], queryFn: () => get('/admin/audit-logs', { action: action || undefined, page, pageSize: 30 }) });
  const [row, setRow] = useState<any>(null);
  return (
    <div>
      <PageHeader icon={<FileClock className="h-5 w-5" />} title="Audit log" subtitle="Every login, change and money movement — append-only" />
      <Card className="mb-4"><div className="max-w-sm"><Input placeholder="Filter by action e.g. CLOSING, KYC, LOGIN" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} /></div></Card>
      <Card noPad>
        <DataTable loading={isLoading} rows={data?.items} onRowClick={setRow} columns={[
          { key: 'createdAt', header: 'When', render: (r: any) => dateTime(r.createdAt) },
          { key: 'actor', header: 'Who', render: (r: any) => <div><p className="font-semibold">{r.actor}</p><p className="text-xs text-slate-500">{r.actorRole ? titleCase(r.actorRole.replace('ADMIN_', '')) : ''}</p></div> },
          { key: 'action', header: 'Action', render: (r: any) => <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">{r.action}</code> },
          { key: 'entity', header: 'Record', render: (r: any) => <span className="text-xs">{r.entity} · {String(r.entityId).slice(0, 12)}</span> },
          { key: 'ip', header: 'IP', render: (r: any) => r.ip ?? '—' },
        ]} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      <Modal open={!!row} onClose={() => setRow(null)} title={row?.action} size="lg">
        {row && <div className="grid gap-4 md:grid-cols-2">
          {(['before', 'after'] as const).map((k) => <div key={k}><p className="mb-1 text-xs font-bold uppercase text-slate-500">{k}</p><pre className="max-h-80 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-brand-100">{JSON.stringify(row[k], null, 2) ?? '—'}</pre></div>)}
        </div>}
      </Modal>
    </div>
  );
}
