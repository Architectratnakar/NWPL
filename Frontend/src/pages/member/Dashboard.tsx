import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, Award, BadgeCheck, Copy, GitFork, IndianRupee, Scale, Sparkles, Users, Wallet, Zap } from 'lucide-react';
import { get } from '@/api/client';
import { Avatar, Badge, Button, Callout, Card, PageLoader, Progress, StatCard, useToast } from '@/components/ui';
import { bv, date, inr, titleCase } from '@/lib/format';

interface Dash {
  member: { code: string; name: string; status: string; tier: 'NONE' | 'BASIC' | 'FULL'; kycStatus: string; activatedAt: string | null; joinedAt: string; sponsor: { code: string; name: string } | null; rank: string | null };
  volume: { leftBv: string; rightBv: string; leftCount: number; rightCount: number; carryLeft: number; carryRight: number; carry: { lf: number; lb: number; rf: number; rb: number }; pairsToday: number; dayCap: number };
  wallet: { balance: string; onHold: boolean };
  totalIncome: string;
  incomeByType: { type: string; amount: string }[];
  dailyIncome: { date: string; amount: number }[];
  nextRank: { name: string; threshold: string; bonus: string; reward: string | null; leftPct: number; rightPct: number } | null;
  directs: number;
  recentTxns: { id: string; type: string; incomeType: string | null; amount: string; refType: string; note: string | null; createdAt: string }[];
  pairRates: { FULL_FULL: number; DEFAULT: number };
}

