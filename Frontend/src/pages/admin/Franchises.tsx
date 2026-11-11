import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowLeft, ArrowUpFromLine, BadgeIndianRupee, Ban, Boxes, CheckCircle2, FileText, KeyRound, Pencil, Plus, Search, Store, UserCheck, XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { get, openAuthed, patch, post } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Avatar, Badge, Button, Callout, Card, DataTable, Field, Input, KeyValue, Modal, PageHeader, PageLoader, Pagination, Select, StatCard, Tabs, Textarea } from '@/components/ui';
import { compactInr, date, dateTime, inr, titleCase } from '@/lib/format';
import { useAction } from '@/lib/hooks';

export const FRANCHISE_TYPES = [
  { value: 'MINI', label: 'Mini franchise' }, { value: 'DISTRICT', label: 'District franchise' },
  { value: 'STATE', label: 'State franchise' }, { value: 'MASTER', label: 'Master franchise' },
];
const typeLabel = (t: string) => FRANCHISE_TYPES.find((x) => x.value === t)?.label ?? t;
const STOCK_TXN: Record<string, string> = { ALLOT: 'Allotted by company', TAKE_BACK: 'Taken back by company', SALE: 'Sold at counter', RETURN: 'Returned by customer', ADJUST: 'Adjustment' };

/* ============================== LIST ============================== */
export function FranchiseList() {
  const { hasRole } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<'franchises' | 'commission'>('franchises');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [create, setCreate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setSearch(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);
  const params = { q: search || undefined, status: status || undefined, page, pageSize: 20 };
  const { data, isLoading } = useQuery({ queryKey: ['franchises', params], queryFn: () => get('/admin/franchises', params) });
  const s = data?.summary;
  const canManage = hasRole('ADMIN_SUPER', 'ADMIN_OPS');

  return (
    <div>
      <PageHeader icon={<Store className="h-5 w-5" />} title="Franchises" subtitle="Outlets run by company partners — stock allotment, counter sales and commission"
        actions={canManage && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreate(true)}>Give a franchise</Button>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active franchises" value={s?.active ?? '—'} sub={s ? `${s.suspended} suspended · ${s.closed} closed` : ''} icon={<Store className="h-5 w-5" />} />
        <StatCard label="Counter sales this month" value={inr(s?.monthSales)} sub={`${s?.monthOrders ?? 0} order(s)`} icon={<BadgeIndianRupee className="h-5 w-5" />} tone="plum" />
        <StatCard label="Commission to pay" value={inr(s?.commissionPending)} sub={`${s?.commissionPendingCount ?? 0} sale(s) pending`} icon={<ArrowUpFromLine className="h-5 w-5" />} tone="gold" onClick={() => setTab('commission')} />
        <StatCard label="How it works" value={<span className="text-base">Allot → Sell → Pay</span>} sub="Company stock moves to the franchise; sales credit BV to the buyer" icon={<Boxes className="h-5 w-5" />} tone="blue" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'franchises', label: 'Franchises' }, { value: 'commission', label: 'Commission payouts', count: s?.commissionPendingCount }]} />
      {tab === 'franchises' ? (
        <Card noPad>
          <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
            <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-10" placeholder="Code, outlet, partner, mobile or territory" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <Select className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: '', label: 'All statuses' }, { value: 'ACTIVE', label: 'Active' }, { value: 'SUSPENDED', label: 'Suspended' }, { value: 'CLOSED', label: 'Closed' }]} />
          </div>
          <DataTable loading={isLoading} rows={data?.items} onRowClick={(r: any) => nav(`/admin/franchises/${r.id}`)} empty="No franchise yet — click “Give a franchise”" columns={[
            { key: 'name', header: 'Franchise', render: (r: any) => <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700"><Store className="h-4 w-4" /></div><div><p className="font-semibold text-slate-900">{r.name}</p><p className="text-xs text-brand-700">{r.code} · {typeLabel(r.type)}</p></div></div> },
            { key: 'owner', header: 'Partner', render: (r: any) => <div><p className="font-medium">{r.ownerName}</p><p className="text-xs text-slate-500">{r.ownerCode ? `Distributor ${r.ownerCode}` : 'Franchise-only login'} · {r.mobile}</p></div> },
            { key: 'territory', header: 'Territory', render: (r: any) => r.territory ?? '—' },
            { key: 'commissionPercent', header: 'Commission', align: 'right', render: (r: any) => `${Number(r.commissionPercent)}%` },
            { key: 'stock', header: 'Stock units', align: 'right', render: (r: any) => r.stats.stockUnits.toLocaleString('en-IN') },
            { key: 'sales', header: 'Sales', align: 'right', render: (r: any) => <div>{compactInr(r.stats.sales)}<p className="text-xs text-slate-400">{r.stats.salesCount} order(s)</p></div> },
            { key: 'comm', header: 'To pay', align: 'right', render: (r: any) => (r.stats.commissionPending ? <b className="text-gold-700">{inr(r.stats.commissionPending)}</b> : '—') },
            { key: 'status', header: 'Status', render: (r: any) => <Badge status={r.status === 'SUSPENDED' ? 'ESCALATED' : r.status}>{titleCase(r.status)}</Badge> },
          ]} />
          {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
        </Card>
      ) : <CommissionPayouts />}
      <CreateFranchise open={create} onClose={() => setCreate(false)} onCreated={(id) => nav(`/admin/franchises/${id}`)} />
    </div>
  );
}

