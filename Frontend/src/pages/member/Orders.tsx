import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Package, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { del, get, openAuthed, post, type Paged } from '@/api/client';
import { Badge, Button, Card, DataTable, Field, KeyValue, Modal, PageHeader, Pagination, Tabs, Textarea } from '@/components/ui';
import { bv, date, dateTime, inr } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import PayModal, { type OrderLite } from './PayModal';

interface Order extends OrderLite { status: string; invoiceNo: string | null; createdAt: string; paidAt: string | null; returns: { status: string }[]; _count: { items: number } }

export default function Orders() {
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [showCancelled, setShowCancelled] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['orders', type, page, showCancelled],
    queryFn: () => get<Paged<Order> & { cancelledCount: number }>('/orders/my', { type: type || undefined, page, showCancelled: showCancelled || undefined }),
  });
  const [view, setView] = useState<string | null>(null);
  const [pay, setPay] = useState<OrderLite | null>(null);
  const [cancel, setCancel] = useState<Order | null>(null);
  const [remove, setRemove] = useState<Order | null>(null);
  const [why, setWhy] = useState('');
  const { busy, run } = useAction();
  const doCancel = () => run('c', () => post(`/orders/${cancel!.id}/cancel`, { reason: why.trim() || undefined }), { success: `Order ${cancel!.orderNo} cancelled`, invalidate: ['orders', 'order'] }).then((r) => { if (r) { setCancel(null); setWhy(''); } });
  const doRemove = () => run('r', () => del(`/orders/${remove!.id}`), { success: `Order ${remove!.orderNo} removed`, invalidate: ['orders'] }).then((r) => r && setRemove(null));
  return (
    <div>
      <PageHeader icon={<Package className="h-5 w-5" />} title="My orders" subtitle="Joining, upgrade and repurchase orders with GST invoices" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <Tabs value={type} onChange={(v) => { setType(v); setPage(1); }} tabs={[{ value: '', label: 'All' }, { value: 'JOINING', label: 'Joining' }, { value: 'UPGRADE', label: 'Upgrade' }, { value: 'REPURCHASE', label: 'Repurchase' }]} />
        <label className="mb-4 flex shrink-0 items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={showCancelled} onChange={(e) => { setShowCancelled(e.target.checked); setPage(1); }} />
          Show cancelled{data?.cancelledCount ? ` (${data.cancelledCount})` : ''}
        </label>
      </div>
      <Card noPad>
        <DataTable loading={isLoading} rows={data?.items} onRowClick={(r) => setView(r.id)} empty="No orders yet"
          columns={[
            { key: 'orderNo', header: 'Order', render: (r) => <div><p className="font-semibold text-slate-900">{r.orderNo}</p><p className="text-xs text-slate-500">{dateTime(r.createdAt)}</p></div> },
            { key: 'type', header: 'Type', render: (r) => <Badge>{r.type}</Badge> },
            { key: 'total', header: 'Amount', align: 'right', render: (r) => <b>{inr(r.grandTotal)}</b> },
            { key: 'bv', header: 'BV', align: 'right', render: (r) => bv(r.bvTotal) },
            { key: 'status', header: 'Status', render: (r) => <div className="flex gap-1"><Badge status={r.status} />{r.returns[0] && <Badge status={r.returns[0].status}>Return {r.returns[0].status.toLowerCase()}</Badge>}</div> },
            { key: 'inv', header: 'Invoice', render: (r) => r.invoiceNo ? <button className="link text-xs" onClick={(e) => { e.stopPropagation(); openAuthed(`/orders/${r.id}/invoice`); }}>{r.invoiceNo}</button>
                : r.status === 'PENDING_PAYMENT' ? (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); setPay(r); }}>Pay now</Button>
                    <Button size="sm" variant="ghost" icon={<XCircle className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); setWhy(''); setCancel(r); }}>Cancel</Button>
                  </div>
                ) : r.status === 'CANCELLED' ? (
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4 text-red-600" />} onClick={(e) => { e.stopPropagation(); setRemove(r); }}>Remove</Button>
                ) : '—' },
          ]} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      {view && <OrderDetail id={view} onClose={() => setView(null)} />}
      <PayModal order={pay} onClose={() => setPay(null)} />
      <Modal open={!!cancel} onClose={() => setCancel(null)} title={`Cancel order ${cancel?.orderNo ?? ''}?`} size="sm"
        footer={<><Button variant="ghost" onClick={() => setCancel(null)}>Keep order</Button><Button variant="danger" loading={busy === 'c'} onClick={doCancel}>Cancel order</Button></>}>
        <p className="mb-3 text-sm text-slate-600">This order of <b>{inr(cancel?.grandTotal)}</b> is not paid yet. After cancelling it can’t be paid; place a new order if you need it again.</p>
        <Field label="Reason (optional)"><Textarea value={why} maxLength={300} onChange={(e) => setWhy(e.target.value)} /></Field>
      </Modal>
      <Modal open={!!remove} onClose={() => setRemove(null)} title={`Remove order ${remove?.orderNo ?? ''}?`} size="sm"
        footer={<><Button variant="ghost" onClick={() => setRemove(null)}>Keep</Button><Button variant="danger" loading={busy === 'r'} icon={<Trash2 className="h-4 w-4" />} onClick={doRemove}>Remove</Button></>}>
        <p className="text-sm text-slate-600">This cancelled order was never paid. It will be removed from your order list permanently.</p>
      </Modal>
    </div>
  );
}

function OrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: o } = useQuery({ queryKey: ['order', id], queryFn: () => get(`/orders/${id}`) });
  const [reason, setReason] = useState('');
  const [ret, setRet] = useState(false);
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title={o ? `Order ${o.orderNo}` : 'Order'} size="lg"
      footer={o && <>
        {o.invoiceNo && <Button variant="outline" icon={<FileText className="h-4 w-4" />} onClick={() => openAuthed(`/orders/${id}/invoice`)}>Invoice</Button>}
        {o.paidAt && !['RETURNED', 'CANCELLED'].includes(o.status) && !o.returns.some((r: { status: string }) => r.status === 'REQUESTED') && <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setRet(true)}>Request return</Button>}
        <Button onClick={onClose}>Close</Button>
      </>}>
      {o && (
        <div className="space-y-5">
          <KeyValue cols={3} items={[['Type', o.type], ['Status', <Badge key="s" status={o.status} />], ['Invoice', o.invoiceNo ?? '—'], ['Placed', dateTime(o.createdAt)], ['Paid', dateTime(o.paidAt)], ['Payment', o.payments[0]?.gateway ?? '—']]} />
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50"><tr><th className="th">Product</th><th className="th text-right">Qty</th><th className="th text-right">Rate</th><th className="th text-right">BV</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {o.items.map((i: { id: number; qty: number; unitPrice: string; unitBv: string; product: { name: string } }) => (
                  <tr key={i.id}><td className="td">{i.product.name}</td><td className="td text-right">{i.qty}</td><td className="td text-right">{Number(i.unitPrice) ? inr(i.unitPrice) : 'In package'}</td><td className="td text-right">{bv(Number(i.unitBv) * i.qty)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Taxable</span><span>{inr(o.subTotal, 2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">GST</span><span>{inr(o.gstTotal, 2)}</span></div>
            <div className="flex justify-between text-base font-bold"><span>Total</span><span>{inr(o.grandTotal)}</span></div>
            <div className="flex justify-between font-semibold text-brand-700"><span>BV</span><span>{bv(o.bvTotal)}</span></div>
          </div>
          {o.returns.length > 0 && <p className="text-xs text-slate-500">Return requests: {o.returns.map((r: { status: string; createdAt: string }) => `${r.status} (${date(r.createdAt)})`).join(', ')}</p>}
          {ret && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <Field label="Why do you want to return this order?"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. damaged product" /></Field>
              <p className="mt-2 text-xs text-amber-800">On approval the amount is refunded and the BV of this order is removed from your team volume.</p>
              <Button className="mt-3" variant="danger" loading={busy === 'ret'} onClick={() => run('ret', () => post(`/orders/${id}/return`, { reason }), { success: 'Return requested', invalidate: ['orders', 'order'] }).then((r) => r && setRet(false))}>Submit return request</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
