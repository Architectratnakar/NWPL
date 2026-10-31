import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Eye, ShieldCheck, X } from 'lucide-react';
import { get, openAuthed, post } from '@/api/client';
import { Badge, Button, Card, DataTable, Field, Modal, PageHeader, Pagination, Tabs, Textarea } from '@/components/ui';
import { dateTime, titleCase } from '@/lib/format';
import { useAction } from '@/lib/hooks';

export default function KycQueue() {
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['admin-kyc', status, page], queryFn: () => get('/admin/kyc', { status, page }) });
  const [reject, setReject] = useState<any>(null);
  const [remarks, setRemarks] = useState('');
  const { busy, run } = useAction();
  const decide = (id: string, approve: boolean, rm?: string) => run(id, () => post(`/admin/kyc/${id}/decision`, { approve, remarks: rm }), { success: approve ? 'Approved' : 'Rejected', invalidate: ['admin-kyc', 'admin-dashboard'] });
  return (
    <div>
      <PageHeader icon={<ShieldCheck className="h-5 w-5" />} title="KYC review" subtitle="A member is KYC-approved when PAN, Aadhaar/ID proof and bank proof are all approved" />
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[{ value: 'PENDING', label: 'Waiting' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }]} />
      <Card noPad>
        <DataTable loading={isLoading} rows={data?.items} empty="Nothing waiting for review 🎉" columns={[
          { key: 'member', header: 'Distributor', render: (r: any) => <div><p className="font-semibold">{r.member.fullName}</p><p className="text-xs text-brand-700">{r.member.distributorCode}</p></div> },
          { key: 'type', header: 'Document', render: (r: any) => <b>{titleCase(r.type)}</b> },
          { key: 'number', header: 'Number', render: (r: any) => r.number ?? '—' },
          { key: 'createdAt', header: 'Uploaded', render: (r: any) => dateTime(r.createdAt) },
          { key: 'status', header: 'Status', render: (r: any) => <div><Badge status={r.status} />{r.remarks && <p className="mt-1 text-xs text-slate-500">{r.remarks}</p>}</div> },
          { key: 'a', header: '', align: 'right', render: (r: any) => <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => openAuthed(`/kyc/file/${r.id}`)}>View</Button>
            {r.status === 'PENDING' && <>
              <Button size="sm" variant="secondary" loading={busy === r.id} icon={<Check className="h-4 w-4" />} onClick={() => decide(r.id, true)}>Approve</Button>
              <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={() => setReject(r)}>Reject</Button>
            </>}
          </div> },
        ]} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      <Modal open={!!reject} onClose={() => setReject(null)} title="Reject document" size="sm"
        footer={<Button variant="danger" disabled={!remarks.trim()} loading={busy === reject?.id} onClick={() => decide(reject.id, false, remarks).then(() => { setReject(null); setRemarks(''); })}>Reject</Button>}>
        <Field label="Reason (shown to the distributor)"><Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Image is blurred, please upload again" /></Field>
      </Modal>
    </div>
  );
}