function CommissionPayouts({ franchiseId }: { franchiseId?: string }) {
  const { hasRole } = useAuth();
  const [status, setStatus] = useState<'PENDING' | 'PAID' | 'CANCELLED'>('PENDING');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string[]>([]);
  const [utr, setUtr] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const { busy, run } = useAction();
  const params = { status, franchiseId, page, pageSize: 50 };
  const { data, isLoading } = useQuery({ queryKey: ['franchise-commissions', params], queryFn: () => get('/admin/franchises/commissions', params) });
  useEffect(() => setSel([]), [status, page]);
  const canPay = hasRole('ADMIN_SUPER', 'ADMIN_FINANCE') && status === 'PENDING';
  const selAmount = (data?.items ?? []).filter((c: any) => sel.includes(c.id)).reduce((a: number, c: any) => a + Number(c.amount), 0);
  const pay = () => run('pay', () => post('/admin/franchises/commissions/pay', { ids: sel, utr }), { success: 'Commission marked as paid', invalidate: ['franchise-commissions', 'franchises', 'franchise'] })
    .then((r) => { if (r) { setPayOpen(false); setSel([]); setUtr(''); } });
  return (
    <Card noPad>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[{ value: 'PENDING', label: 'To pay' }, { value: 'PAID', label: 'Paid' }, { value: 'CANCELLED', label: 'Cancelled (returns)' }]} />
        <p className="ml-auto text-sm text-slate-500">Total: <b className="text-slate-900">{inr(data?.amount)}</b></p>
        {canPay && <Button disabled={!sel.length} onClick={() => setPayOpen(true)} icon={<CheckCircle2 className="h-4 w-4" />}>Mark {sel.length || ''} paid{sel.length ? ` · ${inr(selAmount)}` : ''}</Button>}
      </div>
      <DataTable loading={isLoading} rows={data?.items} empty="Nothing here" columns={[
        ...(canPay ? [{ key: 'sel', header: <input type="checkbox" className="h-4 w-4 accent-brand-700" aria-label="Select all" checked={!!data?.items.length && sel.length === data.items.length} onChange={(e) => setSel(e.target.checked ? data.items.map((c: any) => c.id) : [])} />,
          render: (c: any) => <input type="checkbox" className="h-4 w-4 accent-brand-700" aria-label={`Select ${c.order.orderNo}`} checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} /> }] : []),
        ...(franchiseId ? [] : [{ key: 'f', header: 'Franchise', render: (c: any) => <div><p className="font-semibold">{c.franchise.name}</p><p className="text-xs text-brand-700">{c.franchise.code}</p></div> }]),
        { key: 'order', header: 'Sale', render: (c: any) => <div><p className="font-medium">{c.order.orderNo}</p><p className="text-xs text-slate-500">{titleCase(c.order.type)} · {c.order.member?.fullName} ({c.order.member?.distributorCode})</p></div> },
        { key: 'date', header: 'Date', render: (c: any) => date(c.createdAt) },
        { key: 'sale', header: 'Taxable value', align: 'right', render: (c: any) => inr(c.saleAmount, 2) },
        { key: 'pct', header: 'Rate', align: 'right', render: (c: any) => `${Number(c.percent)}%` },
        { key: 'amount', header: 'Commission', align: 'right', render: (c: any) => <b className="text-brand-700">{inr(c.amount, 2)}</b> },
        ...(status === 'PAID' ? [{ key: 'utr', header: 'Paid', render: (c: any) => <div className="text-xs">{c.utr}<p className="text-slate-400">{dateTime(c.paidAt)}</p></div> }] : []),
      ]} />
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} size="sm" title={`Pay ${inr(selAmount, 2)} commission`}
        footer={<Button loading={busy === 'pay'} disabled={utr.trim().length < 4} onClick={pay}>Mark paid</Button>}>
        <Field label="Bank transfer UTR / reference"><Input autoFocus value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="UTR number" /></Field>
      </Modal>
    </Card>
  );
}

