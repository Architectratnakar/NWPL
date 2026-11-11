import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Hash, Layers, ShoppingBag, Target, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { get } from '@/api/client';
import { Button, Callout, Card, EmptyState, PageHeader, PageLoader, Progress, StatCard } from '@/components/ui';
import { date, inr } from '@/lib/format';
import { StateBadge } from '@/pages/admin/Autopool';

const n = (v: number) => Number(v).toLocaleString('en-IN');

export default function MemberAutopool() {
  const { data, isLoading } = useQuery({ queryKey: ['my-autopool'], queryFn: () => get('/autopool/my') });
  if (isLoading || !data) return <PageLoader />;
  const next = data.progress?.find((l: any) => !l.paid);
  const needBv = next && !next.qualified ? next.requiredBv - data.repurchaseBv : 0;

  return (
    <div>
      <PageHeader icon={<Layers className="h-5 w-5" />} title="Autopool" subtitle="Company-wide 4 × 4 matrix, filled in joining order. Each level pays once when it is full and your repurchase condition is met." />
      {!data.enabled && <div className="mb-5"><Callout tone="info" title="The autopool is not active yet">Your position (if any) is kept. Income starts only when the company switches the autopool on.</Callout></div>}

      {!data.entry ? (
        <Card>
          <EmptyState icon={<Layers className="h-6 w-6" />} title="You are not in the autopool yet">
            Activated IDs get a position automatically when the autopool is active. Your repurchase BV so far: <b>{data.repurchaseBv} BV</b>.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="My position" value={`#${n(data.entry.position)}`} sub={`Since ${date(data.entry.enteredAt)} · pool has ${n(data.poolSize)} positions`} icon={<Hash className="h-5 w-5" />} />
            <StatCard label="Autopool income received" value={inr(data.earned)} sub={`${data.payouts.length} level(s) paid`} icon={<Wallet className="h-5 w-5" />} tone="plum" />
            <StatCard label="My repurchase BV" value={`${data.repurchaseBv} BV`} sub="Repurchase orders on your own ID" icon={<ShoppingBag className="h-5 w-5" />} tone="gold" />
            <StatCard label="Next level" value={next ? `Level ${next.level}` : 'All done 🎉'} sub={next ? `${n(next.filled)} of ${n(next.team)} filled · ${inr(next.income)}` : 'Every level is paid'} icon={<Target className="h-5 w-5" />} tone="blue" />
          </div>

          {needBv > 0 && (
            <div className="mb-5">
              <Callout tone="warn" title={`Repurchase ${needBv} BV more to qualify for level ${next.level}`}>
                {next.complete ? 'This level is already full — your income is waiting only for the repurchase.' : 'Do it now so the income is paid as soon as the level fills.'}{' '}
                <Link to="/app/shop" className="font-semibold underline">Go to shop →</Link>
              </Callout>
            </div>
          )}

          <Card title="Level progress" subtitle={data.conditionMode === 'CUMULATIVE' ? 'Each level needs its own repurchase — the BV adds up level by level' : 'Your total repurchase BV must reach the level figure'}>
            <div className="space-y-3">
              {data.progress.map((l: any) => (
                <div key={l.level} className={clsx('grid items-center gap-3 rounded-xl border p-3 sm:grid-cols-[56px_1fr_120px_110px_150px]', l.paid ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200')}>
                  <span className={clsx('grid h-10 w-10 place-items-center rounded-xl font-extrabold', l.paid ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700')}>{l.level}</span>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Team {n(l.filled)} / {n(l.team)}</span><span>{Math.floor((l.filled / l.team) * 100)}%</span></div>
                    <Progress value={(l.filled / l.team) * 100} tone={l.complete ? 'green' : 'plum'} />
                  </div>
                  <div className="text-right"><p className="text-xs text-slate-500">Income</p><p className="font-bold">{inr(l.income)}</p></div>
                  <div className="text-right"><p className="text-xs text-slate-500">BV needed</p><p className={clsx('font-semibold', l.qualified ? 'text-brand-700' : 'text-amber-700')}>{l.requiredBv} BV</p></div>
                  <div className="sm:text-right"><StateBadge state={l.state} /></div>
                </div>
              ))}
            </div>
            {needBv > 0 && <div className="mt-4 text-right"><Link to="/app/shop"><Button variant="gold" icon={<ShoppingBag className="h-4 w-4" />}>Shop repurchase</Button></Link></div>}
          </Card>
        </>
      )}
    </div>
  );
}
