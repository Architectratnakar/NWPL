import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Pencil, UserCog, UserPlus } from 'lucide-react';
import { get, patch, post } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Avatar, Badge, Button, Card, DataTable, Field, Input, Modal, PageHeader, Select } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { useAction } from '@/lib/hooks';

const ROLES = [
  { value: 'ADMIN_SUPER', label: 'Super Admin — everything' }, { value: 'ADMIN_OPS', label: 'Operations — members, KYC, orders' },
  { value: 'ADMIN_FINANCE', label: 'Finance — closings, payouts' }, { value: 'COMPLIANCE', label: 'Compliance — KYC, audit, reports' }, { value: 'SUPPORT', label: 'Support — tickets' },
];
const roleName = (r: string) => ROLES.find((x) => x.value === r)?.label.split(' — ')[0] ?? r;

export default function StaffUsers() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['staff'], queryFn: () => get('/admin/users', { pageSize: 100 }) });
  const [form, setForm] = useState<any | null>(null);
  const [pwFor, setPwFor] = useState<any | null>(null);
  const [pw, setPw] = useState('');
  const { busy, run } = useAction();
  const save = () => run('s', () => (form.id ? patch(`/admin/users/${form.id}`, { email: form.email, mobile: form.mobile, role: form.role, isActive: form.isActive }) : post('/admin/users', form)),
    { success: form.id ? 'User updated' : 'User created', invalidate: ['staff'] }).then((r) => r && setForm(null));
  return (
    <div>
      <PageHeader icon={<UserCog className="h-5 w-5" />} title="Staff users" subtitle="Who can log in to the admin panel, and what they can do"
        actions={<Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setForm({ email: '', mobile: '', role: 'SUPPORT', password: '' })}>Add user</Button>} />
      <Card noPad>
        <DataTable loading={isLoading} rows={data?.items} columns={[
          { key: 'email', header: 'User', render: (r: any) => <div className="flex items-center gap-3"><Avatar name={r.email} size={32} /><div><p className="font-semibold">{r.email}</p><p className="text-xs text-slate-500">{r.mobile}</p></div></div> },
          { key: 'role', header: 'Role', render: (r: any) => <Badge>{roleName(r.role)}</Badge> },
          { key: 'isActive', header: 'Status', render: (r: any) => <Badge status={r.isActive ? 'ACTIVE' : 'BLOCKED'}>{r.isActive ? 'Active' : 'Disabled'}</Badge> },
          { key: 'lastLoginAt', header: 'Last login', render: (r: any) => dateTime(r.lastLoginAt) },
          { key: 'a', header: '', align: 'right', render: (r: any) => <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setForm({ ...r })}>Edit</Button>
            <Button size="sm" variant="ghost" icon={<KeyRound className="h-4 w-4" />} onClick={() => setPwFor(r)}>Password</Button>
          </div> },
        ]} />
      </Card>
      <div className="mt-6 grid gap-3 md:grid-cols-5">
        {ROLES.map((r) => <div key={r.value} className="card p-4"><p className="text-sm font-bold">{r.label.split(' — ')[0]}</p><p className="mt-1 text-xs text-slate-500">{r.label.split(' — ')[1]}</p></div>)}
      </div>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit staff user' : 'Add staff user'}
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button loading={busy === 's'} onClick={save}>Save</Button></>}>
        {form && (
          <div className="space-y-4">
            <Field label="Email (login)"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Mobile"><Input value={form.mobile} maxLength={10} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
            <Field label="Role"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={ROLES} disabled={form.id === user?.id} /></Field>
            {!form.id && <Field label="Temporary password" hint="At least 8 characters"><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>}
            {form.id && form.id !== user?.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Login enabled</label>}
          </div>
        )}
      </Modal>
      <Modal open={!!pwFor} onClose={() => setPwFor(null)} title={`New password for ${pwFor?.email}`} size="sm"
        footer={<Button loading={busy === 'p'} disabled={pw.length < 8} onClick={() => run('p', () => post(`/admin/users/${pwFor.id}/reset-password`, { password: pw }), { success: 'Password reset' }).then((r) => { if (r) { setPwFor(null); setPw(''); } })}>Reset</Button>}>
        <Field label="New password"><Input value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