export default function MemberDashboard() {
  const { data: d, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => get<Dash>('/me/dashboard') });
  const nav = useNavigate();
  const toast = useToast();
  if (isLoading || !d) return <PageLoader />;
  const refLink = `${window.location.origin}/register?sponsor=${d.member.code}`;
  const chart = fillDays(d.dailyIncome, 14);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 p-6 text-white shadow-lg sm:p-8">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold-400/10 blur-2xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={d.member.name} size={60} className="from-gold-400 to-gold-600 ring-4 ring-white/15" />
            <div>
              <p className="text-sm text-brand-100/80">Welcome back,</p>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{d.member.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white/10 px-2.5 py-1 font-semibold ring-1 ring-white/15">{d.member.code}</span>
                <span className="rounded-full bg-white/10 px-2.5 py-1 font-semibold ring-1 ring-white/15">{d.member.tier === 'NONE' ? 'Not activated' : d.member.tier === 'FULL' ? '100 BV ID' : '40 BV ID'}</span>
                {d.member.rank && <span className="flex items-center gap-1 rounded-full bg-gold-400/20 px-2.5 py-1 font-semibold text-gold-100 ring-1 ring-gold-300/30"><Sparkles className="h-3 w-3" />{d.member.rank}</span>}
                <span className="rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/15">KYC: {titleCase(d.member.kycStatus)}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-[340px]">
            <div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10">
              <p className="text-xs text-brand-100/80">Wallet balance</p>
              <p className="mt-1 text-2xl font-extrabold">{inr(d.wallet.balance)}</p>
              <Link to="/app/wallet" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-gold-300 hover:text-gold-100">Withdraw <ArrowRight className="h-3 w-3" /></Link>
            </div>
            <div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10">
              <p className="text-xs text-brand-100/80">Total income</p>
              <p className="mt-1 text-2xl font-extrabold">{inr(d.totalIncome)}</p>
              <Link to="/app/income" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-gold-300 hover:text-gold-100">Details <ArrowRight className="h-3 w-3" /></Link>
            </div>
          </div>
        </div>
      </section>

      {d.member.tier === 'NONE' && (
        <Callout tone="warn" title="Your ID is not active yet">
          Buy a joining package (40 BV or 100 BV) to start earning. <button onClick={() => nav('/app/activate')} className="link">Activate now →</button>
        </Callout>
      )}
      {d.member.tier === 'BASIC' && (
        <Callout tone="info" title={`Upgrade to 100 BV to earn ₹${d.pairRates.FULL_FULL} per pair`}>
          You currently earn ₹{d.pairRates.DEFAULT} per pair. Upgrade with 60 BV (₹3,000). <button onClick={() => nav('/app/activate')} className="link">Upgrade →</button>
        </Callout>
      )}
      {d.member.tier !== 'NONE' && d.member.kycStatus !== 'APPROVED' && (
        <Callout tone="info" title="Complete your KYC to withdraw income">Upload PAN, Aadhaar and bank proof. <Link to="/app/kyc" className="link">Go to KYC →</Link></Callout>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Left team BV" value={bv(d.volume.leftBv)} sub={`${d.volume.leftCount} activated IDs`} icon={<GitFork className="h-5 w-5 -scale-x-100" />} />
        <StatCard label="Right team BV" value={bv(d.volume.rightBv)} sub={`${d.volume.rightCount} activated IDs`} icon={<GitFork className="h-5 w-5" />} tone="plum" />
        <StatCard label="Pairs today" value={<>{d.volume.pairsToday}<span className="text-base font-semibold text-slate-400"> / {d.volume.dayCap}</span></>} sub="Daily cap · paid at the nightly closing" icon={<Scale className="h-5 w-5" />} tone="gold" />
        <StatCard label="Direct sponsors" value={d.directs} sub="People you introduced" icon={<Users className="h-5 w-5" />} tone="blue" onClick={() => nav('/app/team')} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Income chart */}
        <Card title="Income — last 14 days" subtitle="From posted closings (pair matching + bonuses)" className="xl:col-span-2"
          actions={<Button size="sm" variant="outline" onClick={() => nav('/app/income')}>View all</Button>}>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ left: -8, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#15803d" stopOpacity={0.28} /><stop offset="100%" stopColor="#15803d" stopOpacity={0.02} /></linearGradient>
                </defs>
                <CartesianGrid stroke="#eef2f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} width={56} domain={[0, (max: number) => Math.max(max, 800)]} allowDecimals={false} />
                <Tooltip cursor={{ stroke: '#94a3b8', strokeDasharray: 4 }} formatter={(v: number) => [inr(v), 'Income']} labelFormatter={(l) => l} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="amount" stroke="#15803d" strokeWidth={2} fill="url(#inc)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Next rank */}
        <Card title="Next rank" subtitle="Equal BV needed on both legs">
          {d.nextRank ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gold-50 text-gold-600"><Award className="h-6 w-6" /></div>
                <div>
                  <p className="text-lg font-extrabold text-slate-900">{d.nextRank.name}</p>
                  <p className="text-xs text-slate-500">{bv(d.nextRank.threshold)} BV each side{Number(d.nextRank.bonus) ? ` · bonus ${inr(d.nextRank.bonus)}` : ''}</p>
                </div>
              </div>
              <Progress label={`Left  ${bv(d.volume.leftBv)} / ${bv(d.nextRank.threshold)}`} value={d.nextRank.leftPct} />
              <Progress label={`Right ${bv(d.volume.rightBv)} / ${bv(d.nextRank.threshold)}`} value={d.nextRank.rightPct} tone="plum" />
              {d.nextRank.reward && <p className="rounded-xl bg-gold-50 px-3 py-2 text-xs font-semibold text-gold-700">🎁 Reward: {d.nextRank.reward}</p>}
              <Button variant="secondary" className="w-full" onClick={() => nav('/app/ranks')}>See all ranks</Button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">You have reached the highest rank. 🎉</p>
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Unmatched volume (carry forward)" subtitle="Matched 1 : 1 at the next closing">
          <div className="grid grid-cols-2 gap-3 text-center">
            {[['Left', d.volume.carry.lf, d.volume.carry.lb], ['Right', d.volume.carry.rf, d.volume.carry.rb]].map(([s, f, b]) => (
              <div key={s as string} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">{s} leg</p>
                <p className="mt-1 text-3xl font-extrabold text-slate-900">{(f as number) + (b as number)}</p>
                <p className="text-[11px] text-slate-500">{f} × 100 BV · {b} × 40 BV</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Pair rate: ₹{d.pairRates.FULL_FULL} when you and both matched IDs are 100 BV, otherwise ₹{d.pairRates.DEFAULT}.</p>
        </Card>

        <Card title="Recent wallet activity" className="xl:col-span-2" noPad actions={<Button size="sm" variant="outline" onClick={() => nav('/app/wallet')}>Wallet</Button>}>
          <ul className="divide-y divide-slate-100">
            {d.recentTxns.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`grid h-9 w-9 place-items-center rounded-xl ${t.type === 'CREDIT' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                  {t.type === 'CREDIT' ? <IndianRupee className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{t.incomeType ? titleCase(t.incomeType) : titleCase(t.refType)}</p>
                  <p className="truncate text-xs text-slate-500">{t.note ?? '—'} · {date(t.createdAt)}</p>
                </div>
                <p className={`text-sm font-bold tabular-nums ${t.type === 'CREDIT' ? 'text-brand-700' : 'text-slate-700'}`}>{t.type === 'CREDIT' ? '+' : '−'}{inr(t.amount)}</p>
              </li>
            ))}
            {!d.recentTxns.length && <li className="px-5 py-8 text-center text-sm text-slate-500">No wallet activity yet.</li>}
          </ul>
        </Card>
      </div>

      {/* Referral */}
      <Card title="Invite & grow your team" subtitle="Share your registration link — new members are placed under you">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <code className="flex-1 truncate rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">{refLink}</code>
          <div className="flex gap-2">
            <Button variant="outline" icon={<Copy className="h-4 w-4" />} onClick={() => { navigator.clipboard?.writeText(refLink); toast.success('Link copied'); }}>Copy</Button>
            <a className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-95"
              href={`https://wa.me/?text=${encodeURIComponent(`Join Navarth Wellness with my ID ${d.member.code}: ${refLink}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-gold-600" /> Activated {date(d.member.activatedAt)}</span>
          <span className="flex items-center gap-1.5"><BadgeCheck className="h-3.5 w-3.5 text-brand-600" /> Sponsor: {d.member.sponsor ? `${d.member.sponsor.name} (${d.member.sponsor.code})` : 'Company'}</span>
          <Badge status={d.member.status} />
        </div>
      </Card>
    </div>
  );
}

function fillDays(rows: { date: string; amount: number }[], n: number) {
  const map = new Map(rows.map((r) => [r.date, r.amount]));
  const out: { label: string; amount: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() + 330 * 60_000 - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    out.push({ label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' }), amount: map.get(key) ?? 0 });
  }
  return out;
}
