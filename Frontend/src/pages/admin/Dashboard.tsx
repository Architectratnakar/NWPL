import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BadgeCheck, ClipboardList, HandCoins, Headphones, IndianRupee, LayoutDashboard, RotateCcw, ShoppingCart, TrendingUp, UserPlus, Users } from 'lucide-react';
import { get } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Avatar, Badge, Button, Callout, Card, DataTable, PageHeader, PageLoader, StatCard } from '@/components/ui';
import { bv, compactInr, dateTime, inr } from '@/lib/format';

const TIER_COLORS: Record<string, string> = { FULL: '#7c3aed', BASIC: '#15803d', NONE: '#c2740a' };
const TIER_LABEL: Record<string, string> = { FULL: '100 BV IDs', BASIC: '40 BV IDs', NONE: 'Not activated' };

export default function AdminDashboard() {
  const { data: d } = useQuery({ queryKey: ['admin-dashboard'], queryFn: () => get('/admin/dashboard') });
  const { user } = useAuth();
  const nav = useNavigate();
  if (!d) return <PageLoader />;
  const k = d.kpis;
  const series = d.series.map((s: any) => ({ ...s, label: new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) }));
  const tiers = ['FULL', 'BASIC', 'NONE'].map((t) => ({ tier: t, label: TIER_LABEL[t], count: d.tiers.find((x: any) => x.tier === t)?.count ?? 0 }));
  const overRatio = k.payoutRatio > k.payoutAlertPercent;

  return (
    <div className="space-y-6">
      <PageHeader icon={<LayoutDashboard className="h-5 w-5" />} title="Admin dashboard" subtitle={`Signed in as ${user?.email} · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        actions={<Button icon={<ClipboardList className="h-4 w-4" />} onClick={() => nav('/admin/closings')}>Closings</Button>} />

      {d.openClosing && <Callout tone="warn" title={`A closing is waiting: ${d.openClosing.status.toLowerCase()}`}>Payout {inr(d.openClosing.totalPayout)}. <button className="link" onClick={() => nav(`/admin/closings/${d.openClosing.id}`)}>Review →</button></Callout>}
      {overRatio && <Callout tone="danger" title={`Payout is ${k.payoutRatio}% of this month's sales`}>Above the alert level of {k.payoutAlertPercent}% set in Plan Settings.</Callout>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Distributors" value={k.members.toLocaleString('en-IN')} sub={`${k.active} active · ${k.joinedToday} joined today`} icon={<Users className="h-5 w-5" />} onClick={() => nav('/admin/members')} />
        <StatCard label="Sales this month" value={compactInr(k.monthSales)} sub={`${k.monthOrders} paid orders · ${bv(k.monthBv)} BV`} icon={<IndianRupee className="h-5 w-5" />} tone="gold" onClick={() => nav('/admin/orders')} />
        <StatCard label="Payout this month" value={compactInr(k.monthPayout)} sub={<span className={overRatio ? 'font-semibold text-red-600' : ''}>{k.payoutRatio}% of sales</span>} icon={<TrendingUp className="h-5 w-5" />} tone="plum" onClick={() => nav('/admin/reports')} />
        <StatCard label="Withdrawals to process" value={k.pendingWithdrawals} sub={`${inr(k.pendingWithdrawalAmount)} net`} icon={<HandCoins className="h-5 w-5" />} tone="blue" onClick={() => nav('/admin/withdrawals')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          [<BadgeCheck key="k" className="h-5 w-5" />, 'KYC to review', k.pendingKyc, '/admin/kyc'],
          [<Headphones key="t" className="h-5 w-5" />, 'Open tickets', k.openTickets, '/admin/tickets'],
          [<RotateCcw key="r" className="h-5 w-5" />, 'Return requests', k.pendingReturns, '/admin/returns'],
        ].map(([ic, l, v, to]) => (
          <button key={l as string} onClick={() => nav(to as string)} className="card flex items-center gap-3 p-4 text-left transition hover:shadow-md">
            <div className={`grid h-10 w-10 place-items-center rounded-xl ${Number(v) ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{ic}</div>
            <div className="flex-1"><p className="text-sm text-slate-500">{l}</p><p className="text-xl font-bold">{v as number}</p></div>
            {Number(v) > 0 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="New joinings — last 14 days">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={series} margin={{ left: -16, right: 8, top: 16 }}>
                <CartesianGrid stroke="#eef2f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v: number) => [v, 'Joinings']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="joins" fill="#15803d" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Sales — last 14 days" subtitle="Paid orders, incl. GST">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={series} margin={{ left: 0, right: 8, top: 16 }}>
                <CartesianGrid stroke="#eef2f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `₹${v / 1000}k` : `₹${v}`)} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v: number) => [inr(v), 'Sales']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="sales" fill="#c2740a" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Distributors by package">
          <div className="h-[200px]">
            <ResponsiveContainer>
              <BarChart data={tiers} layout="vertical" margin={{ left: 8, right: 40 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 12, fill: '#334155' }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v: number) => [v, 'Distributors']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={22}>
                  {tiers.map((t) => <Cell key={t.tier} fill={TIER_COLORS[t.tier]} />)}
                  <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Top earners (all time)" noPad>
          <ul className="divide-y divide-slate-100">
            {d.topEarners.map((t: any, i: number) => (
              <li key={t.id ?? i} className="flex items-center gap-3 px-5 py-3">
                <span className="w-4 text-xs font-bold text-slate-400">{i + 1}</span>
                <Avatar name={t.fullName} size={32} />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{t.fullName}</p><p className="text-xs text-brand-700">{t.distributorCode}</p></div>
                <b className="text-sm">{inr(t.amount)}</b>
              </li>
            ))}
            {!d.topEarners.length && <li className="px-5 py-8 text-center text-sm text-slate-500">No income posted yet</li>}
          </ul>
        </Card>
        <Card title="Quick actions">
          <div className="grid gap-2">
            {[
              [<ClipboardList key="1" className="h-4 w-4" />, 'Run today’s closing', '/admin/closings'],
              [<BadgeCheck key="2" className="h-4 w-4" />, 'Review KYC documents', '/admin/kyc'],
              [<HandCoins key="3" className="h-4 w-4" />, 'Process withdrawals', '/admin/withdrawals'],
              [<UserPlus key="4" className="h-4 w-4" />, 'Add a staff user', '/admin/users'],
              [<ShoppingCart key="5" className="h-4 w-4" />, 'Dispatch orders', '/admin/orders'],
            ].map(([ic, l, to]) => (
              <Button key={l as string} variant="outline" className="justify-start" icon={ic} onClick={() => nav(to as string)}>{l}</Button>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Latest orders" noPad actions={<Button size="sm" variant="outline" onClick={() => nav('/admin/orders')}>All orders</Button>}>
        <DataTable rows={d.recentOrders} columns={[
          { key: 'orderNo', header: 'Order', render: (r: any) => <b>{r.orderNo}</b> },
          { key: 'member', header: 'Distributor', render: (r: any) => `${r.member?.fullName} (${r.member?.distributorCode})` },
          { key: 'type', header: 'Type', render: (r: any) => <Badge>{r.type}</Badge> },
          { key: 'grandTotal', header: 'Amount', align: 'right', render: (r: any) => inr(r.grandTotal) },
          { key: 'status', header: 'Status', render: (r: any) => <Badge status={r.status} /> },
          { key: 'createdAt', header: 'Placed', render: (r: any) => dateTime(r.createdAt) },
        ]} />
      </Card>
    </div>
  );
}
