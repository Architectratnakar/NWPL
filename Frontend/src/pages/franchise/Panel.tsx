import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Banknote, Boxes, CheckCircle2, CreditCard, FileText, IndianRupee, Minus, PackagePlus, Plus, Receipt, Search, ShoppingCart, Smartphone, Store, UserCheck, Wallet,
} from 'lucide-react';
import clsx from 'clsx';
import { get, openAuthed, post } from '@/api/client';
import { Avatar, Badge, Button, Callout, Card, DataTable, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Pagination, StatCard, Tabs } from '@/components/ui';
import { dateTime, inr, tierLabel, titleCase } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { StockLedger } from '@/pages/admin/Franchises';

const invoice = (id: string) => openAuthed(`/franchise/sales/${id}/invoice`);

/* ============================== DASHBOARD ============================== */
export function FranchiseDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['fr-me'], queryFn: () => get('/franchise/me') });
  if (isLoading || !data) return <PageLoader />;
  const f = data.franchise;
  return (
    <div>
      <PageHeader icon={<Store className="h-5 w-5" />} title={f.name} subtitle={`${f.code} · ${titleCase(f.type)} franchise${f.territory ? ` · ${f.territory}` : ''} · commission ${Number(f.commissionPercent)}% of taxable value`}
        actions={f.status === 'ACTIVE' && <Link to="/franchise/sale"><Button icon={<ShoppingCart className="h-4 w-4" />}>New sale</Button></Link>} />
      {f.status === 'SUSPENDED' && <div className="mb-5"><Callout tone="warn" title="Your franchise is suspended">You can see your records, but billing is paused. Please contact the company.</Callout></div>}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's sales" value={inr(data.today.sales)} sub={`${data.today.orders} bill(s) · ${data.today.bv} BV`} icon={<IndianRupee className="h-5 w-5" />} />
        <StatCard label="This month" value={inr(data.month.sales)} sub={`${data.month.orders} bill(s) · ${data.month.bv} BV`} icon={<Receipt className="h-5 w-5" />} tone="plum" />
        <StatCard label="Stock in hand" value={`${data.stats.stockUnits} units`} sub={`Worth ${inr(data.stockValueDp)} at DP`} icon={<Boxes className="h-5 w-5" />} tone="blue" />
        <StatCard label="Commission due" value={inr(data.stats.commissionPending, 2)} sub={`${inr(data.stats.commissionPaid, 2)} already paid`} icon={<Wallet className="h-5 w-5" />} tone="gold" />
      </div>
      {data.lowStock > 0 && <div className="mb-5"><Callout tone="warn" title={`${data.lowStock} product(s) running low (5 or fewer left)`}>Ask the company to allot more stock. <Link to="/franchise/stock" className="font-semibold underline">See stock →</Link></Callout></div>}
      <Card noPad title="Latest bills" actions={<Link to="/franchise/sales" className="link text-sm">All sales →</Link>}>
        <SalesTable rows={data.recent} />
      </Card>
    </div>
  );
}

function SalesTable({ rows, loading }: { rows?: any[]; loading?: boolean }) {
  return (
    <DataTable loading={loading} rows={rows} empty="No bills yet — start with “New sale”" columns={[
      { key: 'orderNo', header: 'Bill', render: (o: any) => <div><p className="font-medium">{o.orderNo}</p><p className="text-xs text-slate-500">{dateTime(o.createdAt)}</p></div> },
      { key: 'member', header: 'Distributor', render: (o: any) => <div><p>{o.member?.fullName}</p><p className="text-xs text-brand-700">{o.member?.distributorCode}</p></div> },
      { key: 'type', header: 'Type', render: (o: any) => <Badge>{titleCase(o.type)}</Badge> },
      { key: 'grandTotal', header: 'Amount', align: 'right', render: (o: any) => <div><b>{inr(o.grandTotal)}</b><p className="text-xs text-slate-400">{Number(o.bvTotal)} BV</p></div> },
      { key: 'comm', header: 'My commission', align: 'right', render: (o: any) => (o.franchiseCommission ? <div>{inr(o.franchiseCommission.amount, 2)}<p><Badge status={o.franchiseCommission.status} /></p></div> : '—') },
      { key: 'status', header: 'Status', render: (o: any) => <Badge status={o.status} /> },
      { key: 'inv', header: '', align: 'right', render: (o: any) => o.invoiceNo && <Button size="sm" variant="ghost" icon={<FileText className="h-4 w-4" />} onClick={() => invoice(o.id)}>Invoice</Button> },
    ]} />
  );
}

