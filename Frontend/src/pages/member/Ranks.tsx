import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Award, CheckCircle2, Gift, Lock, Plane } from 'lucide-react';
import { get } from '@/api/client';
import { Card, PageHeader, PageLoader, Progress } from '@/components/ui';
import { bv, compactInr, date, num } from '@/lib/format';

export default function Ranks() {
  const { data } = useQuery({ queryKey: ['myranks'], queryFn: () => get('/me/ranks') });
  if (!data) return <PageLoader />;
  const weak = Math.min(num(data.leftBv), num(data.rightBv));
  const next = data.ranks.find((r: any) => !r.achievedAt);
  return (
    <div>
      <PageHeader icon={<Award className="h-5 w-5" />} title="Ranks & rewards" subtitle="Ranks are achieved when BOTH legs reach the required BV" />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card><p className="text-sm text-slate-500">Left leg BV</p><p className="mt-1 text-3xl font-extrabold">{bv(data.leftBv)}</p></Card>
        <Card><p className="text-sm text-slate-500">Right leg BV</p><p className="mt-1 text-3xl font-extrabold">{bv(data.rightBv)}</p></Card>
        <Card className="bg-gradient-to-br from-gold-50 to-white">
          <p className="text-sm text-slate-500">Next rank</p><p className="mt-1 text-2xl font-extrabold text-gold-700">{next?.name ?? 'Top rank reached'}</p>
          {next && <div className="mt-3"><Progress value={(weak / num(next.thresholdBv)) * 100} tone="gold" label={`Weaker leg ${bv(weak)} / ${bv(next.thresholdBv)}`} /></div>}
        </Card>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.ranks.map((r: any) => {
          const got = !!r.achievedAt;
          return (
            <div key={r.id} className={clsx('card flex items-center gap-4 p-4', got && 'border-brand-300 bg-brand-50/50', r === next && 'ring-2 ring-gold-300')}>
              <div className={clsx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-lg font-black', got ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-400')}>{r.id}</div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900">{r.name} <span className="hi text-xs font-medium text-slate-400">{r.nameHi}</span></p>
                <p className="text-xs text-slate-500">{bv(r.thresholdBv)} BV each side{num(r.bonusAmount) ? ` · Bonus ${compactInr(r.bonusAmount)}` : ''}{!r.confirmed ? ' · values to be confirmed' : ''}</p>
                {r.reward && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-gold-700">{/trip/i.test(r.reward) ? <Plane className="h-3 w-3" /> : <Gift className="h-3 w-3" />}{r.reward}</p>}
              </div>
              {got ? <div className="text-right text-xs text-brand-700"><CheckCircle2 className="ml-auto h-5 w-5" />{date(r.achievedAt)}</div> : <Lock className="h-4 w-4 text-slate-300" />}
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-slate-500">Women and divyang distributors (verified by the company) receive an additional ₹2,00,000 on every rank from Diamond upward.</p>
    </div>
  );
}
