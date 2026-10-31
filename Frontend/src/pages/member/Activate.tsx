import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { CheckCircle2, Crown, PackageOpen, Zap } from 'lucide-react';
import { get, post } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Callout, PageHeader, PageLoader } from '@/components/ui';
import { inr } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import PayModal, { type OrderLite } from './PayModal';

interface Pkg { id: number; code: string; name: string; price: string; bv: string; tier: string; isUpgrade: boolean; items: { qty: number; product: { name: string; sku: string } }[] }

export default function Activate() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data: pkgs, isLoading } = useQuery({ queryKey: ['packages'], queryFn: () => get<Pkg[]>('/catalog/packages') });
  const [order, setOrder] = useState<OrderLite | null>(null);
  const { busy, run } = useAction();
  if (isLoading || !pkgs) return <PageLoader />;
  const tier = user?.packageTier ?? 'NONE';

  const buy = (p: Pkg) => run(p.code, async () => setOrder(await post('/orders', { type: p.isUpgrade ? 'UPGRADE' : 'JOINING', packageCode: p.code })));

  return (
    <div>
      <PageHeader icon={<Zap className="h-5 w-5" />} title="Activate / Upgrade your ID" subtitle="Joining is by purchasing real products. ₹50 = 1 BV." actions={<Badge status={tier} className="text-sm" />} />
      {tier === 'FULL' && <div className="mb-6"><Callout tone="success" title="Your ID is fully active (100 BV)">You earn the full ₹400 pair rate. Use the Shop for repurchases.</Callout></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        {pkgs.map((p) => {
          const allowed = p.isUpgrade ? tier === 'BASIC' : tier === 'NONE';
          const featured = p.code === 'FULL_100';
          return (
            <div key={p.id} className={clsx('card relative flex flex-col overflow-hidden', featured && 'ring-2 ring-gold-400')}>
              {featured && <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-gold-500 px-2.5 py-1 text-[11px] font-bold text-white"><Crown className="h-3 w-3" /> Recommended</div>}
              <div className={clsx('p-6', p.isUpgrade ? 'bg-sky-50' : featured ? 'bg-gradient-to-br from-brand-800 to-brand-950 text-white' : 'bg-brand-50')}>
                <p className={clsx('text-sm font-semibold', featured ? 'text-gold-300' : 'text-slate-500')}>{p.isUpgrade ? 'Upgrade' : 'Joining package'}</p>
                <p className="mt-1 text-xl font-extrabold">{p.name}</p>
                <p className="mt-4 text-4xl font-black tracking-tight">{inr(p.price)}</p>
                <p className={clsx('mt-1 text-sm font-semibold', featured ? 'text-brand-100' : 'text-brand-700')}>{Number(p.bv)} BV</p>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />{p.tier === 'FULL' ? '₹400 per matched pair (100 BV : 100 BV)' : '₹200 per matched pair'}</li>
                  <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />GST invoice & home delivery</li>
                  <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />30-day return policy</li>
                </ul>
                <div className="mt-5 rounded-xl bg-slate-50 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><PackageOpen className="h-3.5 w-3.5" /> Products included</p>
                  <ul className="space-y-1 text-sm text-slate-700">{p.items.map((i) => <li key={i.product.sku}>• {i.product.name} × {i.qty}</li>)}</ul>
                  {!p.items.length && <p className="text-xs text-slate-500">Bundle to be configured by admin</p>}
                </div>
                <div className="mt-auto pt-5">
                  <Button className="w-full" size="lg" variant={featured ? 'gold' : 'primary'} disabled={!allowed} loading={busy === p.code} onClick={() => buy(p)}>
                    {allowed ? (p.isUpgrade ? 'Upgrade now' : 'Activate with this package') : p.isUpgrade ? 'Only for 40 BV IDs' : 'Already activated'}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-slate-500">Income depends on genuine product sales by you and your team. No income is guaranteed. Products can be returned within the cooling-off period as per the return policy.</p>
      <PayModal order={order} onClose={() => setOrder(null)} onPaid={() => nav('/app')} />
    </div>
  );
}
