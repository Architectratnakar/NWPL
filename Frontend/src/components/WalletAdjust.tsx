import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCheck, FileText, MinusCircle, PlusCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { get, openAuthed, post } from '@/api/client';
import { Badge, Button, Callout, DataTable, Field, Input, Modal, Textarea } from '@/components/ui';
import { dateTime, inr, num } from '@/lib/format';
import { useAction } from '@/lib/hooks';

export const MAX_ADJUSTMENT = 500_000;
const KEYS = ['wallet-adjustments', 'admin-member', 'admin-members', 'admin-dashboard'];

/* ---------- raise a request (distributor detail page) ---------- */
export function AdjustWalletModal({ open, onClose, member }: { open: boolean; onClose: () => void; member: any }) {
  const [type, setType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [now, setNow] = useState(true);
  const { busy, run } = useAction();
  const { data: rules } = useQuery({ queryKey: ['wallet-adjustments', 'rules'], queryFn: () => get('/admin/wallet-adjustments/rules'), enabled: open });
  useEffect(() => { if (open) { setType('CREDIT'); setAmount(''); setReason(''); setNow(true); } }, [open]);
  const instant = !!rules?.canApproveOwn && now;

  const balance = num(member?.wallet?.balance);
  const amt = Number(amount);
  const blocked = member?.status === 'BLOCKED' || member?.status === 'TERMINATED';
  const amountError =
    !amount ? null
      : !(amt > 0) ? 'Amount must be more than ₹0'
        : !/^\d+(\.\d{1,2})?$/.test(amount) ? 'At most 2 decimals (paise)'
          : amt > MAX_ADJUSTMENT ? `At most ₹${MAX_ADJUSTMENT.toLocaleString('en-IN')}`
            : type === 'DEBIT' && amt > balance ? `Wallet balance is only ${inr(balance, 2)}` : null;
  const reasonError = reason && reason.trim().length < 10 ? 'At least 10 characters' : null;
  const ok = !blocked && !!amount && !amountError && reason.trim().length >= 10;
  const after = type === 'CREDIT' ? balance + (amt || 0) : balance - (amt || 0);

  const submit = () =>
    run('adj', () => post(`/admin/members/${member.id}/wallet-adjustments`, { type, amount: amt, reason: reason.trim(), approveNow: instant || undefined }), {
      success: instant
        ? `${inr(amt, 2)} ${type === 'CREDIT' ? 'credited to' : 'debited from'} ${member.fullName}'s wallet`
        : 'Request saved as PENDING. The wallet changes only after a second admin approves it (Wallet Adjustments → Pending).',
      invalidate: [...KEYS, 'admin-member'],
    }).then((r: any) => { if (r) { onClose(); if (r.status === 'APPROVED') openAuthed(`/admin/wallet-adjustments/${r.id}/note`); } });

  return (
    <Modal open={open} onClose={onClose} title={`Adjust wallet — ${member?.distributorCode ?? ''}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy === 'adj'} disabled={!ok} onClick={submit}>{instant ? (type === 'CREDIT' ? 'Credit now' : 'Debit now') : 'Raise request for approval'}</Button></>}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
          <span>{member?.fullName}<br /><span className="text-xs text-slate-500">Current wallet balance{member?.wallet?.onHold ? ' (on hold)' : ''}</span></span>
          <b className="text-lg">{inr(balance, 2)}</b>
        </div>
        {blocked && <Callout tone="danger">This distributor is {String(member.status).toLowerCase()}. Wallet adjustments are not allowed.</Callout>}
        <div className="grid grid-cols-2 gap-2">
          {(['CREDIT', 'DEBIT'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={clsx('flex items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-semibold transition',
                type === t ? (t === 'CREDIT' ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-red-500 bg-red-50 text-red-700') : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
              {t === 'CREDIT' ? <PlusCircle className="h-4 w-4" /> : <MinusCircle className="h-4 w-4" />}{t === 'CREDIT' ? 'Credit (add money)' : 'Debit (take money)'}
            </button>
          ))}
        </div>
        <Field label="Amount (₹) *" error={amountError ?? undefined} hint="More than ₹0, at most 2 decimals, up to ₹5,00,000">
          <Input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label="Reason *" error={reasonError ?? undefined} hint="Shown to the distributor and printed on the credit / debit note">
          <Textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Pair income missed in closing of 10 Nov 2026" />
        </Field>
        {amt > 0 && !amountError && (
          <p className="text-sm text-slate-600">After approval the balance will be <b>{inr(after, 2)}</b>. TDS and admin charges are deducted later, when the distributor withdraws.</p>
        )}
        {rules && (rules.canApproveOwn ? (
          <label className="flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-700" checked={now} onChange={(e) => setNow(e.target.checked)} />
            <span><b>{type === 'CREDIT' ? 'Credit' : 'Debit'} now</b> — approve in the same click (maker-checker is off). The wallet changes at once and the {type === 'CREDIT' ? 'Credit' : 'Debit'} Note opens. Untick to leave it for another admin to approve.</span>
          </label>
        ) : rules.otherApprovers === 0 ? (
          <Callout tone="warn">Maker-checker is on, so a <b>second admin</b> must approve this before the wallet changes — but there is no other Super Admin or Finance admin yet. Add a Finance admin under <Link className="link" to="/admin/users" onClick={onClose}>Staff Users</Link>, or switch maker-checker off in <Link className="link" to="/admin/settings" onClick={onClose}>Plan settings</Link> to use “Credit now”.</Callout>
        ) : (
          <Callout tone="info">Maker-checker is on: this is saved as <b>Pending</b>. The wallet changes only after a <b>different</b> Super Admin or Finance admin approves it under Wallet Adjustments → Pending.</Callout>
        ))}
        {member?.wallet?.onHold && type === 'CREDIT' && <p className="text-xs text-amber-700">The wallet is on hold: the credit is allowed, but withdrawals stay blocked until the hold is removed.</p>}
      </div>
    </Modal>
  );
}

/* ---------- list with approve / reject (admin page + distributor detail) ---------- */
export function AdjustmentTable({ rows, loading, canApproveOwn, showMember = true }: { rows?: any[]; loading?: boolean; canApproveOwn: boolean; showMember?: boolean }) {
  const [approve, setApprove] = useState<any>(null);
  const [reject, setReject] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const { busy, run } = useAction();
  const canDecide = (r: any) => r.status === 'PENDING' && (!r.mine || canApproveOwn);

  const doApprove = () =>
    run('ap', () => post(`/admin/wallet-adjustments/${approve.id}/approve`), { success: 'Approved — wallet updated and note issued', invalidate: KEYS })
      .then((r: any) => { if (r) { setApprove(null); if (r.id) openAuthed(`/admin/wallet-adjustments/${r.id}/note`); } });
  const doReject = () =>
    run('rj', () => post(`/admin/wallet-adjustments/${reject.id}/reject`, { reason: rejectReason.trim() }), { success: 'Request rejected', invalidate: KEYS })
      .then((r) => { if (r) { setReject(null); setRejectReason(''); } });

  return (
    <>
      <DataTable loading={loading} rows={rows} empty="No wallet adjustments" columns={[
        { key: 'createdAt', header: 'Requested', render: (r: any) => <div><p>{dateTime(r.createdAt)}</p><p className="text-xs text-slate-500">by {r.requestedByName}{r.mine ? ' (you)' : ''}</p></div> },
        ...(showMember ? [{ key: 'member', header: 'Distributor', render: (r: any) => <div><p className="font-semibold">{r.member.name}</p><p className="text-xs text-brand-700">{r.member.code}{r.member.status !== 'ACTIVE' && r.member.status !== 'REGISTERED' ? ` · ${r.member.status.toLowerCase()}` : ''}</p></div> }] : []),
        { key: 'amount', header: 'Amount', align: 'right' as const, render: (r: any) => <b className={r.type === 'CREDIT' ? 'text-brand-700' : 'text-red-600'}>{r.type === 'CREDIT' ? '+' : '−'} {inr(r.amount, 2)}</b> },
        { key: 'reason', header: 'Reason', render: (r: any) => <div className="max-w-xs"><p className="text-sm">{r.reason}</p>{r.rejectReason && <p className="mt-1 text-xs text-red-600">Rejected: {r.rejectReason}</p>}</div> },
        { key: 'status', header: 'Status', render: (r: any) => <div><Badge status={r.status} />{r.decidedAt && <p className="mt-1 text-xs text-slate-500">{dateTime(r.decidedAt)}<br />by {r.decidedByName}</p>}</div> },
        { key: 'bal', header: 'Balance', align: 'right' as const, render: (r: any) => r.status === 'APPROVED' ? <span className="text-xs">{inr(r.balanceBefore, 2)} → <b>{inr(r.balanceAfter, 2)}</b></span> : <span className="text-xs text-slate-500">now {inr(r.member.walletBalance, 2)}</span> },
        { key: 'a', header: '', align: 'right' as const, render: (r: any) => (
          <div className="flex justify-end gap-1">
            {r.status === 'APPROVED' && <Button size="sm" variant="ghost" icon={<FileText className="h-4 w-4" />} onClick={() => openAuthed(`/admin/wallet-adjustments/${r.id}/note`)}>{r.noteNo}</Button>}
            {canDecide(r) && <Button size="sm" variant="secondary" icon={<CheckCheck className="h-4 w-4" />} onClick={() => setApprove(r)}>Approve</Button>}
            {canDecide(r) && <Button size="sm" variant="ghost" icon={<XCircle className="h-4 w-4" />} onClick={() => { setReject(r); setRejectReason(''); }}>Reject</Button>}
            {r.status === 'PENDING' && !canDecide(r) && <span className="max-w-[160px] text-right text-xs text-amber-700" title="You raised this request. Another Super Admin or Finance admin must approve it, or switch maker-checker off in Plan settings (Super Admin can then approve their own).">You raised it — a 2nd admin must approve</span>}
          </div>
        ) },
      ]} />

      <Modal open={!!approve} onClose={() => setApprove(null)} title="Approve wallet adjustment?" size="sm"
        footer={<><Button variant="ghost" onClick={() => setApprove(null)}>Cancel</Button><Button loading={busy === 'ap'} onClick={doApprove}>{approve?.type === 'CREDIT' ? 'Approve & credit' : 'Approve & debit'}</Button></>}>
        {approve && (
          <div className="space-y-2 text-sm">
            <p><b>{approve.type === 'CREDIT' ? 'Add' : 'Take'} {inr(approve.amount, 2)}</b> {approve.type === 'CREDIT' ? 'to' : 'from'} the wallet of <b>{approve.member.name}</b> ({approve.member.code}).</p>
            <p className="text-slate-600">Reason: {approve.reason}</p>
            <p className="text-slate-600">Balance now {inr(approve.member.walletBalance, 2)} → after {inr(num(approve.member.walletBalance) + (approve.type === 'CREDIT' ? 1 : -1) * approve.amount, 2)}</p>
            <p className="text-xs text-slate-500">A numbered {approve.type === 'CREDIT' ? 'Credit' : 'Debit'} Note is issued and opens for printing. This cannot be undone; to correct it, raise an opposite adjustment.</p>
          </div>
        )}
      </Modal>
      <Modal open={!!reject} onClose={() => setReject(null)} title="Reject wallet adjustment" size="sm"
        footer={<><Button variant="ghost" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" loading={busy === 'rj'} disabled={rejectReason.trim().length < 5} onClick={doReject}>Reject</Button></>}>
        <p className="mb-3 text-sm">{reject?.type === 'CREDIT' ? 'Credit' : 'Debit'} of {inr(reject?.amount, 2)} for {reject?.member.name}. The wallet is not changed.</p>
        <Field label="Reason for rejecting *" hint="At least 5 characters"><Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} /></Field>
      </Modal>
    </>
  );
}

/** Data for the table, shared by the page and the distributor detail card */
export const fetchAdjustments = (params: Record<string, unknown>) => get('/admin/wallet-adjustments', params);
