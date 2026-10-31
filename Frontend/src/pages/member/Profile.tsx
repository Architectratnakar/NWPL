import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IdCard, Save } from 'lucide-react';
import { get, post, put } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Card, Field, Input, KeyValue, PageHeader, PageLoader, Select, Tabs } from '@/components/ui';
import { date, tierLabel } from '@/lib/format';
import { useAction } from '@/lib/hooks';

export default function Profile() {
  const { data: p } = useQuery({ queryKey: ['profile'], queryFn: () => get('/me/profile') });
  const [tab, setTab] = useState<'profile' | 'bank' | 'nominee' | 'password'>('profile');
  const { busy, run } = useAction();
  const { refreshUser } = useAuth();
  const [f, setF] = useState<any>({});
  const [bank, setBank] = useState({ holderName: '', accountNumber: '', ifsc: '', bankName: '' });
  const [nom, setNom] = useState({ name: '', relation: '', dob: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  useEffect(() => {
    if (!p) return;
    setF({ fullName: p.fullName, email: p.email ?? '', gender: p.gender ?? '', dob: p.dob?.slice(0, 10) ?? '', line1: p.address?.line1 ?? '', city: p.address?.city ?? '', state: p.address?.state ?? '', pincode: p.address?.pincode ?? '' });
    setNom({ name: p.nominee?.name ?? '', relation: p.nominee?.relation ?? '', dob: p.nominee?.dob?.slice(0, 10) ?? '' });
    setBank((b) => ({ ...b, holderName: p.bank?.holderName ?? p.fullName, ifsc: p.bank?.ifsc ?? '', bankName: p.bank?.bankName ?? '' }));
  }, [p]);
  if (!p) return <PageLoader />;
  const u = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <div>
      <PageHeader icon={<IdCard className="h-5 w-5" />} title="My profile" subtitle={`${p.code} · joined ${date(p.joinedAt)}`} actions={<><Badge status={p.status} /><Badge status={p.tier}>{tierLabel(p.tier)}</Badge></>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'profile', label: 'Personal details' }, { value: 'bank', label: 'Bank account' }, { value: 'nominee', label: 'Nominee' }, { value: 'password', label: 'Password' }]} />
          {tab === 'profile' && (
            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name"><Input value={f.fullName ?? ''} onChange={u('fullName')} /></Field>
                <Field label="Mobile" hint="Contact support to change"><Input value={p.mobile} disabled /></Field>
                <Field label="Email"><Input type="email" value={f.email ?? ''} onChange={u('email')} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Gender"><Select value={f.gender ?? ''} onChange={u('gender')} placeholder="—" options={[{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }, { value: 'OTHER', label: 'Other' }]} /></Field>
                  <Field label="Date of birth"><Input type="date" value={f.dob ?? ''} onChange={u('dob')} /></Field>
                </div>
                <Field label="Address" className="sm:col-span-2"><Input value={f.line1 ?? ''} onChange={u('line1')} /></Field>
                <Field label="City"><Input value={f.city ?? ''} onChange={u('city')} /></Field>
                <div className="grid grid-cols-2 gap-3"><Field label="State"><Input value={f.state ?? ''} onChange={u('state')} /></Field><Field label="PIN"><Input value={f.pincode ?? ''} onChange={u('pincode')} /></Field></div>
              </div>
              <Button className="mt-5" icon={<Save className="h-4 w-4" />} loading={busy === 'p'} onClick={() => run('p', async () => {
                await put('/me/profile', { fullName: f.fullName, email: f.email, gender: f.gender || null, dob: f.dob || null, address: { line1: f.line1, city: f.city, state: f.state, pincode: f.pincode } });
                await refreshUser();
              }, { success: 'Profile saved', invalidate: ['profile'] })}>Save changes</Button>
            </Card>
          )}
          {tab === 'bank' && (
            <Card>
              {p.bank && <div className="mb-5 rounded-xl bg-slate-50 p-4"><KeyValue cols={3} items={[['Current account', p.bank.account], ['IFSC', p.bank.ifsc], ['Status', <Badge key="v" status={p.bank.verified ? 'APPROVED' : 'PENDING'}>{p.bank.verified ? 'Verified' : 'Pending verification'}</Badge>]]} /></div>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Account holder name"><Input value={bank.holderName} onChange={(e) => setBank({ ...bank, holderName: e.target.value })} /></Field>
                <Field label="Account number"><Input inputMode="numeric" value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value.replace(/\D/g, '') })} /></Field>
                <Field label="IFSC"><Input value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase() })} placeholder="SBIN0001234" /></Field>
                <Field label="Bank name"><Input value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} /></Field>
              </div>
              <p className="mt-3 text-xs text-slate-500">The account number is encrypted. Changing it needs re-verification before the next payout.</p>
              <Button className="mt-4" loading={busy === 'b'} onClick={() => run('b', () => put('/me/bank', bank), { success: 'Bank account saved', invalidate: ['profile', 'wallet'] })}>Save bank account</Button>
            </Card>
          )}
          {tab === 'nominee' && (
            <Card>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Nominee name"><Input value={nom.name} onChange={(e) => setNom({ ...nom, name: e.target.value })} /></Field>
                <Field label="Relation"><Input value={nom.relation} onChange={(e) => setNom({ ...nom, relation: e.target.value })} /></Field>
                <Field label="Date of birth"><Input type="date" value={nom.dob} onChange={(e) => setNom({ ...nom, dob: e.target.value })} /></Field>
              </div>
              <Button className="mt-5" loading={busy === 'n'} onClick={() => run('n', () => put('/me/nominee', { ...nom, dob: nom.dob || null }), { success: 'Nominee saved', invalidate: ['profile'] })}>Save nominee</Button>
            </Card>
          )}
          {tab === 'password' && (
            <Card>
              <div className="grid max-w-md gap-4">
                <Field label="Current password"><Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
                <Field label="New password" hint="8+ characters with a capital letter and a number"><Input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
                <Field label="Confirm new password" error={pw.confirm && pw.confirm !== pw.newPassword ? 'Passwords do not match' : null}><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
              </div>
              <Button className="mt-5" disabled={!pw.newPassword || pw.confirm !== pw.newPassword} loading={busy === 'pw'} onClick={() => run('pw', () => post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword }), { success: 'Password changed' }).then((r) => r && setPw({ currentPassword: '', newPassword: '', confirm: '' }))}>Change password</Button>
            </Card>
          )}
        </div>
        <Card title="Account summary">
          <KeyValue cols={1} items={[
            ['Distributor ID', p.code], ['Sponsor', p.sponsor ? `${p.sponsor.fullName} (${p.sponsor.distributorCode})` : 'Company'],
            ['Placement', p.parentCode ? `${p.side === 'LEFT' ? 'Left' : 'Right'} of ${p.parentCode}` : 'Top of tree'], ['KYC', <Badge key="k" status={p.kycStatus} />],
            ['Agreement', p.agreementVersion ? `${p.agreementVersion} · accepted ${date(p.agreementAcceptedAt)}` : '—'],
            ['Special bonus eligibility', p.specialBonusVerified ? 'Verified' : 'Not verified'],
          ]} />
        </Card>
      </div>
    </div>
  );
}
