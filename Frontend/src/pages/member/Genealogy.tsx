import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp, GitFork, Home, Search } from 'lucide-react';
import { errMsg, get } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import BinaryTree, { TreeLegend, type TreeNode } from '@/components/BinaryTree';
import { Button, Callout, Card, Input, PageHeader, PageLoader, Select } from '@/components/ui';

export default function Genealogy({ admin = false }: { admin?: boolean }) {
  const { user } = useAuth();
  const home = admin ? 'NW100000' : user?.distributorCode ?? '';
  const [qs] = useSearchParams();
  const [code, setCode] = useState(qs.get('code') ?? home);
  const [history, setHistory] = useState<string[]>([]);
  const [depth, setDepth] = useState(3);
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useQuery({ queryKey: ['tree', code, depth], queryFn: () => get<TreeNode>('/genealogy/tree', { code, depth }) });
  const open = (c: string) => { if (c !== code) { setHistory((h) => [...h, code]); setCode(c); } };
  const submit = (e: FormEvent) => { e.preventDefault(); if (search.trim()) open(search.trim().toUpperCase()); };

  return (
    <div>
      <PageHeader icon={<GitFork className="h-5 w-5" />} title="Genealogy tree" subtitle="Your binary team. Click any member to open their tree."
        actions={<>
          <Button variant="outline" icon={<Home className="h-4 w-4" />} onClick={() => { setCode(home); setHistory([]); }}>{admin ? 'Top' : 'My tree'}</Button>
          <Button variant="outline" disabled={!history.length} icon={<ArrowUp className="h-4 w-4" />} onClick={() => { const h = [...history]; setCode(h.pop()!); setHistory(h); }}>Back</Button>
        </>} />
      <Card className="mb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <form onSubmit={submit} className="flex gap-2">
            <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="w-56 pl-10" placeholder="Find ID e.g. NW100005" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <Button type="submit" variant="secondary">Go</Button>
            <Select value={String(depth)} onChange={(e) => setDepth(Number(e.target.value))} className="w-32" options={[2, 3, 4].map((d) => ({ value: String(d), label: `${d} levels` }))} />
          </form>
          <TreeLegend />
        </div>
      </Card>
      {error ? <Callout tone="danger" title={errMsg(error)} /> : isLoading || !data ? <PageLoader /> : (
        <Card noPad bodyClass="py-6 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:18px_18px] rounded-2xl">
          <BinaryTree root={data} depth={depth} onOpen={open} />
        </Card>
      )}
    </div>
  );
}
