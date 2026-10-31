import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, IndianRupee, PackageCheck, Pencil, Plus, RotateCcw, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { get, openAuthed, patch, post, put } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Callout, Card, DataTable, Field, Input, Modal, PageHeader, Pagination, Select, Tabs } from '@/components/ui';
import { bv, date, dateTime, inr, num, titleCase } from '@/lib/format';
import { useAction } from '@/lib/hooks';

/* ============ PRODUCTS ============ */
export function Products() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-products'], queryFn: () => get('/admin/products') });
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN_SUPER', 'ADMIN_OPS');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<any>(null);
  const [price, setPrice] = useState<any>(null);
  const { busy, run } = useAction();
  const { data: history } = useQuery({ queryKey: ['price-history', price?.id], queryFn: () => get(`/admin/products/${price.id}/prices`), enabled: !!price });
  const rows = (data ?? []).filter((p: any) => `${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase()));

  const saveProduct = () => run('p', () => {
    const body = { sku: form.sku, name: form.name, category: form.category || null, hsnCode: form.hsnCode || null, gstRate: num(form.gstRate), description: form.description || null, isActive: form.isActive, stock: num(form.stock) };
    return form.id ? patch(`/admin/products/${form.id}`, body) : post('/admin/products', { ...body, price: { mrp: num(form.mrp), dp: num(form.dp), bv: num(form.bv) } });
  }, { success: 'Product saved', invalidate: ['admin-products', 'products'] }).then((r) => r && setForm(null));

  return (
    <div>
      <PageHeader icon={<Boxes className="h-5 w-5" />} title="Products" subtitle="Catalogue with versioned prices — old orders always keep their original price and BV"
        actions={canEdit && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ sku: '', name: '', category: '', hsnCode: '', gstRate: 18, stock: 0, isActive: true, mrp: '', dp: '', bv: '' })}>Add product</Button>} />
      <Card className="mb-4"><div className="relative max-w-sm"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-10" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} /></div></Card>
      <Card noPad>
        <DataTable loading={isLoading} rows={rows} columns={[
          { key: 'name', header: 'Product', render: (r: any) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-slate-500">{r.sku} · {r.category ?? '—'}</p></div> },
          { key: 'hsn', header: 'HSN / GST', render: (r: any) => <span className={!r.hsnCode ? 'text-amber-600' : ''}>{r.hsnCode ?? 'HSN missing'} · {num(r.gstRate)}%</span> },
          { key: 'mrp', header: 'MRP', align: 'right', render: (r: any) => inr(r.mrp) },
          { key: 'dp', header: 'DP', align: 'right', render: (r: any) => <b>{inr(r.dp)}</b> },
          { key: 'bv', header: 'BV', align: 'right', render: (r: any) => bv(r.bv) },
          { key: 'margin', header: 'Margin', align: 'right', render: (r: any) => `${Math.round(((num(r.mrp) - num(r.dp)) / num(r.mrp)) * 100)}%` },
          { key: 'stock', header: 'Stock', align: 'right', render: (r: any) => <span className={r.stock < 50 ? 'font-semibold text-red-600' : ''}>{r.stock}</span> },
          { key: 'isActive', header: 'Status', render: (r: any) => <Badge status={r.isActive ? 'ACTIVE' : 'CLOSED'}>{r.isActive ? 'On sale' : 'Hidden'}</Badge> },
          { key: 'a', header: '', align: 'right', render: (r: any) => canEdit && <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setForm({ ...r, gstRate: num(r.gstRate) })}>Edit</Button>
            <Button size="sm" variant="ghost" icon={<IndianRupee className="h-4 w-4" />} onClick={() => setPrice({ id: r.id, name: r.name, mrp: num(r.mrp), dp: num(r.dp), bv: num(r.bv) })}>Price</Button>
          </div> },
        ]} />
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit product' : 'Add product'} size="lg"
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button loading={busy === 'p'} onClick={saveProduct}>Save</Button></>}>
        {form && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Category"><Input value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="HSN code"><Input value={form.hsnCode ?? ''} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} /></Field><Field label="GST %"><Input type="number" value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: e.target.value })} /></Field></div>
          <Field label="Description" className="sm:col-span-2"><Input value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Stock"><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
          <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> On sale</label>
          {!form.id && <div className="grid grid-cols-3 gap-3 sm:col-span-2"><Field label="MRP"><Input type="number" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} /></Field><Field label="DP"><Input type="number" value={form.dp} onChange={(e) => setForm({ ...form, dp: e.target.value })} /></Field><Field label="BV"><Input type="number" value={form.bv} onChange={(e) => setForm({ ...form, bv: e.target.value })} /></Field></div>}
        </div>}
      </Modal>
      <Modal open={!!price} onClose={() => setPrice(null)} title={`New price — ${price?.name}`}
        footer={<Button loading={busy === 'pr'} onClick={() => run('pr', () => post(`/admin/products/${price.id}/prices`, { mrp: num(price.mrp), dp: num(price.dp), bv: num(price.bv) }), { success: 'New price is live', invalidate: ['admin-products', 'price-history', 'products'] })}>Publish new price</Button>}>
        {price && <>
          <div className="grid grid-cols-3 gap-3">
            <Field label="MRP"><Input type="number" value={price.mrp} onChange={(e) => setPrice({ ...price, mrp: e.target.value })} /></Field>
            <Field label="DP"><Input type="number" value={price.dp} onChange={(e) => setPrice({ ...price, dp: e.target.value })} /></Field>
            <Field label="BV"><Input type="number" value={price.bv} onChange={(e) => setPrice({ ...price, bv: e.target.value })} /></Field>
          </div>
          <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Price history</p>
          <DataTable rows={history} columns={[
            { key: 'f', header: 'From', render: (r: any) => date(r.effectiveFrom) }, { key: 't', header: 'To', render: (r: any) => (r.effectiveTo ? date(r.effectiveTo) : <Badge status="ACTIVE">Current</Badge>) },
            { key: 'mrp', header: 'MRP', align: 'right', render: (r: any) => inr(r.mrp) }, { key: 'dp', header: 'DP', align: 'right', render: (r: any) => inr(r.dp) }, { key: 'bv', header: 'BV', align: 'right', render: (r: any) => bv(r.bv) },
          ]} />
        </>}
      </Modal>
    </div>
  );
}

/* ============ PACKAGES ============ */
export function Packages() {
  const { data } = useQuery({ queryKey: ['admin-packages'], queryFn: () => get('/admin/packages') });
  const { data: products } = useQuery({ queryKey: ['admin-products'], queryFn: () => get('/admin/products') });
  const { hasRole } = useAuth();
  const [form, setForm] = useState<any>(null);
  const { busy, run } = useAction();
  const bundleDp = (items: any[]) => items.reduce((a, i) => a + num(products?.find((p: any) => p.id === i.productId)?.dp) * i.qty, 0);
  return (
    <div>
      <PageHeader icon={<PackageCheck className="h-5 w-5" />} title="Joining packages" subtitle="Each package must contain real products (Direct Selling Rules)" />
      <div className="grid gap-5 lg:grid-cols-3">
        {data?.map((p: any) => (
          <Card key={p.id} title={p.name} subtitle={`${p.code}${p.isUpgrade ? ' · upgrade' : ''}`} actions={hasRole('ADMIN_SUPER') && <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setForm({ ...p, price: num(p.price), bv: num(p.bv), items: p.items.map((i: any) => ({ productId: i.productId, qty: i.qty })) })}>Edit</Button>}>
            <div className="flex items-baseline gap-3"><p className="text-3xl font-black">{inr(p.price)}</p><p className="font-semibold text-brand-700">{bv(p.bv)} BV</p><Badge status={p.isActive ? 'ACTIVE' : 'CLOSED'}>{p.isActive ? 'Active' : 'Off'}</Badge></div>
            <ul className="mt-4 space-y-1.5 text-sm">{p.items.map((i: any) => <li key={i.id} className="flex justify-between"><span>{i.product.name}</span><span className="text-slate-500">× {i.qty}</span></li>)}</ul>
            <p className="mt-3 text-xs text-slate-500">Bundle value at DP: {inr(bundleDp(p.items))}</p>
          </Card>
        ))}
      </div>
      <Modal open={!!form} onClose={() => setForm(null)} title={`Edit ${form?.code}`} size="lg"
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button loading={busy === 's'} onClick={() => run('s', () => put(`/admin/packages/${form.id}`, { name: form.name, price: num(form.price), bv: num(form.bv), isActive: form.isActive, items: form.items.filter((i: any) => i.productId) }), { success: 'Package saved', invalidate: ['admin-packages', 'packages'] }).then((r) => r && setForm(null))}>Save</Button></>}>
        {form && <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" className="sm:col-span-3"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Price (₹)"><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
            <Field label="BV"><Input type="number" value={form.bv} onChange={(e) => setForm({ ...form, bv: e.target.value })} /></Field>
            <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Products in this package</p>
          {form.items.map((it: any, k: number) => (
            <div key={k} className="flex gap-2">
              <Select className="flex-1" value={String(it.productId ?? '')} onChange={(e) => { const items = [...form.items]; items[k] = { ...it, productId: Number(e.target.value) }; setForm({ ...form, items }); }} placeholder="Choose product" options={(products ?? []).map((p: any) => ({ value: String(p.id), label: `${p.name} (DP ${inr(p.dp)})` }))} />
              <Input type="number" min={1} className="w-20" value={it.qty} onChange={(e) => { const items = [...form.items]; items[k] = { ...it, qty: Number(e.target.value) }; setForm({ ...form, items }); }} />
              <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setForm({ ...form, items: form.items.filter((_: any, j: number) => j !== k) })} aria-label="Remove" />
            </div>
          ))}
          <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ ...form, items: [...form.items, { productId: null, qty: 1 }] })}>Add product</Button>
          <Callout tone="info">Bundle value at DP: <b>{inr(bundleDp(form.items))}</b> vs package price <b>{inr(form.price)}</b>.</Callout>
        </div>}
      </Modal>
    </div>
  );
}

/* ============ ORDERS ============ */
export function AdminOrders() {
  const [f, setF] = useState({ q: '', type: '', status: '' });
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['admin-orders', f, page], queryFn: () => get('/admin/orders', { q: f.q || undefined, type: f.type || undefined, status: f.status || undefined, page }) });
  const { hasRole } = useAuth();
  const { busy, run } = useAction();
  const move = (id: string, status: string) => run(id + status, () => patch(`/admin/orders/${id}/status`, { status }), { success: `Order marked ${status.toLowerCase()}`, invalidate: ['admin-orders'] });
  const canOps = hasRole('ADMIN_SUPER', 'ADMIN_OPS');
  return (
    <div>
      <PageHeader icon={<ShoppingCart className="h-5 w-5" />} title="Orders" subtitle="Payments, invoices and dispatch" />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_200px]">
          <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-10" placeholder="Order no, invoice no or distributor ID" value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setPage(1); }} /></div>
          <Select value={f.type} onChange={(e) => { setF({ ...f, type: e.target.value }); setPage(1); }} placeholder="All types" options={['JOINING', 'UPGRADE', 'REPURCHASE', 'RETAIL'].map((s) => ({ value: s, label: titleCase(s) }))} />
          <Select value={f.status} onChange={(e) => { setF({ ...f, status: e.target.value }); setPage(1); }} placeholder="All statuses" options={['PENDING_PAYMENT', 'INVOICED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'].map((s) => ({ value: s, label: titleCase(s) }))} />
        </div>
      </Card>
      <Card noPad>
        <DataTable loading={isLoading} rows={data?.items} columns={[
          { key: 'orderNo', header: 'Order', render: (r: any) => <div><p className="font-semibold">{r.orderNo}</p><p className="text-xs text-slate-500">{dateTime(r.createdAt)}</p></div> },
          { key: 'member', header: 'Distributor', render: (r: any) => <div><p>{r.member?.fullName}</p><p className="text-xs text-brand-700">{r.member?.distributorCode}</p></div> },
          { key: 'type', header: 'Type', render: (r: any) => <Badge>{r.type}</Badge> },
          { key: 'grandTotal', header: 'Amount', align: 'right', render: (r: any) => <div><b>{inr(r.grandTotal)}</b><p className="text-xs text-slate-500">{bv(r.bvTotal)} BV</p></div> },
          { key: 'status', header: 'Status', render: (r: any) => <div><Badge status={r.status} />{r.invoiceNo && <button className="link mt-1 block text-[11px]" onClick={() => openAuthed(`/orders/${r.id}/invoice`)}>{r.invoiceNo}</button>}</div> },
          { key: 'a', header: '', align: 'right', render: (r: any) => canOps && <div className="flex justify-end gap-1">
            {r.status === 'PENDING_PAYMENT' && <><Button size="sm" variant="secondary" loading={busy === r.id + 'PAID'} onClick={() => move(r.id, 'PAID')}>Cash paid</Button><Button size="sm" variant="ghost" onClick={() => move(r.id, 'CANCELLED')}>Cancel</Button></>}
            {['INVOICED', 'PAID'].includes(r.status) && <Button size="sm" variant="secondary" loading={busy === r.id + 'SHIPPED'} onClick={() => move(r.id, 'SHIPPED')}>Ship</Button>}
            {r.status === 'SHIPPED' && <Button size="sm" variant="secondary" loading={busy === r.id + 'DELIVERED'} onClick={() => move(r.id, 'DELIVERED')}>Delivered</Button>}
          </div> },
        ]} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}

/* ============ RETURNS ============ */
export function Returns() {
  const [status, setStatus] = useState('REQUESTED');
  const { data, isLoading } = useQuery({ queryKey: ['admin-returns', status], queryFn: () => get('/admin/returns', { status: status || undefined }) });
  const { hasRole } = useAuth();
  const { busy, run } = useAction();
  const decide = (id: string, approve: boolean) => {
    if (approve && !confirm('Approve this return? The payment is refunded and the order BV is reversed in the upline.')) return;
    run(id, () => post(`/admin/returns/${id}/decision`, { approve }), { success: approve ? 'Return approved & refunded' : 'Return rejected', invalidate: ['admin-returns', 'admin-dashboard'] });
  };
  return (
    <div>
      <PageHeader icon={<RotateCcw className="h-5 w-5" />} title="Returns & buy-back" subtitle="Approving refunds the order, reverses its BV and deactivates a returned joining" />
      <Tabs value={status} onChange={setStatus} tabs={[{ value: 'REQUESTED', label: 'Waiting' }, { value: 'REFUNDED', label: 'Refunded' }, { value: 'REJECTED', label: 'Rejected' }, { value: '', label: 'All' }]} />
      <Card noPad>
        <DataTable loading={isLoading} rows={data?.items} empty="No return requests" columns={[
          { key: 'createdAt', header: 'Requested', render: (r: any) => dateTime(r.createdAt) },
          { key: 'order', header: 'Order', render: (r: any) => <div><p className="font-semibold">{r.order.orderNo}</p><p className="text-xs text-slate-500">{r.order.type} · {inr(r.order.grandTotal)} · {bv(r.order.bvTotal)} BV</p></div> },
          { key: 'member', header: 'Distributor', render: (r: any) => `${r.order.member?.fullName} (${r.order.member?.distributorCode})` },
          { key: 'reason', header: 'Reason', className: 'max-w-xs whitespace-normal', render: (r: any) => r.reason },
          { key: 'status', header: 'Status', render: (r: any) => <Badge status={r.status} /> },
          { key: 'a', header: '', align: 'right', render: (r: any) => r.status === 'REQUESTED' && hasRole('ADMIN_SUPER', 'ADMIN_OPS') && <div className="flex justify-end gap-1">
            <Button size="sm" variant="secondary" loading={busy === r.id} onClick={() => decide(r.id, true)}>Approve</Button>
            <Button size="sm" variant="ghost" onClick={() => decide(r.id, false)}>Reject</Button>
          </div> },
        ]} />
      </Card>
    </div>
  );
}
