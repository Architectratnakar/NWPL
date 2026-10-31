import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Package, RotateCcw } from 'lucide-react';
import { get, openAuthed, post, type Paged } from '@/api/client';
import { Badge, Button, Card, DataTable, Field, KeyValue, Modal, PageHeader, Pagination, Tabs, Textarea } from '@/components/ui';
import { bv, date, dateTime, inr } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import PayModal, { type OrderLite } from './PayModal';

interface Order extends OrderLite { status: string; invoiceNo: string | null; createdAt: string; paidAt: string | null; returns: { status: string }[]; _count: { items: number } }

export default function Orders() {
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['orders', type, page], queryFn: () => get<Paged<Order>>('/orders/my', { type: type || undefined, page }) });
  const [view, setView] = useState<string | null>(null);
  const [pay, setPay] = useState<OrderLite | null>(null);
  return (
    <div>
      <PageHeader icon={<Package className="h-5 w-5" />} title="My orders" subtitle="Joining, upgrade and repurchase orders with GST invoices" />
      <Tabs value={type} onChange={(v) => { setType(v); setPage(1); }} tabs={[{ value: '', label: 'All' }, { value: 'JOINING', label: 'Joining' }, { value: 'UPGRADE', label: 'Upgrade' }, { value: 'REPURCHASE', label: 'Repurchase' }]} />
      <Card noPad>
        <DataTable loading={isLoading} rows={data?.items} onRowClick={(r) => setView(r.id)} empty="No orders yet"
          columns={[
            { key: 'orderNo', header: 'Order', render: (r) => <div><p className="font-semibold text-slate-900">{r.orderNo}</p><p className="text-xs text-slate-500">{dateTime(r.createdAt)}</p></div> },
            { key: 'type', header: 'Type', render: (r) => <Badge>{r.type}</Badge> },
            { key: 'total', header: 'Amount', align: 'right', render: (r) => <b>{inr(r.grandTotal)}</b> },
            { key: 'bv', header: 'BV', align: 'right', render: (r) => bv(r.bvTotal) },
            { key: 'status', header: 'Status', render: (r) => <div className="flex gap-1"><Badge status={r.status} />{r.returns[0] && <Badge status={r.returns[0].status}>Return {r.returns[0].status.toLowerCase()}</Badge>}</div> },
            { key: 'inv', header: 'Invoice', render: (r) => r.invoiceNo ? <button className="link text-xs" onClick={(e) => { e.stopPropagation(); openAuthed(`/orders/${r.id}/invoice`); }}>{r.invoiceNo}</button>
                : r.status === 'PENDING_PAYMENT' ? <Button size="sm" onClick={(e) => { e.stopPropagation(); setPay(r); }}>Pay now</Button> : '—' },
          ]} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      {view && <OrderDetail id={view} onClose={() => setView(null)} />}
      <PayModal order={pay} onClose={() => setPay(null)} />
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