/* ============================== CREATE / EDIT ============================== */
const emptyForm = () => ({
  partnerMode: 'EXISTING' as 'EXISTING' | 'NEW', distributorCode: '', pName: '', pMobile: '', pEmail: '', pPassword: '',
  name: '', type: 'MINI', territory: '', gstin: '', line1: '', city: '', state: '', pincode: '', commissionPercent: '5', securityDeposit: '', agreementStart: '', agreementEnd: '',
});
const ymd = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function franchiseBody(f: ReturnType<typeof emptyForm>) {
  return {
    name: f.name.trim(), type: f.type, territory: f.territory.trim() || undefined, gstin: f.gstin.trim(),
    address: { line1: f.line1, city: f.city, state: f.state, pincode: f.pincode },
    commissionPercent: Number(f.commissionPercent) || 0, securityDeposit: f.securityDeposit ? Number(f.securityDeposit) : null,
    agreementStart: f.agreementStart || null, agreementEnd: f.agreementEnd || null,
  };
}

function FranchiseFields({ f, set }: { f: ReturnType<typeof emptyForm>; set: (p: Partial<ReturnType<typeof emptyForm>>) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Outlet / shop name" className="sm:col-span-2"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Navarth Wellness Store – Indore" /></Field>
      <Field label="Franchise type"><Select value={f.type} onChange={(e) => set({ type: e.target.value })} options={FRANCHISE_TYPES} /></Field>
      <Field label="Territory" hint="District / city / pincodes covered"><Input value={f.territory} onChange={(e) => set({ territory: e.target.value })} /></Field>
      <Field label="Address" className="sm:col-span-2"><Input value={f.line1} onChange={(e) => set({ line1: e.target.value })} placeholder="Shop no., street" /></Field>
      <Field label="City"><Input value={f.city} onChange={(e) => set({ city: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="State"><Input value={f.state} onChange={(e) => set({ state: e.target.value })} /></Field><Field label="Pincode"><Input value={f.pincode} maxLength={6} onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, '') })} /></Field></div>
      <Field label="GSTIN (optional)"><Input value={f.gstin} maxLength={15} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} placeholder="23ABCDE1234F1Z5" /></Field>
      <Field label="Commission on sales (%)" hint="On the taxable value of every counter sale"><Input inputMode="decimal" value={f.commissionPercent} onChange={(e) => set({ commissionPercent: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
      <Field label="Security deposit (₹, optional)"><Input inputMode="numeric" value={f.securityDeposit} onChange={(e) => set({ securityDeposit: e.target.value.replace(/\D/g, '') })} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Agreement from"><Input type="date" value={f.agreementStart} onChange={(e) => set({ agreementStart: e.target.value })} /></Field><Field label="Agreement to"><Input type="date" value={f.agreementEnd} onChange={(e) => set({ agreementEnd: e.target.value })} /></Field></div>
    </div>
  );
}

function CreateFranchise({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState(emptyForm());
  const [partner, setPartner] = useState<any>(null);
  const [checkErr, setCheckErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  useEffect(() => { if (open) { setF(emptyForm()); setPartner(null); setCheckErr(null); } }, [open]);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const check = async () => {
    setCheckErr(null); setPartner(null);
    const r = await run('check', () => get(`/admin/franchises/check-partner/${f.distributorCode.trim()}`));
    if (!r) return;
    if (r.alreadyFranchise) setCheckErr(`${r.code} already runs franchise ${r.alreadyFranchise}`);
    else if (r.status === 'BLOCKED' || r.status === 'TERMINATED') setCheckErr(`${r.code} is ${r.status.toLowerCase()}`);
    else { setPartner(r); if (!f.name) set({ name: `Navarth Wellness Store – ${r.name.split(' ')[0]}` }); }
  };
  const ready = f.name.trim().length >= 3 && (f.partnerMode === 'EXISTING' ? !!partner : f.pName.trim().length >= 3 && /^[6-9]\d{9}$/.test(f.pMobile) && f.pPassword.length >= 8);
  const save = () => run('save', () => post('/admin/franchises', {
    ...franchiseBody(f),
    partner: f.partnerMode === 'EXISTING' ? { mode: 'EXISTING', distributorCode: f.distributorCode.trim() } : { mode: 'NEW', name: f.pName.trim(), mobile: f.pMobile, email: f.pEmail.trim(), password: f.pPassword },
  }), { success: 'Franchise created — allot opening stock next', invalidate: ['franchises'] }).then((r) => { if (r) { onClose(); onCreated(r.id); } });

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Give a franchise to a partner"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy === 'save'} disabled={!ready} onClick={save} icon={<Store className="h-4 w-4" />}>Create franchise</Button></>}>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">1 · Partner</p>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {([['EXISTING', 'An existing distributor', 'Uses their distributor login — they also keep their member area'], ['NEW', 'A new partner', 'Creates a separate franchise login (mobile + password)']] as const).map(([v, t, d]) => (
              <button key={v} type="button" onClick={() => set({ partnerMode: v })} className={clsx('rounded-xl border p-3 text-left transition', f.partnerMode === v ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 hover:border-slate-300')}>
                <p className="text-sm font-bold">{t}</p><p className="text-xs text-slate-500">{d}</p>
              </button>
            ))}
          </div>
          {f.partnerMode === 'EXISTING' ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input className="uppercase" placeholder="Distributor ID, e.g. NW100002" value={f.distributorCode} onChange={(e) => { set({ distributorCode: e.target.value }); setPartner(null); }} onKeyDown={(e) => e.key === 'Enter' && check()} />
                <Button variant="secondary" loading={busy === 'check'} disabled={f.distributorCode.trim().length < 3} onClick={check} icon={<UserCheck className="h-4 w-4" />}>Check</Button>
              </div>
              {checkErr && <Callout tone="danger" title={checkErr} />}
              {partner && <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-3"><Avatar name={partner.name} /><div className="text-sm"><p className="font-bold">{partner.name} <span className="font-normal text-brand-700">· {partner.code}</span></p><p className="text-xs text-slate-600">{partner.mobile} · ID {titleCase(partner.status)} · KYC {titleCase(partner.kycStatus)}</p></div></div>}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Partner name"><Input value={f.pName} onChange={(e) => set({ pName: e.target.value })} /></Field>
              <Field label="Mobile (login)"><Input value={f.pMobile} maxLength={10} inputMode="numeric" onChange={(e) => set({ pMobile: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="Email (optional)"><Input type="email" value={f.pEmail} onChange={(e) => set({ pEmail: e.target.value })} /></Field>
              <Field label="Temporary password" hint="8+ characters, a capital letter and a number"><Input value={f.pPassword} onChange={(e) => set({ pPassword: e.target.value })} /></Field>
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">2 · Franchise details</p>
          <FranchiseFields f={f} set={set} />
        </div>
      </div>
    </Modal>
  );
}

/* ============================== DETAIL ============================== */
export function FranchiseDetail() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['franchise', id], queryFn: () => get(`/admin/franchises/${id}`) });
  const [tab, setTab] = useState<'stock' | 'sales' | 'ledger' | 'commission'>('stock');
  const [stockDir, setStockDir] = useState<'ALLOT' | 'TAKE_BACK' | null>(null);
  const [edit, setEdit] = useState(false);
  const [statusTo, setStatusTo] = useState<string | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  if (isLoading || !data) return <PageLoader />;
  const f = data.franchise;
  const st = data.stats;
  const addr = (f.address ?? {}) as Record<string, string>;
  const canManage = hasRole('ADMIN_SUPER', 'ADMIN_OPS');

  return (
    <div>
      <Link to="/admin/franchises" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> All franchises</Link>
      <PageHeader icon={<Store className="h-5 w-5" />} title={<span className="flex flex-wrap items-center gap-2">{f.name} <Badge status={f.status === 'SUSPENDED' ? 'ESCALATED' : f.status}>{titleCase(f.status)}</Badge></span>}
        subtitle={`${f.code} · ${typeLabel(f.type)}${f.territory ? ` · ${f.territory}` : ''}`}
        actions={canManage && <>
          <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit</Button>
          {f.status === 'ACTIVE' && <Button icon={<ArrowDownToLine className="h-4 w-4" />} onClick={() => setStockDir('ALLOT')}>Allot stock</Button>}
          <Button variant="outline" icon={<ArrowUpFromLine className="h-4 w-4" />} onClick={() => setStockDir('TAKE_BACK')}>Take back</Button>
        </>} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stock at franchise" value={`${st.stockUnits.toLocaleString('en-IN')} units`} sub={`Worth ${inr(data.stock.reduce((a: number, s: any) => a + s.qty * s.dp, 0))} at DP`} icon={<Boxes className="h-5 w-5" />} />
        <StatCard label="Counter sales" value={inr(st.sales)} sub={`${st.salesCount} order(s)`} icon={<BadgeIndianRupee className="h-5 w-5" />} tone="plum" />
        <StatCard label="Commission to pay" value={inr(st.commissionPending)} sub={`${Number(f.commissionPercent)}% of taxable value`} icon={<ArrowUpFromLine className="h-5 w-5" />} tone="gold" onClick={() => setTab('commission')} />
        <StatCard label="Commission paid" value={inr(st.commissionPaid)} icon={<CheckCircle2 className="h-5 w-5" />} tone="blue" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'stock', label: 'Stock' }, { value: 'sales', label: 'Recent sales' }, { value: 'ledger', label: 'Stock movements' }, { value: 'commission', label: 'Commission' }]} />
          {tab === 'stock' && (
            <Card noPad>
              <DataTable rows={data.stock.map((s: any) => ({ ...s, id: s.productId }))} columns={[
                { key: 'name', header: 'Product', render: (s: any) => <div><p className="font-semibold">{s.name}</p><p className="text-xs text-slate-500">{s.sku}</p></div> },
                { key: 'qty', header: 'At franchise', align: 'right', render: (s: any) => <b className={s.qty === 0 ? 'text-slate-400' : s.qty <= 5 ? 'text-amber-700' : 'text-slate-900'}>{s.qty}</b> },
                { key: 'companyStock', header: 'Company stock', align: 'right', render: (s: any) => s.companyStock },
                { key: 'dp', header: 'DP', align: 'right', render: (s: any) => inr(s.dp) },
                { key: 'bv', header: 'BV', align: 'right', render: (s: any) => s.bv },
                { key: 'value', header: 'Value at DP', align: 'right', render: (s: any) => inr(s.qty * s.dp) },
              ]} />
            </Card>
          )}
          {tab === 'sales' && (
            <Card noPad>
              <DataTable rows={data.sales} empty="No counter sales yet" columns={[
                { key: 'orderNo', header: 'Order', render: (o: any) => <div><p className="font-medium">{o.orderNo}</p><p className="text-xs text-slate-500">{dateTime(o.createdAt)}</p></div> },
                { key: 'member', header: 'Distributor', render: (o: any) => <div><p>{o.member?.fullName}</p><p className="text-xs text-brand-700">{o.member?.distributorCode}</p></div> },
                { key: 'type', header: 'Type', render: (o: any) => <Badge>{titleCase(o.type)}</Badge> },
                { key: 'total', header: 'Amount', align: 'right', render: (o: any) => <div>{inr(o.grandTotal)}<p className="text-xs text-slate-400">{Number(o.bvTotal)} BV</p></div> },
                { key: 'comm', header: 'Commission', align: 'right', render: (o: any) => o.franchiseCommission ? <div>{inr(o.franchiseCommission.amount, 2)}<p><Badge status={o.franchiseCommission.status} /></p></div> : '—' },
                { key: 'status', header: 'Status', render: (o: any) => <Badge status={o.status} /> },
                { key: 'inv', header: '', align: 'right', render: (o: any) => o.invoiceNo && <Button size="sm" variant="ghost" icon={<FileText className="h-4 w-4" />} onClick={() => openAuthed(`/orders/${o.id}/invoice`)}>Invoice</Button> },
              ]} />
            </Card>
          )}
          {tab === 'ledger' && <StockLedger url={`/admin/franchises/${f.id}/stock-ledger`} />}
          {tab === 'commission' && <CommissionPayouts franchiseId={f.id} />}
        </div>
        <div className="space-y-5">
          <Card title="Partner">
            <div className="mb-4 flex items-center gap-3"><Avatar name={f.ownerName} size={42} /><div><p className="font-bold">{f.ownerName}</p><p className="text-xs text-slate-500">{f.ownerMember ? <Link className="link" to={`/admin/members/${f.ownerMember.id}`}>Distributor {f.ownerMember.distributorCode}</Link> : 'Franchise-only login'}</p></div></div>
            <KeyValue cols={1} items={[
              ['Login', `${f.mobile}${f.email ? ` · ${f.email}` : ''}`],
              ['Last login', dateTime(f.user.lastLoginAt)],
              ['Address', [addr.line1, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ') || '—'],
              ['GSTIN', f.gstin ?? '—'],
              ['Commission', `${Number(f.commissionPercent)}% of taxable value`],
              ['Security deposit', f.securityDeposit ? inr(f.securityDeposit) : '—'],
              ['Agreement', f.agreementStart ? `${date(f.agreementStart)} → ${date(f.agreementEnd)}` : '—'],
              ['Created', date(f.createdAt)],
            ]} />
            {hasRole('ADMIN_SUPER') && <Button className="mt-4 w-full" variant="outline" size="sm" icon={<KeyRound className="h-4 w-4" />} onClick={() => setPwOpen(true)}>Reset partner password</Button>}
          </Card>
          {canManage && (
            <Card title="Status">
              <div className="grid gap-2">
                {f.status !== 'ACTIVE' && <Button variant="secondary" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setStatusTo('ACTIVE')}>Re-activate</Button>}
                {f.status === 'ACTIVE' && <Button variant="outline" icon={<Ban className="h-4 w-4" />} onClick={() => setStatusTo('SUSPENDED')}>Suspend (no new sales)</Button>}
                {f.status !== 'CLOSED' && <Button variant="ghost" className="!text-red-600" icon={<XCircle className="h-4 w-4" />} onClick={() => setStatusTo('CLOSED')}>Close franchise</Button>}
              </div>
              {f.status === 'CLOSED' && <p className="mt-3 text-xs text-slate-500">Take back the remaining stock before closing for good.</p>}
            </Card>
          )}
        </div>
      </div>

      <StockModal franchise={f} stock={data.stock} dir={stockDir} onClose={() => setStockDir(null)} />
      <EditFranchise franchise={f} open={edit} onClose={() => setEdit(false)} />
      <StatusModal franchise={f} to={statusTo} onClose={() => setStatusTo(null)} />
      <ResetPw userId={f.user.id} open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

export function StockLedger({ url }: { url: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['franchise-ledger', url, page], queryFn: () => get(url, { page, pageSize: 25 }) });
  return (
    <Card noPad>
      <DataTable loading={isLoading} rows={data?.items} empty="No stock movement yet" columns={[
        { key: 'createdAt', header: 'When', render: (t: any) => dateTime(t.createdAt) },
        { key: 'product', header: 'Product', render: (t: any) => t.product.name },
        { key: 'type', header: 'Movement', render: (t: any) => <div>{STOCK_TXN[t.type] ?? t.type}{t.note && <p className="text-xs text-slate-400">{t.note}</p>}</div> },
        { key: 'qty', header: 'Qty', align: 'right', render: (t: any) => <b className={t.qty > 0 ? 'text-brand-700' : 'text-red-600'}>{t.qty > 0 ? `+${t.qty}` : t.qty}</b> },
        { key: 'balanceAfter', header: 'Balance', align: 'right', render: (t: any) => t.balanceAfter },
      ]} />
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </Card>
  );
}

function StockModal({ franchise, stock, dir, onClose }: { franchise: any; stock: any[]; dir: 'ALLOT' | 'TAKE_BACK' | null; onClose: () => void }) {
  const [qty, setQty] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const { busy, run } = useAction();
  useEffect(() => { if (dir) { setQty({}); setNote(''); } }, [dir]);
  const items = Object.entries(qty).map(([p, q]) => ({ productId: Number(p), qty: Number(q) })).filter((i) => i.qty > 0);
  const save = () => run('stock', () => post(`/admin/franchises/${franchise.id}/stock`, { direction: dir, items, note: note.trim() || undefined }),
    { success: dir === 'ALLOT' ? 'Stock allotted' : 'Stock taken back', invalidate: ['franchise', 'franchises', 'franchise-ledger'] }).then((r) => r && onClose());
  const max = (s: any) => (dir === 'ALLOT' ? s.companyStock : s.qty);
  return (
    <Modal open={!!dir} onClose={onClose} size="lg" title={dir === 'ALLOT' ? `Allot company stock to ${franchise.code}` : `Take stock back from ${franchise.code}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy === 'stock'} disabled={!items.length} onClick={save}>{dir === 'ALLOT' ? 'Allot' : 'Take back'} {items.reduce((a, i) => a + i.qty, 0) || ''} unit(s)</Button></>}>
      <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-right">{dir === 'ALLOT' ? 'Company has' : 'Franchise has'}</th><th className="px-3 py-2 text-right">At franchise</th><th className="w-32 px-3 py-2">Qty</th></tr></thead>
          <tbody>
            {stock.map((s) => (
              <tr key={s.productId} className="border-t border-slate-100">
                <td className="px-3 py-1.5"><p className="font-medium">{s.name}</p><p className="text-xs text-slate-400">{s.sku} · DP {inr(s.dp)}</p></td>
                <td className="px-3 py-1.5 text-right">{max(s)}</td>
                <td className="px-3 py-1.5 text-right text-slate-500">{s.qty}</td>
                <td className="px-3 py-1.5"><Input className={clsx('!py-1.5 text-right', Number(qty[s.productId]) > max(s) && '!border-red-400')} inputMode="numeric" placeholder="0" value={qty[s.productId] ?? ''} disabled={max(s) === 0}
                  onChange={(e) => setQty({ ...qty, [s.productId]: e.target.value.replace(/\D/g, '') })} aria-label={`Quantity of ${s.name}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Field label="Note (optional)" className="mt-4"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={dir === 'ALLOT' ? 'e.g. Opening stock / Challan no.' : 'e.g. Expiring batch'} /></Field>
    </Modal>
  );
}

function EditFranchise({ franchise, open, onClose }: { franchise: any; open: boolean; onClose: () => void }) {
  const [f, setF] = useState(emptyForm());
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  useEffect(() => {
    if (!open) return;
    const a = (franchise.address ?? {}) as Record<string, string>;
    setF({ ...emptyForm(), name: franchise.name, type: franchise.type, territory: franchise.territory ?? '', gstin: franchise.gstin ?? '', line1: a.line1 ?? '', city: a.city ?? '', state: a.state ?? '', pincode: a.pincode ?? '',
      commissionPercent: String(Number(franchise.commissionPercent)), securityDeposit: franchise.securityDeposit ? String(Number(franchise.securityDeposit)) : '', agreementStart: ymd(franchise.agreementStart), agreementEnd: ymd(franchise.agreementEnd) });
    setReason('');
  }, [open, franchise]);
  const save = () => run('edit', () => patch(`/admin/franchises/${franchise.id}`, { ...franchiseBody(f), reason }), { success: 'Franchise updated', invalidate: ['franchise', 'franchises'] }).then((r) => r && onClose());
  return (
    <Modal open={open} onClose={onClose} size="xl" title={`Edit ${franchise.code}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy === 'edit'} disabled={reason.trim().length < 3} onClick={save}>Save</Button></>}>
      <FranchiseFields f={f} set={(p) => setF({ ...f, ...p })} />
      <Field label="Reason for the change (kept in the audit log)" className="mt-4"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <p className="mt-2 text-xs text-slate-500">A new commission % applies to sales made after saving; existing commission lines keep their rate.</p>
    </Modal>
  );
}

function StatusModal({ franchise, to, onClose }: { franchise: any; to: string | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  useEffect(() => setReason(''), [to]);
  const save = () => run('st', () => patch(`/admin/franchises/${franchise.id}`, { status: to, reason }), { success: 'Status changed', invalidate: ['franchise', 'franchises'] }).then((r) => r && onClose());
  const text: Record<string, string> = {
    ACTIVE: 'The franchise can bill sales again.',
    SUSPENDED: 'The partner can still log in and see their data, but cannot bill new sales.',
    CLOSED: franchise.ownerMemberId ? 'The partner goes back to a normal distributor login. Stock and history are kept.' : 'The franchise login is disabled. Stock and history are kept.',
  };
  return (
    <Modal open={!!to} onClose={onClose} size="sm" title={`${to === 'ACTIVE' ? 'Re-activate' : to === 'SUSPENDED' ? 'Suspend' : 'Close'} ${franchise.code}?`}
      footer={<Button variant={to === 'CLOSED' ? 'danger' : 'primary'} loading={busy === 'st'} disabled={reason.trim().length < 3} onClick={save}>Confirm</Button>}>
      <p className="mb-4 text-sm text-slate-600">{to && text[to]}</p>
      <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}

function ResetPw({ userId, open, onClose }: { userId: string; open: boolean; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const { busy, run } = useAction();
  return (
    <Modal open={open} onClose={onClose} size="sm" title="New password for the partner"
      footer={<Button loading={busy === 'pw'} disabled={pw.length < 8} onClick={() => run('pw', () => post(`/admin/users/${userId}/reset-password`, { password: pw }), { success: 'Password reset' }).then((r) => { if (r) { setPw(''); onClose(); } })}>Reset</Button>}>
      <Field label="New password" hint="Share it with the partner securely"><Input value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
    </Modal>
  );
}

