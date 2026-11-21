import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Search, WalletCards } from 'lucide-react';
import { openAuthed } from '@/api/client';
import { Callout, Card, Input, PageHeader, Pagination, StatCard, Tabs, Button } from '@/components/ui';
import { AdjustmentTable, fetchAdjustments } from '@/components/WalletAdjust';
import { inr } from '@/lib/format';

/** Admin › Wallet adjustments: manual credits / debits, approved by a second admin (maker-checker). */
export default function WalletAdjustments() {
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['wallet-adjustments', status, page, q],
    queryFn: () => fetchAdjustments({ status, page, q: q.trim() || undefined }),
  });
  const csv = () => openAuthed(`/admin/wallet-adjustments?format=csv&status=${status}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`, `wallet-adjustments-${status.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`);
  return (
    <div>
      <PageHeader icon={<WalletCards className="h-5 w-5" />} title="Wallet adjustments"
        subtitle="Manual credits and debits to distributor wallets. Raise them from a distributor's page; a second admin approves them."
        actions={<Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={csv}>Download CSV</Button>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Waiting for approval" value={data?.counts.PENDING ?? 0} tone="gold" />
        <StatCard label="Approved credits (all time)" value={inr(data?.totals.CREDIT, 2)} />
        <StatCard label="Approved debits (all time)" value={inr(data?.totals.DEBIT, 2)} tone="plum" />
      </div>
      {data && (data.makerChecker
        ? <div className="mb-4"><Callout tone="info">Maker-checker is on: the admin who raised a request cannot approve or reject it.</Callout></div>
        : <div className="mb-4"><Callout tone="warn">Maker-checker is off: the Super Admin may approve their own requests. Finance admins still need a second admin.</Callout></div>)}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[
          { value: 'PENDING', label: 'Pending', count: data?.counts.PENDING },
          { value: 'APPROVED', label: 'Approved', count: data?.counts.APPROVED },
          { value: 'REJECTED', label: 'Rejected', count: data?.counts.REJECTED },
        ]} />
        <div className="relative md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Distributor ID or name" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>
      <Card noPad>
        <AdjustmentTable rows={data?.items} loading={isLoading} canApproveOwn={!!data?.canApproveOwn} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}
