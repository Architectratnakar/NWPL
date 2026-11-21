import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Eye, GitFork, IndianRupee, KeyRound, Pencil, Search, ShieldAlert, Trash2, Users, WalletCards } from 'lucide-react';
import { del, get, openAuthed, patch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Avatar, Badge, Button, Card, DataTable, Field, Input, KeyValue, Modal, PageHeader, PageLoader, Pagination, Select, StatCard, Textarea } from '@/components/ui';
import { bv, date, dateTime, inr, titleCase } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import ResetPasswordModal, { type ResetTarget } from '@/components/ResetPasswordModal';
import { AdjustmentTable, AdjustWalletModal, fetchAdjustments } from '@/components/WalletAdjust';

export function MembersList() {
  const nav = useNavigate();
  const { hasRole } = useAuth();
  const [resetFor, setResetFor] = useState<ResetTarget | null>(null);
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
          ...(hasRole('ADMIN_SUPER', 'ADMIN_OPS') ? [{ key: 'actions', header: '', align: 'right' as const, render: (r: any) => (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" title="Edit / status" icon={<Pencil className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); nav(`/admin/members/${r.id}?edit=1`); }} aria-label="Edit distributor" />
              {hasRole('ADMIN_SUPER') && <Button size="sm" variant="ghost" title="Delete" icon={<Trash2 className="h-4 w-4 text-red-600" />} onClick={(e) => { e.stopPropagation(); nav(`/admin/members/${r.id}?delete=1`); }} aria-label="Delete distributor" />}
              {hasRole('ADMIN_SUPER') && <Button size="sm" variant="ghost" title="Income" icon={<IndianRupee className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); nav(`/admin/income?member=${r.id}`); }} aria-label="View income" />}
              {hasRole('ADMIN_SUPER') && <Button size="sm" variant="ghost" title="Reset password" icon={<KeyRound className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); setResetFor({ id: r.id, code: r.distributorCode, name: r.fullName }); }} aria-label="Reset password" />}
            </div>) }] : []),
        ]} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      <ResetPasswordModal target={resetFor} onClose={() => setResetFor(null)} />
    </div>
  );
}

