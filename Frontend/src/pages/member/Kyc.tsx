import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Eye, FileUp } from 'lucide-react';
import { api, get, openAuthed } from '@/api/client';
import { Badge, Button, Callout, Card, DataTable, Field, Input, PageHeader, Select } from '@/components/ui';
import { dateTime, titleCase } from '@/lib/format';
import { useAction } from '@/lib/hooks';

const TYPES = [
  { value: 'PAN', label: 'PAN card' }, { value: 'AADHAAR', label: 'Aadhaar (only last 4 digits are stored)' }, { value: 'BANK_PROOF', label: 'Cancelled cheque / passbook' },
  { value: 'PHOTO', label: 'Photograph' }, { value: 'DISABILITY_CERT', label: 'Disability certificate (for special bonus)' }, { value: 'OTHER', label: 'Other ID / address proof' },
];

export default function Kyc() {
  const { data } = useQuery({ queryKey: ['kyc'], queryFn: () => get('/kyc') });
  const [type, setType] = useState('PAN');
  const [number, setNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { busy, run } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append('type', type);
    if (number) fd.append('number', number);
    fd.append('file', file);
    run('up', () => api.post('/kyc', fd), { success: 'Document uploaded for review', invalidate: ['kyc'] }).then((r) => { if (r) { setFile(null); setNumber(''); (e.target as HTMLFormElement).reset(); } });
  };
  const has = (t: string) => data?.documents.some((d: any) => d.type === t && d.status !== 'REJECTED');
  return (
    <div>
      <PageHeader icon={<BadgeCheck className="h-5 w-5" />} title="KYC verification" subtitle="Needed before you can withdraw income" actions={data && <Badge status={data.status} className="text-sm" />} />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card title="Upload a document">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Document type"><Select value={type} onChange={(e) => setType(e.target.value)} options={TYPES} /></Field>
            {['PAN', 'AADHAAR'].includes(type) && <Field label={type === 'PAN' ? 'PAN number' : 'Aadhaar number'} hint={type === 'AADHAAR' ? 'Stored masked — only the last 4 digits are kept' : 'Format ABCDE1234F'}><Input value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} /></Field>}
            <Field label="File (JPG, PNG or PDF, max 5 MB)">
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-800 hover:file:bg-brand-100" />
            </Field>
            <Button type="submit" className="w-full" disabled={!file} loading={busy === 'up'} icon={<FileUp className="h-4 w-4" />}>Upload</Button>
          </form>
          <div className="mt-5 space-y-2 text-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Checklist</p>
            {[['PAN', 'PAN card'], ['AADHAAR', 'Aadhaar / address proof'], ['BANK_PROOF', 'Bank proof']].map(([t, l]) => (
              <p key={t} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${has(t) ? 'bg-brand-500' : 'bg-slate-300'}`} />{l}</p>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          {data?.status === 'APPROVED' && <Callout tone="success" title="Your KYC is approved">You can withdraw income to your bank account.</Callout>}
          <Card title="My documents" noPad>
            <DataTable rows={data?.documents} empty="No documents uploaded" columns={[
              { key: 'type', header: 'Document', render: (r: any) => <b>{titleCase(r.type)}</b> },
              { key: 'createdAt', header: 'Uploaded', render: (r: any) => dateTime(r.createdAt) },
              { key: 'status', header: 'Status', render: (r: any) => <Badge status={r.status} /> },
              { key: 'remarks', header: 'Remarks', render: (r: any) => r.remarks ?? '—' },
              { key: 'v', header: '', render: (r: any) => <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => openAuthed(`/kyc/file/${r.id}`)}>View</Button> },
            ]} />
          </Card>
        </div>
      </div>
    </div>
  );
}
