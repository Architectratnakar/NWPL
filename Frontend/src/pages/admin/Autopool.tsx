import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp, CheckCircle2, Clock3, Hourglass, Layers, Network, Search, Settings2, ShoppingBag, UserPlus, Users, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { get, post, put } from '@/api/client';
import { Avatar, Badge, Button, Callout, Card, DataTable, Field, Input, KeyValue, Modal, PageHeader, Pagination, Progress, Select, StatCard, Tabs } from '@/components/ui';
import { compactInr, date, inr } from '@/lib/format';
import { useAction } from '@/lib/hooks';

const n = (v: number) => v.toLocaleString('en-IN');

export const LEVEL_STATE: Record<string, { label: string; cls: string }> = {
  PAID: { label: 'Paid', cls: 'bg-brand-50 text-brand-700 ring-brand-200' },
  READY: { label: 'Pays at next closing', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  WAITING_REPURCHASE: { label: 'Needs repurchase', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  FILLING: { label: 'Filling', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  INACTIVE: { label: 'ID not active', cls: 'bg-red-50 text-red-700 ring-red-200' },
};
export const StateBadge = ({ state }: { state: string }) => (
  <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', LEVEL_STATE[state]?.cls ?? 'bg-slate-100 text-slate-700 ring-slate-200')}>{LEVEL_STATE[state]?.label ?? state}</span>
);

export default function AdminAutopool() {
  const { data: s, isLoading } = useQuery({ queryKey: ['autopool-summary'], queryFn: () => get('/admin/autopool/summary') });
  const [tab, setTab] = useState<'positions' | 'matrix'>('positions');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [matrixAt, setMatrixAt] = useState(1);
  const { busy, run } = useAction();

  const sync = () => run('sync', () => post('/admin/autopool/sync'), { invalidate: ['autopool-summary', 'autopool-entries', 'autopool-matrix'] })
    .then((r) => r && alert(`${r.added} distributor(s) added. The pool now has ${r.total} positions.`));

  return (
    <div>
      <PageHeader icon={<Layers className="h-5 w-5" />} title="Autopool" subtitle="Non-working 4 × 4 matrix · levels 1 to 9 · paid through the normal closing · Super Admin only"
        actions={<>
          <Button variant="outline" icon={<Settings2 className="h-4 w-4" />} onClick={() => setSettingsOpen(true)}>Settings</Button>
          <Button icon={<UserPlus className="h-4 w-4" />} loading={busy === 'sync'} disabled={!s?.pool.activeNotInPool}
            onClick={() => confirm(`Add ${s?.pool.activeNotInPool} active distributor(s) to the pool, oldest activation first?`) && sync()}>
            Add active IDs{s?.pool.activeNotInPool ? ` (${s.pool.activeNotInPool})` : ''}
          </Button>
        </>} />

      {s && !s.enabled && (
        <div className="mb-5">
          <Callout tone="warn" title="Autopool is OFF — no autopool income is calculated or paid">
            Positions are kept, but closings skip the autopool until you switch it on in <b>Settings</b>. Recruitment-linked or non-working income can be treated as a
            money-circulation scheme under the Consumer Protection (Direct Selling) Rules, 2021 — switch it on only after your lawyer approves the plan.
          </Callout>
        </div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pool positions" value={s ? n(s.pool.positions) : '—'} sub={s ? `${s.pool.activeNotInPool} active ID(s) not in the pool yet` : ''} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Paid so far" value={inr(s?.totals.paid)} sub="Posted closings only" icon={<Wallet className="h-5 w-5" />} tone="plum" />
        <StatCard label="Ready for next closing" value={inr(s?.totals.ready)} sub={s?.enabled ? 'Level complete + repurchase done' : 'Will pay once switched on'} icon={<CheckCircle2 className="h-5 w-5" />} tone="blue" />
        <StatCard label="Waiting for repurchase" value={inr(s?.totals.waitingRepurchase)} sub="Level complete, BV condition not met" icon={<ShoppingBag className="h-5 w-5" />} tone="gold" />
      </div>

      <Card noPad className="mb-5" title="Levels" subtitle={s ? `Repurchase rule: ${s.config.conditionMode === 'CUMULATIVE' ? 'each level needs its own repurchase (BV adds up)' : 'total repurchase BV must reach the level figure'} · maximum per position ${compactInr(s.maxPotential)}` : undefined}>
        <DataTable loading={isLoading} rows={s?.levels.map((l: any) => ({ ...l, id: l.level }))} columns={[
          { key: 'level', header: 'Level', render: (l: any) => <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 font-bold text-brand-800">{l.level}</span> },
          { key: 'team', header: 'Team', align: 'right', render: (l: any) => n(l.team) },
          { key: 'income', header: 'Income', align: 'right', render: (l: any) => <b>{inr(l.income)}</b> },
          { key: 'cond', header: 'Repurchase condition', render: (l: any) => <div>{l.conditionBv} BV<p className="text-xs text-slate-500">{s.config.conditionMode === 'CUMULATIVE' ? `${l.requiredBv} BV in total by this level` : 'total repurchase BV'}</p></div> },
          { key: 'completed', header: 'Positions complete', align: 'right', render: (l: any) => n(l.completed) },
          { key: 'paid', header: 'Paid', align: 'right', render: (l: any) => <div>{inr(l.paidAmount)}<p className="text-xs text-slate-400">{l.paidCount} position(s)</p></div> },
          { key: 'ready', header: 'Ready', align: 'right', render: (l: any) => (l.readyCount ? <span className="font-semibold text-sky-700">{l.readyCount} · {compactInr(l.readyAmount)}</span> : '—') },
          { key: 'waiting', header: 'Needs repurchase', align: 'right', render: (l: any) => (l.waitingCount ? <span className="font-semibold text-amber-700">{l.waitingCount} · {compactInr(l.waitingAmount)}</span> : '—') },
        ]} />
      </Card>

      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'positions', label: <><Users className="h-4 w-4" /> Positions</> }, { value: 'matrix', label: <><Network className="h-4 w-4" /> Matrix view</> }]} />
      {tab === 'positions' ? <Positions onOpen={setOpenEntry} /> : <Matrix at={matrixAt} onAt={setMatrixAt} onOpen={setOpenEntry} />}

      <EntryModal id={openEntry} onClose={() => setOpenEntry(null)} onMatrix={(p) => { setOpenEntry(null); setMatrixAt(p); setTab('matrix'); }} />
      {s && <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} summary={s} />}
    </div>
  );
}

function Positions({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [code, setCode] = useState('');
  const { busy, run } = useAction();
  useEffect(() => {
    const t = setTimeout(() => { setSearch(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);
  const params = { q: search || undefined, page, pageSize: 20 };
  const { data, isLoading } = useQuery({ queryKey: ['autopool-entries', params], queryFn: () => get('/admin/autopool/entries', params) });
  const add = () => run('add', () => post('/admin/autopool/entries', { distributorCode: code.trim() }), { success: `${code.toUpperCase()} added to the pool`, invalidate: ['autopool-summary', 'autopool-entries', 'autopool-matrix'] }).then((r) => r && setCode(''));

  return (
    <Card noPad>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-10" placeholder="Search ID, name, mobile or position #" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Input className="w-40 uppercase" placeholder="NW100123" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Distributor ID to add" />
          <Button variant="secondary" loading={busy === 'add'} disabled={code.trim().length < 3} onClick={add} icon={<UserPlus className="h-4 w-4" />}>Add ID</Button>
        </div>
      </div>
      <DataTable loading={isLoading} rows={data?.items} onRowClick={(r: any) => onOpen(r.id)} empty="Nobody is in the pool yet — use “Add active IDs”" columns={[
        { key: 'position', header: 'Position', render: (r: any) => <span className="font-mono font-bold text-brand-800">#{r.position}</span> },
        { key: 'member', header: 'Distributor', render: (r: any) => <div className="flex items-center gap-3"><Avatar name={r.member.name} size={32} /><div><p className="font-semibold text-slate-900">{r.member.name}</p><p className="text-xs text-brand-700">{r.member.code} · {r.member.mobile}</p></div></div> },
        { key: 'status', header: 'ID', render: (r: any) => <Badge status={r.member.status} /> },
        { key: 'bv', header: 'Repurchase BV', align: 'right', render: (r: any) => r.repurchaseBv },
        { key: 'levels', header: 'Levels done / paid', align: 'right', render: (r: any) => `${r.levelsComplete} / ${r.levelsPaid}` },
        { key: 'next', header: 'Next level', render: (r: any) => r.next ? (
          <div className="min-w-[180px]">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="font-semibold">L{r.next.level} · {n(r.next.filled)}/{n(r.next.team)}</span><StateBadge state={r.next.state} /></div>
            <Progress value={(r.next.filled / r.next.team) * 100} tone={r.next.state === 'READY' ? 'green' : r.next.state === 'WAITING_REPURCHASE' ? 'gold' : 'plum'} />
          </div>
        ) : <Badge status="COMPLETED">All levels paid</Badge> },
        { key: 'earned', header: 'Earned', align: 'right', render: (r: any) => <b className="text-brand-700">{inr(r.earned)}</b> },
        { key: 'enteredAt', header: 'Entered', render: (r: any) => <div className="text-xs">{date(r.enteredAt)}<p className="text-slate-400">{r.source === 'ACTIVATION' ? 'on activation' : r.source === 'ADMIN_SYNC' ? 'bulk add' : 'added by admin'}</p></div> },
      ]} />
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </Card>
  );
}

function Matrix({ at, onAt, onOpen }: { at: number; onAt: (p: number) => void; onOpen: (id: string) => void }) {
  const [input, setInput] = useState(String(at));
  useEffect(() => setInput(String(at)), [at]);
  const { data } = useQuery({ queryKey: ['autopool-matrix', at], queryFn: () => get('/admin/autopool/matrix', { position: at }) });
  const Node = ({ x, big }: { x: any; big?: boolean }) => (
    <button disabled={!x.filled} onClick={() => (big ? x.id && onOpen(x.id) : onAt(x.position))} title={x.filled ? `${x.name} (${x.code})` : 'Empty slot'}
      className={clsx('flex min-w-0 flex-col items-center rounded-xl border px-2 py-2 text-center transition',
        x.filled ? 'border-brand-200 bg-white hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-sm' : 'border-dashed border-slate-300 bg-slate-50 text-slate-400',
        big && 'px-5 py-3 ring-4 ring-brand-100')}>
      <span className={clsx('font-mono text-[11px] font-bold', x.filled ? 'text-brand-700' : '')}>#{x.position}</span>
      {x.filled ? <>
        <Avatar name={x.name} size={big ? 40 : 26} className={clsx('my-1', x.status !== 'ACTIVE' && 'from-slate-400 to-slate-500')} />
        <span className={clsx('w-full truncate font-semibold text-slate-800', big ? 'text-sm' : 'text-[11px]')}>{x.name}</span>
        <span className="text-[10px] text-slate-500">{x.code}</span>
      </> : <span className="my-1 text-[11px]">empty</span>}
    </button>
  );
  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Show position"><Input className="w-32" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && Number(input) >= 1 && onAt(Number(input))} /></Field>
        <Button variant="secondary" onClick={() => Number(input) >= 1 && onAt(Number(input))}>Go</Button>
        <Button variant="ghost" icon={<ArrowUp className="h-4 w-4" />} disabled={!data?.parent} onClick={() => data?.parent && onAt(data.parent)}>Up to #{data?.parent ?? '—'}</Button>
        <p className="ml-auto text-xs text-slate-500">Pool size: <b>{data ? n(data.poolSize) : '—'}</b> · click a slot to move down · click the top slot for details</p>
      </div>
      {data && (
        <div className="space-y-5">
          <div className="flex justify-center"><Node x={data.levels[0][0]} big /></div>
          <div className="mx-auto grid max-w-3xl grid-cols-4 gap-3">{data.levels[1].map((x: any) => <Node key={x.position} x={x} />)}</div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((g) => (
              <div key={g} className="grid grid-cols-4 gap-1.5 rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-100">
                {data.levels[2].slice(g * 4, g * 4 + 4).map((x: any) => <Node key={x.position} x={x} />)}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function EntryModal({ id, onClose, onMatrix }: { id: string | null; onClose: () => void; onMatrix: (p: number) => void }) {
  const { data } = useQuery({ queryKey: ['autopool-entry', id], queryFn: () => get(`/admin/autopool/entries/${id}`), enabled: !!id });
  return (
    <Modal open={!!id} onClose={onClose} size="xl" title={data ? `Position #${data.entry.position} · ${data.member.fullName}` : 'Pool position'}
      footer={data && <Button variant="outline" icon={<Network className="h-4 w-4" />} onClick={() => onMatrix(data.entry.position)}>Open in matrix view</Button>}>
      {data && (
        <div className="space-y-5">
          <KeyValue cols={3} items={[
            ['Distributor', `${data.member.distributorCode} · ${data.member.mobile}`], ['ID status', <Badge key="s" status={data.member.status} />], ['Entered pool', date(data.entry.enteredAt)],
            ['Placed under', data.parent ? `#${data.parent.position} ${data.parent.name ?? ''}` : 'Top of the pool'], ['Repurchase BV', `${data.repurchaseBv} BV`], ['Earned', inr(data.earned)],
          ]} />
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Direct slots below</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {data.children.map((c: any) => (
                <div key={c.position} className={clsx('rounded-xl border p-2.5 text-sm', c.filled ? 'border-brand-200 bg-brand-50/40' : 'border-dashed border-slate-300 text-slate-400')}>
                  <span className="font-mono text-xs font-bold">#{c.position}</span> {c.filled ? <><p className="truncate font-semibold text-slate-800">{c.name}</p><p className="text-xs text-slate-500">{c.code}</p></> : <p>empty</p>}
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3">Level</th><th className="py-2 pr-3">Filled</th><th className="py-2 pr-3 text-right">Income</th><th className="py-2 pr-3 text-right">BV needed</th><th className="py-2">Status</th></tr></thead>
              <tbody>
                {data.progress.map((l: any) => (
                  <tr key={l.level} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-bold">L{l.level}</td>
                    <td className="w-[38%] py-2 pr-3"><div className="mb-1 text-xs text-slate-500">{n(l.filled)} / {n(l.team)} <span className="text-slate-400">(#{n(l.range.start)}–#{n(l.range.end)})</span></div><Progress value={(l.filled / l.team) * 100} tone={l.complete ? 'green' : 'plum'} /></td>
                    <td className="py-2 pr-3 text-right font-semibold">{inr(l.income)}</td>
                    <td className={clsx('py-2 pr-3 text-right', l.qualified ? 'text-brand-700' : 'text-amber-700')}>{l.requiredBv}</td>
                    <td className="py-2"><StateBadge state={l.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SettingsModal({ open, onClose, summary }: { open: boolean; onClose: () => void; summary: any }) {
  const [v, setV] = useState<any>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    if (open) setV({ enabled: summary.enabled, conditionMode: summary.config.conditionMode, autoEnterOnActivation: summary.config.autoEnterOnActivation, levels: summary.config.levels.map((l: any) => ({ ...l })), reason: '' });
  }, [open, summary]);
  const setLevel = (i: number, k: 'income' | 'conditionBv', val: string) => setV({ ...v, levels: v.levels.map((l: any, j: number) => (j === i ? { ...l, [k]: Number(val.replace(/[^\d.]/g, '')) || 0 } : l)) });
  const save = () => run('save', () => put('/admin/autopool/settings', v), { success: 'Autopool settings saved as a new plan-settings version', invalidate: ['autopool-summary', 'autopool-entries', 'settings', 'settings-history'] }).then((r) => r && onClose());
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Autopool settings"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy === 'save'} disabled={!v || v.reason.trim().length < 3} onClick={save}>Save new version</Button></>}>
      {v && (
        <div className="space-y-4">
          <label className={clsx('flex items-start gap-3 rounded-xl border p-3', v.enabled ? 'border-brand-300 bg-brand-50' : 'border-slate-200')}>
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-700" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />
            <span><b>Autopool is {v.enabled ? 'ON' : 'OFF'}</b><span className="block text-xs text-slate-500">When ON, every closing pays completed &amp; qualified levels. Legal approval first.</span></span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={v.autoEnterOnActivation} onChange={(e) => setV({ ...v, autoEnterOnActivation: e.target.checked })} />
            Put a distributor in the pool automatically when their joining package is paid
          </label>
          <Field label="Repurchase condition">
            <Select value={v.conditionMode} onChange={(e) => setV({ ...v, conditionMode: e.target.value })} options={[
              { value: 'CUMULATIVE', label: 'Each level needs its own repurchase (level 3 = 20 + 40 + 80 BV)' },
              { value: 'THRESHOLD', label: 'Total repurchase BV must reach the level figure (level 3 = 80 BV)' },
            ]} />
          </Field>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2 text-left">Level</th><th className="px-3 py-2 text-right">Team</th><th className="px-3 py-2 text-left">Income (₹)</th><th className="px-3 py-2 text-left">Repurchase BV</th></tr></thead>
              <tbody>
                {v.levels.map((l: any, i: number) => (
                  <tr key={l.level} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-bold">{l.level}</td>
                    <td className="px-3 py-1.5 text-right text-slate-500">{n(4 ** l.level)}</td>
                    <td className="px-3 py-1.5"><Input className="!py-1.5" inputMode="numeric" value={l.income} onChange={(e) => setLevel(i, 'income', e.target.value)} aria-label={`Level ${l.level} income`} /></td>
                    <td className="px-3 py-1.5"><Input className="!py-1.5" inputMode="numeric" value={l.conditionBv} onChange={(e) => setLevel(i, 'conditionBv', e.target.value)} aria-label={`Level ${l.level} BV`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500"><Clock3 className="mr-1 inline h-3.5 w-3.5" />Changes apply from the next closing. Levels already paid are never paid again. <Hourglass className="ml-2 mr-1 inline h-3.5 w-3.5" />Total per position: <b>{inr(v.levels.reduce((a: number, l: any) => a + l.income, 0))}</b></p>
          <Field label="Reason for the change (kept in the audit log)"><Input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="e.g. Approved by board on 10 Nov" /></Field>
        </div>
      )}
    </Modal>
  );
}