export function MemberDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { hasRole } = useAuth();
  const [sp, setSp] = useSearchParams();
  const { data: m, error } = useQuery({ queryKey: ['admin-member', id], queryFn: () => get(`/admin/members/${id}`) });
  const [edit, setEdit] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const { busy, run } = useAction();
  const isSuper = hasRole('ADMIN_SUPER');
  const canEdit = hasRole('ADMIN_SUPER', 'ADMIN_OPS');
  const isFinance = hasRole('ADMIN_SUPER', 'ADMIN_FINANCE');
  const { data: adj } = useQuery({ queryKey: ['wallet-adjustments', 'member', id], queryFn: () => fetchAdjustments({ memberId: id, pageSize: 10 }), enabled: isFinance });

  const openEdit = () => {
    if (!m) return;
    const a = m.address ?? {};
    setForm({
      fullName: m.fullName, mobile: m.user.mobile, email: m.user.email ?? '', gender: m.gender ?? '', dob: m.dob ? String(m.dob).slice(0, 10) : '',
      address: { line1: a.line1 ?? '', city: a.city ?? '', state: a.state ?? '', pincode: a.pincode ?? '' },
      status: m.status, specialBonusVerified: !!m.specialBonusVerified, walletOnHold: m.wallet?.onHold ?? false, reason: '',
      bank: { holderName: m.bank?.holderName ?? '', accountNumber: '', ifsc: m.bank?.ifsc ?? '', bankName: m.bank?.bankName ?? '', verified: m.bank ? !!m.bank.verified : true },
      nominee: { name: m.nominee?.name ?? '', relation: m.nominee?.relation ?? '', dob: m.nominee?.dob ? String(m.nominee.dob).slice(0, 10) : '' },
    });
    setEdit(true);
  };
  // opened from the list page with ?edit=1 or ?delete=1
  useEffect(() => {
    if (!m) return;
    if (sp.get('edit') && canEdit) openEdit();
    if (sp.get('delete') && isSuper) setDelOpen(true);
    if (sp.get('edit') || sp.get('delete')) setSp({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m]);

  const save = () => {
    // only send what actually changed, so a small edit can never be rejected because of an untouched field
    const body: any = { reason: form.reason?.trim() || undefined };
    const a = m.address ?? {};
    if (form.fullName.trim() !== m.fullName) body.fullName = form.fullName.trim();
    if (isSuper && form.mobile.trim() !== m.user.mobile) body.mobile = form.mobile.trim();
    if (isSuper && form.email.trim() !== (m.user.email ?? '')) body.email = form.email.trim();
    if (form.gender !== (m.gender ?? '')) body.gender = form.gender || null;
    if (form.dob !== (m.dob ? String(m.dob).slice(0, 10) : '')) body.dob = form.dob || null;
    if (['line1', 'city', 'state', 'pincode'].some((k) => (form.address[k] ?? '') !== (a[k] ?? ''))) body.address = form.address;
    if (form.status !== m.status) body.status = form.status;
    if (form.specialBonusVerified !== !!m.specialBonusVerified) body.specialBonusVerified = form.specialBonusVerified;
    if (form.walletOnHold !== (m.wallet?.onHold ?? false)) body.walletOnHold = form.walletOnHold;
    if (isSuper) {
      const b = form.bank, ob = m.bank;
      const bankChanged = b.accountNumber.trim() !== '' || b.holderName.trim() !== (ob?.holderName ?? '') || b.ifsc.trim().toUpperCase() !== (ob?.ifsc ?? '') || b.bankName.trim() !== (ob?.bankName ?? '') || (!!ob && b.verified !== !!ob.verified);
      if (bankChanged) body.bank = { holderName: b.holderName.trim(), accountNumber: b.accountNumber.trim(), ifsc: b.ifsc.trim().toUpperCase(), bankName: b.bankName.trim() || null, verified: b.verified };
      const n = form.nominee, on = m.nominee;
      const nEmpty = !n.name.trim() && !n.relation.trim() && !n.dob;
      if (nEmpty && on) body.nominee = null;
      else if (!nEmpty && (n.name.trim() !== (on?.name ?? '') || n.relation.trim() !== (on?.relation ?? '') || n.dob !== (on?.dob ? String(on.dob).slice(0, 10) : ''))) body.nominee = { name: n.name.trim(), relation: n.relation.trim(), dob: n.dob || null };
    }
    if (Object.keys(body).filter((k) => k !== 'reason').length === 0) { setEdit(false); return; }
    run('e', () => patch(`/admin/members/${id}`, body), { success: 'Distributor saved', invalidate: ['admin-member', 'admin-members'] }).then((r) => r && setEdit(false));
  };
  const setBank = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, bank: { ...form.bank, [k]: k === 'accountNumber' ? e.target.value.replace(/\D/g, '') : k === 'ifsc' ? e.target.value.toUpperCase() : e.target.value } });
  const setNom = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, nominee: { ...form.nominee, [k]: e.target.value } });
  const setAddr = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, address: { ...form.address, [k]: e.target.value } });

  if (error) return <Card><p className="text-sm text-slate-600">This distributor was not found. It may have been deleted.</p><Button className="mt-4" variant="outline" onClick={() => nav('/admin/members')}>All distributors</Button></Card>;
  if (!m) return <PageLoader />;

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
          {canEdit && <Button variant="outline" icon={<ShieldAlert className="h-4 w-4" />} onClick={openEdit}>{isSuper ? 'Edit full profile' : 'Edit / status'}</Button>}
          {isFinance && <Button variant="outline" icon={<WalletCards className="h-4 w-4" />} onClick={() => setAdjOpen(true)}>Adjust wallet</Button>}
          {hasRole('ADMIN_SUPER') && <Button variant="outline" icon={<IndianRupee className="h-4 w-4" />} onClick={() => nav(`/admin/income?member=${m.id}`)}>Income</Button>}
          {isSuper && <Button variant="outline" icon={<KeyRound className="h-4 w-4" />} onClick={() => setPwOpen(true)}>Reset password</Button>}
          {isSuper && <Button variant="outline" className="!border-red-200 !text-red-600 hover:!bg-red-50" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDelOpen(true)}>Delete</Button>}
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Left BV / IDs" value={bv(m.volume?.totalLeftBv)} sub={`${m.volume?.totalLeftCount} IDs · carry ${m.volume?.carryLeftFull + m.volume?.carryLeftBasic}`} />
        <StatCard label="Right BV / IDs" value={bv(m.volume?.totalRightBv)} sub={`${m.volume?.totalRightCount} IDs · carry ${m.volume?.carryRightFull + m.volume?.carryRightBasic}`} tone="plum" />
        <StatCard label="Wallet" value={inr(m.wallet?.balance, 2)} tone="gold" sub={adj?.counts?.PENDING ? `${adj.counts.PENDING} adjustment(s) waiting for approval` : undefined} />
        <StatCard label="Direct sponsors" value={m.directs} tone="blue" />
      </div>
      {isFinance && (adj?.items?.length ?? 0) > 0 && (
        <Card title="Wallet adjustments" noPad className="mb-6" actions={<Button size="sm" variant="ghost" onClick={() => nav("/admin/wallet-adjustments")}>All adjustments</Button>}>
          <AdjustmentTable rows={adj.items} canApproveOwn={!!adj.canApproveOwn} showMember={false} />
        </Card>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Profile">
          <KeyValue items={[
            ['Sponsor', m.sponsor ? `${m.sponsor.fullName} (${m.sponsor.distributorCode})` : 'Company'], ['Placement', m.parent ? `${m.side} of ${m.parent.distributorCode}` : 'Root'],
            ['Joined', dateTime(m.createdAt)], ['Activated', dateTime(m.activatedAt)], ['Last login', dateTime(m.user.lastLoginAt)], ['Gender / DOB', `${m.gender ?? '—'} · ${date(m.dob)}`],
            ['Address', m.address ? [m.address.line1, m.address.city, m.address.state, m.address.pincode].filter(Boolean).join(', ') : '—'], ['Special bonus', m.specialBonusVerified ? 'Verified (women / divyang)' : 'Not verified'],
            ['Bank', m.bank ? `${m.bank.holderName} · ${m.bank.accountNumber} · ${m.bank.ifsc}${m.bank.bankName ? ` · ${m.bank.bankName}` : ''}${m.bank.verified ? ' ✓ verified' : ' (not verified)'}` : 'Not added'], ['Nominee', m.nominee ? `${m.nominee.name} (${m.nominee.relation})${m.nominee.dob ? ` · ${date(m.nominee.dob)}` : ''}` : '—'],
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

      <Modal open={edit} onClose={() => setEdit(false)} title={`Edit ${m.distributorCode} — ${m.fullName}`} size="xl"
        footer={<><Button variant="ghost" onClick={() => setEdit(false)}>Cancel</Button><Button loading={busy === 'e'} disabled={!form.fullName?.trim()} onClick={save}>Save changes</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 sm:col-span-2">Personal details & status</h4>
          <Field label="Full name *"><Input value={form.fullName ?? ''} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="Status" hint="Blocked / Terminated also disables the login"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={['REGISTERED', 'ACTIVE', 'BLOCKED', 'TERMINATED'].map((s) => ({ value: s, label: titleCase(s) }))} /></Field>
          <Field label="Mobile (login ID)" hint={isSuper ? undefined : 'Only the Super Admin can change this'}><Input inputMode="numeric" maxLength={10} disabled={!isSuper} value={form.mobile ?? ''} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Email" hint={isSuper ? 'Leave empty to remove' : 'Only the Super Admin can change this'}><Input type="email" disabled={!isSuper} value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Gender"><Select value={form.gender ?? ''} onChange={(e) => setForm({ ...form, gender: e.target.value })} placeholder="—" options={[{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }, { value: 'OTHER', label: 'Other' }]} /></Field>
          <Field label="Date of birth"><Input type="date" value={form.dob ?? ''} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Address"><Input placeholder="House / street" value={form.address?.line1 ?? ''} onChange={setAddr('line1')} /></Field></div>
          <Field label="City"><Input value={form.address?.city ?? ''} onChange={setAddr('city')} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="State"><Input value={form.address?.state ?? ''} onChange={setAddr('state')} /></Field><Field label="PIN code"><Input inputMode="numeric" maxLength={6} value={form.address?.pincode ?? ''} onChange={setAddr('pincode')} /></Field></div>
          <div className="space-y-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!form.walletOnHold} onChange={(e) => setForm({ ...form, walletOnHold: e.target.checked })} /> Put wallet on hold (blocks withdrawals)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!form.specialBonusVerified} onChange={(e) => setForm({ ...form, specialBonusVerified: e.target.checked })} /> Verified for women / divyang special bonus</label>
          </div>
          {isSuper && <>
            <h4 className="mt-2 border-t border-slate-100 pt-4 text-xs font-bold uppercase tracking-wide text-slate-500 sm:col-span-2">Bank account (for payouts)</h4>
            <Field label="Account holder name"><Input value={form.bank?.holderName ?? ''} onChange={setBank('holderName')} /></Field>
            <Field label="Account number" hint={m.bank ? `Current: ${m.bank.accountNumber}. Leave empty to keep it` : undefined}><Input inputMode="numeric" maxLength={18} placeholder={m.bank ? 'Unchanged' : '9–18 digits'} value={form.bank?.accountNumber ?? ''} onChange={setBank('accountNumber')} /></Field>
            <Field label="IFSC"><Input maxLength={11} placeholder="SBIN0001234" value={form.bank?.ifsc ?? ''} onChange={setBank('ifsc')} /></Field>
            <Field label="Bank name"><Input value={form.bank?.bankName ?? ''} onChange={setBank('bankName')} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!form.bank?.verified} onChange={(e) => setForm({ ...form, bank: { ...form.bank, verified: e.target.checked } })} /> Bank account verified</label>

            <h4 className="mt-2 border-t border-slate-100 pt-4 text-xs font-bold uppercase tracking-wide text-slate-500 sm:col-span-2">Nominee</h4>
            <Field label="Nominee name" hint="Clear all nominee fields to remove the nominee"><Input value={form.nominee?.name ?? ''} onChange={setNom('name')} /></Field>
            <Field label="Relation"><Select value={form.nominee?.relation ?? ''} onChange={setNom('relation')} placeholder="—" options={[...new Set(['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Other', ...(form.nominee?.relation ? [form.nominee.relation] : [])])].map((r) => ({ value: r, label: r }))} /></Field>
            <Field label="Nominee date of birth"><Input type="date" value={form.nominee?.dob ?? ''} onChange={setNom('dob')} /></Field>
            <div />
          </>}
          <p className="text-xs text-slate-500 sm:col-span-2">Sponsor and tree placement can’t be changed (the database locks them to protect everyone’s BV). Package, rank and KYC are updated by orders, the plan engine and the KYC queue.</p>
          <div className="sm:col-span-2"><Field label="Reason / note (optional, saved in the audit log)"><Textarea value={form.reason ?? ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field></div>
        </div>
      </Modal>
      {isFinance && <AdjustWalletModal open={adjOpen} onClose={() => setAdjOpen(false)} member={m} />}
      {isSuper && <DeleteMemberModal open={delOpen} member={m} onClose={() => setDelOpen(false)}
        onTerminate={() => { setDelOpen(false); openEdit(); setForm((f: any) => ({ ...f, status: 'TERMINATED' })); }}
        onDeleted={() => nav('/admin/members', { replace: true })} />}
      <ResetPasswordModal target={pwOpen ? { id: m.id, code: m.distributorCode, name: m.fullName } : null} onClose={() => setPwOpen(false)} />
    </div>
  );
}

/** Super Admin delete: first asks the server what (if anything) blocks the delete, then needs the ID typed to confirm. */
function DeleteMemberModal({ open, member, onClose, onTerminate, onDeleted }: { open: boolean; member: any; onClose: () => void; onTerminate: () => void; onDeleted: () => void }) {
  const { data: check, isFetching } = useQuery({ queryKey: ['admin-member-delete-check', member.id], queryFn: () => get(`/admin/members/${member.id}/delete-check`), enabled: open, staleTime: 0, gcTime: 0 });
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  useEffect(() => { if (open) { setTyped(''); setReason(''); } }, [open]);
  const doDelete = () =>
    run('d', () => del(`/admin/members/${member.id}?confirm=${encodeURIComponent(typed.trim())}${reason.trim() ? `&reason=${encodeURIComponent(reason.trim())}` : ''}`),
      { success: `${member.distributorCode} deleted`, invalidate: ['admin-members'] }).then((r) => r && onDeleted());
  return (
    <Modal open={open} onClose={onClose} title={`Delete ${member.distributorCode}?`}
      footer={check?.canDelete
        ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy === 'd'} disabled={typed.trim().toUpperCase() !== member.distributorCode} icon={<Trash2 className="h-4 w-4" />} onClick={doDelete}>Delete permanently</Button></>
        : <><Button variant="ghost" onClick={onClose}>Close</Button>{check && member.status !== 'TERMINATED' && <Button variant="danger" onClick={onTerminate}>Terminate instead</Button>}</>}>
      {isFetching || !check ? <p className="text-sm text-slate-500">Checking this distributor…</p> : check.canDelete ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p><b>{member.fullName}</b> and their login, wallet, bank, nominee, KYC and support tickets will be removed permanently. This cannot be undone. The audit log keeps a record of the delete.</p></div>
          <Field label="Reason (optional)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label={`Type ${member.distributorCode} to confirm`}><Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={member.distributorCode} /></Field>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-slate-700">
          <p>This distributor can’t be deleted, because deleting would break the tree, income or accounts of other members:</p>
          <ul className="list-disc space-y-1 pl-5">{check.blockers.map((b: string) => <li key={b}>{b}</li>)}</ul>
          <p>Use <b>Terminate</b> instead: the login is disabled and the ID stops earning, but the history stays correct.</p>
        </div>
      )}
    </Modal>
  );
}
