import { useState } from 'react';
import { Presentation } from 'lucide-react';
import { Callout, Card, Modal, PageHeader } from '@/components/ui';

const IMAGES = [
  { src: '/brand/slide-retail-profit.jpg', title: 'Retail profit 10%–40%' },
  { src: '/brand/slide-joining-package.jpg', title: 'Joining packages: 40 BV & 100 BV' },
  { src: '/brand/slide-plan-benefits.jpg', title: 'Plan benefits' },
  { src: '/brand/slide-rank-rewards.jpg', title: 'Ranks, bonuses & rewards' },
  { src: '/brand/slide-director-message.jpg', title: 'Director’s message' },
  { src: '/brand/product-price-list.jpg', title: 'Product price list (MRP / DP / BV)' },
];

export default function Plan() {
  const [zoom, setZoom] = useState<string | null>(null);
  return (
    <div>
      <PageHeader icon={<Presentation className="h-5 w-5" />} title="Business plan" subtitle="Company presentation, price list and how income is calculated" />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {[
          ['1. Activate with products', 'Buy a 40 BV (₹2,000) or 100 BV (₹5,000) product package. ₹50 = 1 BV.'],
          ['2. Build two legs', 'Your team grows on your left and right. Each activated ID adds a unit to its leg.'],
          ['3. Earn on matched pairs', '₹400 per 100:100 pair (₹200 otherwise). Max 30 pairs/day, 210/week, 840/month.'],
        ].map(([t, d]) => <Card key={t}><p className="font-bold text-brand-800">{t}</p><p className="mt-1 text-sm text-slate-600">{d}</p></Card>)}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {IMAGES.map((i) => (
          <button key={i.src} onClick={() => setZoom(i.src)} className="card group overflow-hidden text-left">
            <div className="aspect-video overflow-hidden bg-slate-100"><img src={i.src} alt={i.title} className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.03]" /></div>
            <p className="px-4 py-3 text-sm font-semibold text-slate-800">{i.title}</p>
          </button>
        ))}
      </div>
      <div className="mt-6"><Callout tone="info" title="Important">Income depends on genuine product sales by you and your team and is not guaranteed. Figures on the slides are examples of maximum limits, not expected earnings.</Callout></div>
      <Modal open={!!zoom} onClose={() => setZoom(null)} title="Preview" size="xl">{zoom && <img src={zoom} alt="" className="w-full rounded-xl" />}</Modal>
    </div>
  );
}
