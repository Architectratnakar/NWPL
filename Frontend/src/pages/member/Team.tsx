import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { get, type Paged } from '@/api/client';
import { Avatar, Badge, Card, DataTable, PageHeader, Pagination, Tabs } from '@/components/ui';
import { date } from '@/lib/format';

type View = 'directs' | 'LEFT' | 'RIGHT';
export default function Team() {
  const [view, setView] = useState<View>('directs');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['team', view, page],
    queryFn: () => (view === 'directs' ? get<Paged<any>>('/genealogy/directs', { page }) : get<Paged<any>>('/genealogy/team', { side: view, page })),
  });
  const rows = (data?.items ?? []).map((r: any) => ({
    id: r.id, code: r.code ?? r.distributorCode, name: r.name ?? r.fullName, side: r.leg ?? r.side, level: r.level, tier: r.tier ?? r.packageTier,
    status: r.status, rank: r.rank ?? r.currentRank?.name, sponsorCode: r.sponsorCode, joinedAt: r.joinedAt ?? r.createdAt, mobile: r.user?.mobile,
  }));
  return (
    <div>
      <PageHeader icon={<Users className="h-5 w-5" />} title="My team" subtitle="People you sponsored and your whole left / right legs" />
      <Tabs value={view} onChange={(v) => { setView(v); setPage(1); }} tabs={[{ value: 'directs', label: 'My directs' }, { value: 'LEFT', label: 'Left leg' }, { value: 'RIGHT', label: 'Right leg' }]} />
      <Card noPad>
        <DataTable loading={isLoading} rows={rows} empty="No members here yet"
          columns={[
            { key: 'name', header: 'Member', render: (r) => <div className="flex items-center gap-3"><Avatar name={r.name} size={32} /><div><p className="font-semibold text-slate-900">{r.name}</p><p className="text-xs text-brand-700">{r.code}</p></div></div> },
            { key: 'side', header: view === 'directs' ? 'Placed' : 'Leg', render: (r) => <Badge>{r.side === 'LEFT' ? 'Left' : 'Right'}</Badge> },
            ...(view === 'directs' ? [{ key: 'mobile', header: 'Mobile', render: (r: any) => r.mobile ?? '—' }] : [{ key: 'level', header: 'Level', align: 'right' as const }, { key: 'sponsorCode', header: 'Sponsor' }]),
            { key: 'tier', header: 'Package', render: (r) => <Badge status={r.tier} /> },
            { key: 'rank', header: 'Rank', render: (r) => r.rank ?? '—' },
            { key: 'status', header: 'Status', render: (r) => <Badge status={r.status} /> },
            { key: 'joinedAt', header: 'Joined', render: (r) => date(r.joinedAt) },
          ]} />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}