/* ============================== NEW SALE ============================== */
type SaleType = 'REPURCHASE' | 'JOINING' | 'UPGRADE';
const PAY = [
  { value: 'CASH', label: 'Cash', icon: <Banknote className="h-4 w-4" /> },
  { value: 'UPI', label: 'UPI', icon: <Smartphone className="h-4 w-4" /> },
  { value: 'CARD', label: 'Card', icon: <CreditCard className="h-4 w-4" /> },
] as const;

export function NewSale() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [member, setMember] = useState<any>(null);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [type, setType] = useState<SaleType>('REPURCHASE');
  const [cart, setCart] = useState<Record<number, number>>({});
  const [pkg, setPkg] = useState<string>('');
  const [pay, setPay] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [ref, setRef] = useState('');
  const [filter, setFilter] = useState('');
  const [done, setDone] = useState<any>(null);
  const { busy, run } = useAction();
  const { data: stock } = useQuery({ queryKey: ['fr-stock'], queryFn: () => get('/franchise/stock') });
  const { data: packages } = useQuery({ queryKey: ['fr-packages'], queryFn: () => get('/franchise/packages') });
  const { data: me } = useQuery({ queryKey: ['fr-me'], queryFn: () => get('/franchise/me') });

  const lookup = async () => {
    setLookupErr(null); setMember(null); setCart({}); setPkg('');
    const m = await run('lookup', () => get(`/franchise/member/${code.trim()}`));
    if (!m) return;
    if (!m.canRepurchase && !m.canJoin && !m.canUpgrade) { setLookupErr(`${m.distributorCode} is ${titleCase(m.status)} and cannot be billed`); return; }
    setMember(m);
    setType(m.canRepurchase ? 'REPURCHASE' : 'JOINING');
  };

  const stockOf = (pid: number) => stock?.find((s: any) => s.productId === pid)?.qty ?? 0;
  const lines = useMemo(() => Object.entries(cart).filter(([, q]) => q > 0).map(([p, q]) => ({ ...stock?.find((s: any) => s.productId === Number(p)), qty: q })), [cart, stock]);
  const total = lines.reduce((a, l) => a + l.dp * l.qty, 0);
  const totalBv = lines.reduce((a, l) => a + l.bv * l.qty, 0);
  const chosenPkg = packages?.find((p: any) => p.code === pkg);
  const pkgShort = chosenPkg?.items.filter((i: any) => stockOf(i.productId) < i.qty) ?? [];
  const add = (pid: number, d: number) => setCart((c) => ({ ...c, [pid]: Math.max(0, Math.min(stockOf(pid), (c[pid] ?? 0) + d)) }));
  const ready = !!member && (type === 'REPURCHASE' ? lines.length > 0 : !!chosenPkg && pkgShort.length === 0) && me?.franchise.status === 'ACTIVE';

  const bill = () => run('bill', () => post('/franchise/sales', {
    distributorCode: member.distributorCode, type, paymentMode: pay, paymentRef: ref.trim() || undefined,
    ...(type === 'REPURCHASE' ? { items: lines.map((l) => ({ productId: l.productId, qty: l.qty })) } : { packageCode: pkg }),
  }), { invalidate: ['fr-stock', 'fr-me', 'fr-sales', 'fr-commissions'] }).then((r) => r && setDone(r));
  const reset = () => { setDone(null); setMember(null); setCode(''); setCart({}); setPkg(''); setRef(''); };

  const pkgOptions = (packages ?? []).filter((p: any) => (type === 'UPGRADE' ? p.isUpgrade : !p.isUpgrade));

  return (
    <div>
      <PageHeader icon={<ShoppingCart className="h-5 w-5" />} title="New sale" subtitle="Bill a distributor at your counter. Goods come out of your stock and the BV is credited to the distributor's ID." />
      {me?.franchise.status === 'SUSPENDED' && <div className="mb-5"><Callout tone="warn" title="Billing is paused while your franchise is suspended" /></div>}
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card title="1 · Distributor">
            <div className="flex gap-2">
              <div className="relative flex-1"><UserCheck className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-10 uppercase" autoFocus placeholder="Distributor ID, e.g. NW100001" value={code} onChange={(e) => { setCode(e.target.value); setMember(null); }} onKeyDown={(e) => e.key === 'Enter' && code.trim().length >= 3 && lookup()} /></div>
              <Button variant="secondary" loading={busy === 'lookup'} disabled={code.trim().length < 3} onClick={lookup}>Find</Button>
            </div>
            {lookupErr && <div className="mt-3"><Callout tone="danger" title={lookupErr} /></div>}
            {member && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-brand-50 p-3">
                <Avatar name={member.fullName} />
                <div className="mr-auto"><p className="font-bold">{member.fullName}</p><p className="text-xs text-brand-700">{member.distributorCode} · {tierLabel(member.packageTier)}</p></div>
                <Tabs value={type} onChange={(v) => { setType(v); setPkg(''); }} tabs={[
                  ...(member.canRepurchase ? [{ value: 'REPURCHASE' as const, label: 'Repurchase' }] : []),
                  ...(member.canJoin ? [{ value: 'JOINING' as const, label: 'Joining package' }] : []),
                  ...(member.canUpgrade ? [{ value: 'UPGRADE' as const, label: 'Upgrade' }] : []),
                ]} />
              </div>
            )}
          </Card>

          {member && type === 'REPURCHASE' && (
            <Card noPad title="2 · Products" actions={<div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="w-56 !py-1.5 pl-9" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>}>
              <div className="divide-y divide-slate-100">
                {stock?.filter((s: any) => !filter || s.name.toLowerCase().includes(filter.toLowerCase())).map((s: any) => (
                  <div key={s.productId} className={clsx('flex items-center gap-3 px-5 py-2.5', s.qty === 0 && 'opacity-50')}>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{s.name}</p><p className="text-xs text-slate-500">DP {inr(s.dp)} · {s.bv} BV · <span className={s.qty <= 5 ? 'font-semibold text-amber-700' : ''}>{s.qty} in stock</span></p></div>
                    <div className="flex items-center gap-1">
                      <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40" disabled={!cart[s.productId]} onClick={() => add(s.productId, -1)} aria-label={`Less ${s.name}`}><Minus className="h-4 w-4" /></button>
                      <span className="w-8 text-center font-bold">{cart[s.productId] ?? 0}</span>
                      <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40" disabled={(cart[s.productId] ?? 0) >= s.qty} onClick={() => add(s.productId, 1)} aria-label={`More ${s.name}`}><Plus className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {member && type !== 'REPURCHASE' && (
            <Card title={`2 · ${type === 'JOINING' ? 'Joining package' : 'Upgrade package'}`}>
              <div className="grid gap-3 md:grid-cols-2">
                {pkgOptions.map((p: any) => {
                  const short = p.items.filter((i: any) => stockOf(i.productId) < i.qty);
                  return (
                    <button key={p.code} type="button" onClick={() => setPkg(p.code)} className={clsx('rounded-2xl border p-4 text-left transition', pkg === p.code ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 hover:border-slate-300')}>
                      <div className="flex items-start justify-between gap-2"><p className="font-bold">{p.name}</p><Badge status={p.tier} /></div>
                      <p className="mt-1 text-2xl font-extrabold text-brand-800">{inr(p.price)}</p>
                      <p className="text-xs text-slate-500">{Number(p.bv)} BV</p>
                      <ul className="mt-2 space-y-0.5 text-xs text-slate-600">{p.items.map((i: any) => <li key={i.productId} className={stockOf(i.productId) < i.qty ? 'font-semibold text-red-600' : ''}>• {i.name} × {i.qty} {stockOf(i.productId) < i.qty && `(you have ${stockOf(i.productId)})`}</li>)}</ul>
                      {short.length > 0 && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> Not enough stock</p>}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
          {!member && <Card><EmptyState icon={<UserCheck className="h-6 w-6" />} title="Start with the distributor ID">Find the buyer first — then choose a repurchase, a joining package (new IDs) or an upgrade (40 BV IDs).</EmptyState></Card>}
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card title="Bill">
            {type === 'REPURCHASE' ? (
              lines.length ? <div className="mb-3 space-y-1.5 text-sm">{lines.map((l) => <div key={l.productId} className="flex justify-between gap-2"><span className="truncate">{l.name} × {l.qty}</span><span>{inr(l.dp * l.qty)}</span></div>)}</div>
                : <p className="mb-3 text-sm text-slate-400">No products added</p>
            ) : chosenPkg ? <div className="mb-3 flex justify-between text-sm"><span>{chosenPkg.name}</span><span>{inr(chosenPkg.price)}</span></div> : <p className="mb-3 text-sm text-slate-400">Choose a package</p>}
            <div className="space-y-1 border-t border-slate-100 pt-3">
              <div className="flex justify-between text-sm text-slate-500"><span>BV to {member?.distributorCode ?? 'buyer'}</span><span>{type === 'REPURCHASE' ? totalBv : Number(chosenPkg?.bv ?? 0)} BV</span></div>
              <div className="flex justify-between text-lg font-extrabold"><span>Total (incl. GST)</span><span>{inr(type === 'REPURCHASE' ? total : chosenPkg?.price ?? 0)}</span></div>
            </div>
            <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Payment received by</p>
            <div className="grid grid-cols-3 gap-2">
              {PAY.map((p) => <button key={p.value} type="button" onClick={() => setPay(p.value)} className={clsx('flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-semibold', pay === p.value ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600')}>{p.icon}{p.label}</button>)}
            </div>
            {pay !== 'CASH' && <Field label={`${pay} reference (optional)`} className="mt-3"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transaction ID" /></Field>}
            <Button className="mt-4 w-full" size="lg" loading={busy === 'bill'} disabled={!ready} onClick={bill} icon={<Receipt className="h-4 w-4" />}>Bill &amp; generate invoice</Button>
            <p className="mt-2 text-center text-xs text-slate-400">Collect the payment before billing. A bill cannot be edited — returns go through the company.</p>
          </Card>
        </div>
      </div>

      <Modal open={!!done} onClose={reset} size="sm" title="Sale billed"
        footer={<><Button variant="ghost" onClick={() => nav('/franchise/sales')}>All sales</Button><Button variant="outline" icon={<FileText className="h-4 w-4" />} onClick={() => invoice(done.id)}>Invoice</Button><Button onClick={reset} icon={<PackagePlus className="h-4 w-4" />}>Next sale</Button></>}>
        {done && <div className="text-center"><CheckCircle2 className="mx-auto mb-2 h-12 w-12 text-brand-600" /><p className="text-lg font-bold">{inr(done.grandTotal)} · {Number(done.bvTotal)} BV</p><p className="text-sm text-slate-500">Bill {done.orderNo} · Invoice {done.invoiceNo}</p></div>}
      </Modal>
    </div>
  );
}

/* ============================== STOCK ============================== */
export function FranchiseStock() {
  const [tab, setTab] = useState<'stock' | 'ledger'>('stock');
  const { data, isLoading } = useQuery({ queryKey: ['fr-stock'], queryFn: () => get('/franchise/stock') });
  const value = (data ?? []).reduce((a: number, s: any) => a + s.qty * s.dp, 0);
  return (
    <div>
      <PageHeader icon={<Boxes className="h-5 w-5" />} title="My stock" subtitle={`Stock allotted by the company · worth ${inr(value)} at DP`} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'stock', label: 'Stock in hand' }, { value: 'ledger', label: 'Movements' }]} />
      {tab === 'stock' ? (
        <Card noPad>
          <DataTable loading={isLoading} rows={data?.map((s: any) => ({ ...s, id: s.productId }))} columns={[
            { key: 'name', header: 'Product', render: (s: any) => <div><p className="font-semibold">{s.name}</p><p className="text-xs text-slate-500">{s.sku}{s.category ? ` · ${s.category}` : ''}</p></div> },
            { key: 'qty', header: 'In stock', align: 'right', render: (s: any) => <b className={s.qty === 0 ? 'text-slate-400' : s.qty <= 5 ? 'text-amber-700' : ''}>{s.qty}</b> },
            { key: 'mrp', header: 'MRP', align: 'right', render: (s: any) => inr(s.mrp) },
            { key: 'dp', header: 'DP', align: 'right', render: (s: any) => inr(s.dp) },
            { key: 'bv', header: 'BV', align: 'right', render: (s: any) => s.bv },
            { key: 'value', header: 'Value at DP', align: 'right', render: (s: any) => inr(s.qty * s.dp) },
          ]} />
        </Card>
      ) : <StockLedger url="/franchise/stock-ledger" />}
    </div>
  );
}

/* ============================== SALES ============================== */
export function FranchiseSales() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => { setSearch(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);
  const params = { q: search || undefined, page, pageSize: 20 };
  const { data, isLoading } = useQuery({ queryKey: ['fr-sales', params], queryFn: () => get('/franchise/sales', params) });
  return (
    <div>
      <PageHeader icon={<Receipt className="h-5 w-5" />} title="Sales" subtitle="Every bill made at your counter" actions={<Link to="/franchise/sale"><Button icon={<ShoppingCart className="h-4 w-4" />}>New sale</Button></Link>} />
      <Card noPad>
        <div className="border-b border-slate-100 p-4"><div className="relative max-w-md"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-10" placeholder="Bill no., distributor ID or name" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
        <SalesTable rows={data?.items} loading={isLoading} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}

/* ============================== COMMISSION ============================== */
export function FranchiseCommission() {
  const [status, setStatus] = useState<'' | 'PENDING' | 'PAID' | 'CANCELLED'>('');
  const [page, setPage] = useState(1);
  const params = { status: status || undefined, page, pageSize: 20 };
  const { data, isLoading } = useQuery({ queryKey: ['fr-commissions', params], queryFn: () => get('/franchise/commissions', params) });
  const t = data?.totals ?? {};
  return (
    <div>
      <PageHeader icon={<Wallet className="h-5 w-5" />} title="Commission" subtitle="Earned on the taxable value of every counter sale; paid by the company to your bank account" />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Due to you" value={inr(t.PENDING, 2)} icon={<Wallet className="h-5 w-5" />} tone="gold" />
        <StatCard label="Paid to you" value={inr(t.PAID, 2)} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Cancelled (returns)" value={inr(t.CANCELLED, 2)} icon={<AlertTriangle className="h-5 w-5" />} tone="slate" />
      </div>
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[{ value: '', label: 'All' }, { value: 'PENDING', label: 'Due' }, { value: 'PAID', label: 'Paid' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
      <Card noPad>
        <DataTable loading={isLoading} rows={data?.items} empty="No commission yet" columns={[
          { key: 'order', header: 'Bill', render: (c: any) => <div><p className="font-medium">{c.order.orderNo}</p><p className="text-xs text-slate-500">{titleCase(c.order.type)} · {c.order.member?.fullName} ({c.order.member?.distributorCode})</p></div> },
          { key: 'createdAt', header: 'Date', render: (c: any) => dateTime(c.createdAt) },
          { key: 'sale', header: 'Taxable value', align: 'right', render: (c: any) => inr(c.saleAmount, 2) },
          { key: 'pct', header: 'Rate', align: 'right', render: (c: any) => `${Number(c.percent)}%` },
          { key: 'amount', header: 'Commission', align: 'right', render: (c: any) => <b className="text-brand-700">{inr(c.amount, 2)}</b> },
          { key: 'status', header: 'Status', render: (c: any) => <div><Badge status={c.status} />{c.utr && <p className="mt-0.5 text-xs text-slate-400">UTR {c.utr}</p>}</div> },
        ]} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}
