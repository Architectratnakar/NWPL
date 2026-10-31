import clsx from 'clsx';
import { UserPlus } from 'lucide-react';
import { bv } from '@/lib/format';
import { Avatar } from './ui';

export interface TreeNode {
  id: string; code: string; name: string; tier: 'NONE' | 'BASIC' | 'FULL'; status: string; rank: string | null; joinedAt: string;
  leftBv: string; rightBv: string; leftCount: number; rightCount: number; left: TreeNode | null; right: TreeNode | null;
}

const ring = (t: string, status: string) =>
  status === 'BLOCKED' ? 'ring-red-400' : t === 'FULL' ? 'ring-violet-500' : t === 'BASIC' ? 'ring-sky-500' : 'ring-slate-300';

function NodeCard({ n, onOpen, root }: { n: TreeNode; onOpen: (code: string) => void; root?: boolean }) {
  return (
    <button onClick={() => onOpen(n.code)} title={`Open ${n.code}`}
      className={clsx('group w-[150px] rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md', root ? 'border-brand-300 ring-4 ring-brand-100' : 'border-slate-200')}>
      <div className="flex items-center gap-2">
        <div className={clsx('rounded-full ring-2 ring-offset-2', ring(n.tier, n.status))}><Avatar name={n.name} size={30} className={n.tier === 'NONE' ? '!from-slate-400 !to-slate-500' : ''} /></div>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-800">{n.name}</p>
          <p className="text-[11px] font-semibold text-brand-700">{n.code}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-center text-[10.5px]">
        <div className="rounded-lg bg-slate-50 py-1"><p className="text-slate-400">L BV</p><p className="font-bold text-slate-700">{bv(n.leftBv)}</p></div>
        <div className="rounded-lg bg-slate-50 py-1"><p className="text-slate-400">R BV</p><p className="font-bold text-slate-700">{bv(n.rightBv)}</p></div>
      </div>
      <p className="mt-1.5 truncate text-center text-[10.5px] text-slate-500">{n.tier === 'NONE' ? 'Not activated' : n.tier === 'FULL' ? '100 BV' : '40 BV'}{n.rank ? ` · ${n.rank}` : ''}</p>
    </button>
  );
}

function Empty({ side, parentCode, canInvite }: { side: 'LEFT' | 'RIGHT'; parentCode: string; canInvite?: boolean }) {
  return (
    <div className="grid h-[118px] w-[150px] place-items-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 text-center text-[11px] text-slate-400">
      <div>
        <UserPlus className="mx-auto mb-1 h-5 w-5" />
        Empty {side.toLowerCase()} slot
        {canInvite && <p className="mt-0.5 text-[10px] text-slate-400">under {parentCode}</p>}
      </div>
    </div>
  );
}

function Branch({ n, depth, onOpen, root }: { n: TreeNode; depth: number; onOpen: (c: string) => void; root?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <NodeCard n={n} onOpen={onOpen} root={root} />
      {depth > 0 && (
        <>
          <div className="h-4 w-0.5 bg-brand-200" />
          <div className="relative flex gap-4">
            <div className="absolute left-1/4 right-1/4 top-0 h-0.5 bg-brand-200" />
            {(['left', 'right'] as const).map((s) => (
              <div key={s} className="relative flex flex-col items-center pt-4">
                <div className="absolute left-1/2 top-0 h-4 w-0.5 -translate-x-1/2 bg-brand-200" />
                <span className="absolute left-1/2 top-[3px] -translate-x-1/2 rounded bg-white px-1 text-[9px] font-bold uppercase text-brand-500">{s === 'left' ? 'L' : 'R'}</span>
                {n[s] ? <Branch n={n[s]!} depth={depth - 1} onOpen={onOpen} /> : <Empty side={s === 'left' ? 'LEFT' : 'RIGHT'} parentCode={n.code} canInvite />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function BinaryTree({ root, depth, onOpen }: { root: TreeNode; depth: number; onOpen: (code: string) => void }) {
  return (
    <div className="scrollbar-thin overflow-x-auto pb-4">
      <div className="mx-auto w-max px-4 pt-2">
        <Branch n={root} depth={depth} onOpen={onOpen} root />
      </div>
    </div>
  );
}

export function TreeLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-500">
      {[['ring-violet-500', '100 BV ID'], ['ring-sky-500', '40 BV ID'], ['ring-slate-300', 'Not activated'], ['ring-red-400', 'Blocked']].map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5"><span className={clsx('h-3 w-3 rounded-full bg-white ring-2', c)} />{l}</span>
      ))}
    </div>
  );
}
