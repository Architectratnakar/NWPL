import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, GitFork, KeyRound, Search, ShieldAlert, Users } from 'lucide-react';
import { get, openAuthed, patch, post } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Avatar, Badge, Button, Card, DataTable, Field, Input, KeyValue, Modal, PageHeader, PageLoader, Pagination, Select, StatCard, Textarea } from '@/components/ui';
import { bv, date, dateTime, inr, titleCase } from '@/lib/format';
import { useAction } from '@/lib/hooks';

export function MembersList() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ status: '', tier: '', kyc: '' });
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['admin-members', q, filters, page], queryFn: () => get('/admin/members', { q: q || undefined, status: filters.status || undefined, tier: filters.tier || undefined, kyc: filters.kyc || undefined, page }) });
  const setF = (k: string) => (e: { target: { value: string } }) => { setFilters({ ...filters, [k]: e.target.value }); setPage(1); };
  return (
    <div>
      <PageHeader icon={<Users className="h-5 w-5" />} title="Distributors" subtitle={`${data?.total ?? '…'} registered distributors`} />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-[1fr_160px_160px_180px]">
          <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-10" placeholder="Search ID, name or mobile" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <Select value={filters.status} onChange={setF('status')} placeholder="All statuses" options={['REGISTERED', 'ACTIVE', 'BLOCKED', 'TERMINATED'].map((s) => ({ value: s, label: titleCase(s) }))} />
          <Select value={filters.tier} onChange={setF('tier')} placeholder="All packages" options={[{ value: 'FULL', label: '100 BV' }, { value: 'BASIC', label: '40 BV' }, { value: 'NONE', label: 'Not activated' }]} />
          <Select value={filters.kyc} onChange={setF('kyc')} placeholder="Any KYC" options={['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => ({ value: s, label: `KYC ${titleCase(s)}` }))} />
        </div>
      </Card>
      <Card noPad>
        <DataTable loading={isLoading} rows={data?.items} onRowClick={(r: any) => nav(`/admin/members/${r.id}`)} columns={[
          { key: 'name', header: 'Distributor', render: (r: any) => <div className="flex items-center gap-3"><Avatar name={r.fullName} size={32} /><div><p className="font-semibold text-slate-900">{r.fullName}</p><p className="text-xs text-brand-700">{r.distributorCode} · {r.user.mobile}</p></div></div> },
          { key: 'sponsor', header: 'Sponsor', render: (r: any) => r.sponsor?.distributorCode ?? '—' },
          { key: 'tier', header: 'Package', render: (r: any) => <Badge status={r.packageTier} /> },
          { key: 'bv', header: 'L / R BV', align: 'right', render: (r: any) => `${bv(r.volume?.totalLeftBv)} / ${bv(r.volume?.totalRightBv)}` },
          { key: 'rank', header: 'Rank', render: (r: any) => r.currentRank?.name ?? '—' },
          { key: 'wallet', header: 'Wallet', align: 'right', render: (r: any) => <span className={r.wallet?.onHold ? 'text-red-600' : ''}>{inr(r.wallet?.balance)}{r.wallet?.onHold ? ' (hold)' : ''}</span> },
          { key: 'kyc', header: 'KYC', render: (r: any) => <Badge status={r.kycStatus} /> },
          { key: 'status', header: 'Status', render: (r: any) => <Badge status={r.status} /> },
          { key: 'createdAt', header: 'Joined', render: (r: any) => date(r.createdAt) },
        ]} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}

export function MemberDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { hasRole } = useAuth();
  const { data: m } = useQuery({ queryKey: ['admin-member', id], queryFn: () => get(`/admin/members/${id}`) });
  const [edit, setEdit] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const [pw, setPw] = useState('');
  const { busy, run } = useAction();
  if (!m) return <PageLoader />;
  const canEdit = hasRole('ADMIN_SUPER', 'ADMIN_OPS');
  const openEdit = () => { setForm({ fullName: m.fullName, status: m.status, specialBonusVerified: m.specialBonusVerified, walletOnHold: m.wallet?.onHold ?? false, reason: '' }); setEdit(true); };

  return (
    <div>
      <button onClick={() => nav('/admin/members')} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> All distributors</button>
      <div className="card mb-6 flex flex-col gap-4 p-6 md:flex-row md:items-center">
        <Avatar name={m.fullName} size={64} />
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-slate-900">{m.fullName}</h1>
          <p className="text-sm text-slate-500">{m.distributorCode} · {m.user.mobile}{m.user.email ? ` · ${m.user.email}` : ''}</p>
          <div className="mt-2 flex flex-wrap gap-1.5"><Badge status={m.status} /><Badge status={m.packageTier} /><Badge status={m.kycStatus}>KYC {titleCase(m.kycStatus)}</Badge>{m.currentRank && <Badge>{m.currentRank.name}</Badge>}{m.wallet?.onHold && <Badge status="BLOCKED">Wallet on hold</Badge>}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<GitFork className="h-4 w-4" />} onClick={() => nav(`/admin/genealogy?code=${m.distributorCode}`)}>Tree</Button>
          {canEdit && <Button variant="outline" icon={<ShieldAlert className="h-4 w-4" />} onClick={openEdit}>Edit / status</Button>}
          {hasRole('ADMIN_SUPER') && <Button variant="outline" icon={<KeyRound className="h-4 w-4" />} onClick={() => setPwOpen(true)}>Reset password</Button>}
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Left BV / IDs" value={bv(m.volume?.totalLeftBv)} sub={`${m.volume?.totalLeftCount} IDs · carry ${m.volume?.carryLeftFull + m.volume?.carryLeftBasic}`} />
        <StatCard label="Right BV / IDs" value={bv(m.volume?.totalRightBv)} sub={`${m.volume?.totalRightCount} IDs · carry ${m.volume?.carryRightFull + m.volume?.carryRightBasic}`} tone="plum" />
        <StatCard label="Wallet" value={inr(m.wallet?.balance, 2)} tone="gold" />
        <StatCard label="Direct sponsors" value={m.directs} tone="blue" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Profile">
          <KeyValue items={[
            ['Sponsor', m.sponsor ? `${m.sponsor.fullName} (${m.sponsor.distributorCode})` : 'Company'], ['Placement', m.parent ? `${m.side} of ${m.parent.distributorCode}` : 'Root'],
            ['Joined', dateTime(m.createdAt)], ['Activated', dateTime(m.activatedAt)], ['Last login', dateTime(m.user.lastLoginAt)], ['Gender / DOB', `${m.gender ?? '—'} · ${date(m.dob)}`],
            ['Address', m.address ? [m.address.line1, m.address.city, m.address.state, m.address.pincode].filter(Boolean).join(', ') : '—'], ['Special bonus', m.specialBonusVerified ? 'Verified (women / divyang)' : 'Not verified'],
            ['Bank', m.bank ? `${m.bank.accountNumber} · ${m.bank.ifsc}` : 'Not added'], ['Nominee', m.nominee ? `${m.nominee.name} (${m.nominee.relation})` : '—'],
          ]} />
        </Card>
        <Card title="KYC documents" noPad>
          <DataTable rows={m.kycDocs} empty="No documents" columns={[
            { key: 'type', header: 'Type', render: (r: any) => <b>{titleCase(r.type)}</b> },
            { key: 'number', header: 'Number', render: (r: any) => r.number ?? '—' },
            { key: 'status', header: 'Status', render: (r: any) => <Badge status={r.status} /> },
            { key: 'v', header: '', render: (r: any) => <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => openAuthed(`/kyc/file/${r.id}`)}>View</Button> },
          ]} />
        </Card>
        <Card title="Recent orders" noPad>
          <DataTable rows={m.orders} empty="No orders" columns={[
            { key: 'orderNo', header: 'Order', render: (r: any) => <b>{r.orderNo}</b> },
            { key: 'type', header: 'Type', render: (r: any) => <Badge>{r.type}</Badge> },
            { key: 'grandTotal', header: 'Amount', align: 'right', render: (r: any) => inr(r.grandTotal) },
            { key: 'status', header: 'Status', render: (r: any) => <Badge status={r.status} /> },
          ]} />
        </Card>
        <Card title="Ranks achieved" noPad>
          <DataTable rows={m.ranks} empty="No ranks yet" columns={[
            { key: 'rank', header: 'Rank', render: (r: any) => <b>{r.rank.name}</b> },
            { key: 'achievedAt', header: 'Achieved', render: (r: any) => date(r.achievedAt) },
            { key: 'rewardStatus', header: 'Reward', render: (r: any) => <Badge status={r.rewardStatus} /> },
          ]} />
        </Card>
      </div>

      <Modal open={edit} onClose={() => setEdit(false)} title="Edit distributor"
        footer={<><Button variant="ghost" onClick={() => setEdit(false)}>Cancel</Button><Button loading={busy === 'e'} disabled={form.reason?.length < 3} onClick={() => run('e', () => patch(`/admin/members/${id}`, form), { success: 'Saved', invalidate: ['admin-member', 'admin-members'] }).then((r) => r && setEdit(false))}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Full name"><Input value={form.fullName ?? ''} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="Status" hint="Blocking also disables the login"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={['REGISTERED', 'ACTIVE', 'BLOCKED', 'TERMINATED'].map((s) => ({ value: s, label: titleCase(s) }))} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!form.walletOnHold} onChange={(e) => setForm({ ...form, walletOnHold: e.target.checked })} /> Put wallet on hold (blocks withdrawals)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!form.specialBonusVerified} onChange={(e) => setForm({ ...form, specialBonusVerified: e.target.checked })} /> Verified for women / divyang special bonus</label>
          <Field label="Reason for change (saved in audit log) *"><Textarea value={form.reason ?? ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        </div>
      </Modal>
      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Set a new password" size="sm"
        footer={<Button loading={busy === 'pw'} disabled={pw.length < 8} onClick={() => run('pw', () => post(`/admin/users/${m.user.id}/reset-password`, { password: pw }), { success: 'Password reset' }).then((r) => { if (r) { setPwOpen(false); setPw(''); } })}>Reset password</Button>}>
        <Field label="New password" hint="Tell the distributor to change it after logging in"><Input value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
