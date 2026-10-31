import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Headphones, Plus } from 'lucide-react';
import { get, post } from '@/api/client';
import TicketThread from '@/components/TicketThread';
import { Badge, Button, Card, DataTable, Field, Input, Modal, PageHeader, Pagination, Select, Textarea } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { useAction } from '@/lib/hooks';

const CATS = ['ORDER', 'PAYMENT', 'INCOME', 'KYC', 'PRODUCT', 'ACCOUNT', 'OTHER'];
export default function Support() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['tickets', page], queryFn: () => get('/tickets', { page }) });
  const { data: company } = useQuery({ queryKey: ['company'], queryFn: () => get('/public/company') });
  const [open, setOpen] = useState<string | null>(null);
  const [nw, setNw] = useState(false);
  const [f, setF] = useState({ category: 'ORDER', subject: '', message: '' });
  const { busy, run } = useAction();
  return (
    <div>
      <PageHeader icon={<Headphones className="h-5 w-5" />} title="Help & support" subtitle="Raise a ticket — we reply within 48 hours" actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setNw(true)}>New ticket</Button>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card noPad>
          <DataTable loading={isLoading} rows={data?.items} onRowClick={(r: any) => setOpen(r.id)} empty="No tickets yet" columns={[
            { key: 'subject', header: 'Subject', render: (r: any) => <b className="text-slate-900">{r.subject}</b> },
            { key: 'category', header: 'Category', render: (r: any) => <Badge>{r.category}</Badge> },
            { key: 'status', header: 'Status', render: (r: any) => <Badge status={r.status} /> },
            { key: 'updatedAt', header: 'Last update', render: (r: any) => dateTime(r.updatedAt) },
          ]} />
          {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
        </Card>
        <Card title="Grievance officer" subtitle="As required by the Direct Selling Rules">
          <p className="text-sm font-semibold">{company?.grievanceOfficer.name}</p>
          <p className="text-sm text-slate-600">{company?.grievanceOfficer.email}</p>
          <p className="text-sm text-slate-600">{company?.grievanceOfficer.phone}</p>
          <p className="mt-3 text-xs text-slate-500">Return policy: products can be returned within {company?.returnPolicyDays} days of purchase. National Consumer Helpline: 1915.</p>
        </Card>
      </div>
      {open && <TicketThread id={open} onClose={() => setOpen(null)} />}
      <Modal open={nw} onClose={() => setNw(false)} title="New support ticket"
        footer={<><Button variant="ghost" onClick={() => setNw(false)}>Cancel</Button><Button loading={busy === 'n'} onClick={() => run('n', () => post('/tickets', f), { success: 'Ticket created', invalidate: ['tickets'] }).then((r) => { if (r) { setNw(false); setF({ category: 'ORDER', subject: '', message: '' }); } })}>Submit</Button></>}>
        <div className="space-y-4">
          <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={CATS.map((c) => ({ value: c, label: c[0] + c.slice(1).toLowerCase() }))} /></Field>
          <Field label="Subject"><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field label="Describe the issue"><Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
