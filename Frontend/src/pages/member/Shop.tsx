import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Leaf, Minus, Plus, Search, ShoppingBag, ShoppingCart, Trash2 } from 'lucide-react';
import { get, post } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button, Callout, Card, EmptyState, Input, PageHeader, PageLoader } from '@/components/ui';
import { bv, inr, num } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import PayModal, { type OrderLite } from './PayModal';

interface Product { id: number; sku: string; name: string; category: string | null; description: string | null; mrp: string; dp: string; bv: string; stock: number }
const catColor: Record<string, string> = { 'Health Juice': 'from-brand-100 to-brand-50 text-brand-700', 'Health Drops': 'from-amber-100 to-amber-50 text-amber-700', 'Personal Care': 'from-violet-100 to-violet-50 text-violet-700', Supplements: 'from-sky-100 to-sky-50 text-sky-700', Food: 'from-orange-100 to-orange-50 text-orange-700', 'Home Care': 'from-teal-100 to-teal-50 text-teal-700' };

export default function Shop() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['products'], queryFn: () => get<Product[]>('/catalog/products') });
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [cart, setCart] = useState<Record<number, number>>({});
  const [order, setOrder] = useState<OrderLite | null>(null);
  const { busy, run } = useAction();
  const cats = useMemo(() => ['All', ...new Set((data ?? []).map((p) => p.category ?? 'Other'))], [data]);
  if (isLoading || !data) return <PageLoader />;
  const list = data.filter((p) => (cat === 'All' || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase()));
  const lines = Object.entries(cart).map(([id, qty]) => ({ p: data.find((x) => x.id === Number(id))!, qty })).filter((l) => l.p && l.qty > 0);
  const total = lines.reduce((a, l) => a + num(l.p.dp) * l.qty, 0);
  const totalBv = lines.reduce((a, l) => a + num(l.p.bv) * l.qty, 0);
  const add = (id: number, d: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(99, (c[id] ?? 0) + d)) }));
  const inactive = user?.packageTier === 'NONE';

  const checkout = () => run('checkout', async () => {
    const o = await post('/orders', { type: 'REPURCHASE', items: lines.map((l) => ({ productId: l.p.id, qty: l.qty })) });
    setOrder(o);
  });

  return (
    <div>
      <PageHeader icon={<ShoppingBag className="h-5 w-5" />} title="Shop" subtitle="Buy at Distributor Price (DP). Every product carries Business Volume (BV)." />
      {inactive && <div className="mb-5"><Callout tone="warn" title="Activate your ID before repurchasing">Go to <button className="link" onClick={() => nav('/app/activate')}>Activate / Upgrade</button>.</Callout></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-10" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="scrollbar-thin mb-4 flex gap-2 overflow-x-auto pb-1">
            {cats.map((c) => <button key={c} onClick={() => setCat(c)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${cat === c ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{c}</button>)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {list.map((p) => {
              const margin = Math.round(((num(p.mrp) - num(p.dp)) / num(p.mrp)) * 100);
              return (
                <div key={p.id} className="card flex flex-col p-4">
                  <div className={`relative grid h-28 place-items-center rounded-xl bg-gradient-to-br ${catColor[p.category ?? ''] ?? 'from-slate-100 to-slate-50 text-slate-600'}`}>
                    <Leaf className="h-10 w-10 opacity-70" />
                    <span className="absolute left-2 top-2 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold">{p.category}</span>
                    <span className="absolute right-2 top-2 rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-bold text-white">{bv(p.bv)} BV</span>
                  </div>
                  <p className="mt-3 font-bold text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.sku}</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-lg font-extrabold text-slate-900">{inr(p.dp)}</span>
                    <span className="text-xs text-slate-400 line-through">{inr(p.mrp)}</span>
                    <span className="text-xs font-semibold text-gold-600">{margin}% retail margin</span>
                  </div>
                  <div className="mt-auto pt-3">
                    {cart[p.id] ? (
                      <div className="flex items-center justify-between rounded-xl bg-brand-50 p-1">
                        <button className="rounded-lg p-2 text-brand-800 hover:bg-white" onClick={() => add(p.id, -1)} aria-label="Remove one"><Minus className="h-4 w-4" /></button>
                        <span className="font-bold text-brand-900">{cart[p.id]}</span>
                        <button className="rounded-lg p-2 text-brand-800 hover:bg-white" onClick={() => add(p.id, 1)} aria-label="Add one"><Plus className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <Button variant="secondary" className="w-full" onClick={() => add(p.id, 1)} disabled={inactive} icon={<Plus className="h-4 w-4" />}>Add to cart</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card title={<span className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Your cart</span>} noPad>
            {lines.length ? (
              <>
                <ul className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
                  {lines.map((l) => (
                    <li key={l.p.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{l.p.name}</p><p className="text-xs text-slate-500">{l.qty} × {inr(l.p.dp)} · {bv(num(l.p.bv) * l.qty)} BV</p></div>
                      <p className="text-sm font-bold">{inr(num(l.p.dp) * l.qty)}</p>
                      <button onClick={() => setCart((c) => ({ ...c, [l.p.id]: 0 }))} className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
                <div className="space-y-1 border-t border-slate-100 px-5 py-4 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Total (incl. GST)</span><b className="text-lg">{inr(total)}</b></div>
                  <div className="flex justify-between"><span className="text-slate-500">Business volume</span><b className="text-brand-700">{bv(totalBv)} BV</b></div>
                  <Button className="mt-3 w-full" size="lg" loading={busy === 'checkout'} onClick={checkout}>Place order</Button>
                </div>
              </>
            ) : <EmptyState title="Your cart is empty">Add products to place a repurchase order.</EmptyState>}
          </Card>
        </div>
      </div>
      <PayModal order={order} onClose={() => setOrder(null)} onPaid={() => { setCart({}); nav('/app/orders'); }} />
    </div>
  );
}
