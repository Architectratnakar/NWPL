import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Send } from 'lucide-react';
import { get, post } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Modal, Select, Textarea } from './ui';
import { dateTime } from '@/lib/format';
import { useAction } from '@/lib/hooks';

export default function TicketThread({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: t } = useQuery({ queryKey: ['ticket', id], queryFn: () => get(`/tickets/${id}`) });
  const { isStaff } = useAuth();
  const [text, setText] = useState('');
  const [status, setStatus] = useState('IN_PROGRESS');
  const { busy, run } = useAction();
  const send = () => run('s', () => post(`/tickets/${id}/messages`, { text, status: isStaff ? status : undefined }), { success: 'Reply sent', invalidate: ['ticket', 'tickets', 'admin-tickets'] }).then((r) => r && setText(''));
  return (
    <Modal open onClose={onClose} size="lg" title={t ? t.subject : 'Ticket'}>
      {t && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge status={t.status} /><Badge>{t.category}</Badge>
            <span>{t.member.fullName} ({t.member.distributorCode})</span><span>· opened {dateTime(t.createdAt)}</span>
          </div>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-4">
            {t.messages.map((m: any, i: number) => (
              <div key={i} className={clsx('flex', m.by === 'STAFF' ? 'justify-start' : 'justify-end')}>
                <div className={clsx('max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm', m.by === 'STAFF' ? 'rounded-tl-sm bg-white text-slate-700' : 'rounded-tr-sm bg-brand-700 text-white')}>
                  <p className={clsx('mb-0.5 text-[11px] font-semibold', m.by === 'STAFF' ? 'text-brand-700' : 'text-brand-100')}>{m.by === 'STAFF' ? `Support · ${m.name}` : m.name}</p>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  <p className={clsx('mt-1 text-[10px]', m.by === 'STAFF' ? 'text-slate-400' : 'text-brand-200')}>{dateTime(m.at)}</p>
                </div>
              </div>
            ))}
          </div>
          {t.status !== 'CLOSED' && (
            <div className="space-y-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" />
              <div className="flex items-center justify-end gap-2">
                {isStaff && <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)} options={['IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED'].map((s) => ({ value: s, label: `Set: ${s.replace('_', ' ').toLowerCase()}` }))} />}
                <Button disabled={!text.trim()} loading={busy === 's'} onClick={send} icon={<Send className="h-4 w-4" />}>Send</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
