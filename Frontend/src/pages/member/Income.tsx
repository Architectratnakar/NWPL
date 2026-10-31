import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Info } from 'lucide-react';
import { get } from '@/api/client';
import { Badge, Card, DataTable, KeyValue, Modal, PageHeader, Pagination, StatCard, Tabs } from '@/components/ui';
import { date, inr, titleCase } from '@/lib/format';

export default function Income() {
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [line, setLine] = useState<any>(null);
  const { data, isLoading } = useQuery({ queryKey: ['income', type, page], queryFn: () => get('/finance/income', { type: type || undefined, page }) });
  const sum = (t: string) => data?.summary.find((s: any) => s.type === t);
  const total = (data?.summary ?? []).reduce((a: number, s: any) => a + Number(s.amount ?? 0), 0);
  return (
    <div>
      <PageHeader icon={<BarChart3 className="h-5 w-5" />} title="Income" subtitle="Every rupee with its calculation — from posted closings" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total earned" value={inr(total)} tone="green" />
        <StatCard label="Pair matching" value={inr(sum('PAIR_MATCHING')?.amount)} sub={`${sum('PAIR_MATCHING')?.pairs ?? 0} pairs paid`} tone="plum" />
        <StatCard label="Rank bonus" value={inr(sum('RANK_BONUS')?.amount)} tone="gold" />
        <StatCard label="Special bonus" value={inr(sum('SPECIAL_BONUS')?.amount)} sub="Women & divyang distributors" tone="blue" />
      </div>
      <Tabs value={type} onChange={(v) => { setType(v); setPage(1); }} tabs={[{ value: '', label: 'All' }, { value: 'PAIR_MATCHING', label: 'Pair matching' }, { value: 'RANK_BONUS', label: 'Rank bonus' }, { value: 'SPECIAL_BONUS', label: 'Special bonus' }]} />
      <Card noPad>
        <DataTable loading={isLoading} rows={data?.items} onRowClick={setLine} empty="No income yet — income appears after the nightly closing is posted"
          columns={[
            { key: 'date', header: 'Closing date', render: (r: any) => date(r.closing.periodStart) },
            { key: 'type', header: 'Type', render: (r: any) => <Badge>{titleCase(r.incomeType)}</Badge> },
            { key: 'pairs', header: 'Pairs', align: 'right', render: (r: any) => r.incomeType === 'PAIR_MATCHING' ? r.pairs : '—' },
            { key: 'rate', header: 'Rate', align: 'right', render: (r: any) => r.incomeType !== 'PAIR_MATCHING' ? '—' : r.detail.fullPairs && r.detail.basicPairs ? `${r.detail.fullPairs}×₹${r.detail.rates.FULL_FULL} + ${r.detail.basicPairs}×₹${r.detail.rates.DEFAULT}` : inr(r.rate) },
            { key: 'flushed', header: 'Over cap', align: 'right', render: (r: any) => r.flushed || '—' },
            { key: 'amount', header: 'Amount', align: 'right', render: (r: any) => <b className="text-brand-700">{inr(r.amount)}</b> },
            { key: 'i', header: '', render: () => <Info className="h-4 w-4 text-slate-400" /> },
          ]} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      <Modal open={!!line} onClose={() => setLine(null)} title="How this income was calculated">
        {line && (line.incomeType === 'PAIR_MATCHING' ? (
          <div className="space-y-4 text-sm">
            <KeyValue items={[
              ['Your package', line.detail.tier === 'FULL' ? '100 BV' : '40 BV'],
              ['Closing date', date(line.closing.periodStart)],
              ['Carry before (L / R)', `${line.detail.carryBefore.lf + line.detail.carryBefore.lb} / ${line.detail.carryBefore.rf + line.detail.carryBefore.rb} units`],
              ['Cap remaining', `${line.detail.capRemaining} pairs`],
              [`100:100 pairs @ ₹${line.detail.rates.FULL_FULL}`, line.detail.fullPairs],
              [`Other pairs @ ₹${line.detail.rates.DEFAULT}`, line.detail.basicPairs],
              ['Flushed (over cap)', line.flushed],
              ['Carry after (L / R)', `${line.detail.carryAfter.lf + line.detail.carryAfter.lb} / ${line.detail.carryAfter.rf + line.detail.carryAfter.rb} units`],
            ]} />
            <div className="rounded-xl bg-brand-50 p-3 font-semibold text-brand-900">{line.detail.fullPairs} × ₹{line.detail.rates.FULL_FULL} + {line.detail.basicPairs} × ₹{line.detail.rates.DEFAULT} = {inr(line.amount)}</div>
          </div>
        ) : (
          <KeyValue items={[['Type', titleCase(line.incomeType)], ['Rank', line.detail.rankName], ['Amount', inr(line.amount)], ['Reason', line.detail.reason ?? `Weaker leg BV reached ${line.detail.weakLegBv}`]]} />
        ))}
      </Modal>
    </div>
  );
}
