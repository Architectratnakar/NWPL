import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, Landmark, Wallet as WalletIcon } from 'lucide-react';
import { get, post } from '@/api/client';
import { Badge, Button, Callout, Card, DataTable, Field, Input, Modal, PageHeader, Pagination, StatCard, Tabs } from '@/components/ui';
import { dateTime, inr, num, titleCase } from '@/lib/format';
import { useAction } from '@/lib/hooks';

export default function Wallet() {
  const [tab, setTab] = useState<'ledger' | 'withdrawals'>('ledger');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const { data: w, isLoading } = useQuery({ queryKey: ['wallet', page], queryFn: () => get('/finance/wallet', { page }) });
  const { data: wd } = useQuery({ queryKey: ['withdrawals', page], queryFn: () => get('/finance/withdrawals', { page }), enabled: tab === 'withdrawals' });
  const { busy, run } = useAction();
  const gross = num(amount);
  const tds = (gross * num(w?.rules.tdsPercent)) / 100;
  const adm = (gross * num(w?.rules.adminChargePercent)) / 100;
  const canWithdraw = w && w.kycStatus === 'APPROVED' && w.bank && !w.wallet.onHold;

  return (
    <div>
      <PageHeader icon={<WalletIcon className="h-5 w-5" />} title="Wallet & payouts" subtitle="Income is credited here after each closing. Withdraw to your verified bank account."
        actions={<Button icon={<ArrowDownToLine className="h-4 w-4" />} disabled={!canWithdraw} onClick={() => setOpen(true)}>Withdraw</Button>} />
      {w && !canWithdraw && (
        <div className="mb-5"><Callout tone="warn" title="Withdrawal not available yet">
          {w.wallet.onHold ? 'Your wallet is on hold — contact support.' : w.kycStatus !== 'APPROVED' ? <>Your KYC must be approved. <Link className="link" to="/app/kyc">Complete KYC →</Link></> : <>Add your bank account in <Link className="link" to="/app/profile">Profile</Link>.</>}
        </Callout></div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Available balance" value={inr(w?.wallet.balance, 2)} icon={<WalletIcon className="h-5 w-5" />} />
        <StatCard label="Minimum withdrawal" value={inr(w?.rules.minAmount)} sub={w?.rules.allowedDays ? `Allowed on ${w.rules.allowedDays.join(', ')}` : 'Any day'} tone="gold" icon={<ArrowDownToLine className="h-5 w-5" />} />
        <StatCard label="Payout account" value={w?.bank ? `•••• ${w.bank.accountLast4}` : 'Not added'} sub={w?.bank ? `${w.bank.ifsc} · ${w.bank.verified ? 'Verified' : 'Pending verification'}` : undefined} tone="blue" icon={<Landmark className="h-5 w-5" />} />
      </div>
      <Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} tabs={[{ value: 'ledger', label: 'Wallet ledger' }, { value: 'withdrawals', label: 'Withdrawals' }]} />
      <Card noPad>
        {tab === 'ledger' ? (
          <>
            <DataTable loading={isLoading} rows={w?.items} columns={[
              { key: 'createdAt', header: 'Date', render: (r: any) => dateTime(r.createdAt) },
              { key: 'type', header: 'Entry', render: (r: any) => <Badge status={r.type} /> },
              { key: 'what', header: 'Details', render: (r: any) => <div><p className="font-semibold">{r.incomeType ? titleCase(r.incomeType) : titleCase(r.refType)}</p><p className="text-xs text-slate-500">{r.note}</p></div> },
              { key: 'amount', header: 'Amount', align: 'right', render: (r: any) => <b className={r.type === 'CREDIT' ? 'text-brand-700' : ''}>{r.type === 'CREDIT' ? '+' : '−'}{inr(r.amount, 2)}</b> },
              { key: 'balanceAfter', header: 'Balance', align: 'right', render: (r: any) => inr(r.balanceAfter, 2) },
            ]} />
            {w && <Pagination page={page} pageSize={w.pageSize} total={w.total} onChange={setPage} />}
          </>
        ) : (
          <>
            <DataTable rows={wd?.items} empty="No withdrawals yet" columns={[
              { key: 'createdAt', header: 'Requested', render: (r: any) => dateTime(r.createdAt) },
              { key: 'gross', header: 'Amount', align: 'right', render: (r: any) => inr(r.gross, 2) },
              { key: 'tds', header: 'TDS', align: 'right', render: (r: any) => inr(r.tds, 2) },
              { key: 'adminCharge', header: 'Admin', align: 'right', render: (r: any) => inr(r.adminCharge, 2) },
              { key: 'net', header: 'Net paid', align: 'right', render: (r: any) => <b>{inr(r.net, 2)}</b> },
              { key: 'status', header: 'Status', render: (r: any) => <Badge status={r.status} /> },
              { key: 'utr', header: 'Bank UTR', render: (r: any) => r.utr ?? '—' },
            ]} />
            {wd && <Pagination page={page} pageSize={wd.pageSize} total={wd.total} onChange={setPage} />}
          </>
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Withdraw to bank" size="sm"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={busy === 'wd'} disabled={gross < num(w?.rules.minAmount) || gross > num(w?.wallet.balance)} onClick={() => run('wd', () => post('/finance/withdrawals', { amount: gross }), { success: 'Withdrawal requested', invalidate: ['wallet', 'withdrawals', 'dashboard'] }).then((r) => { if (r) { setOpen(false); setAmount(''); setTab('withdrawals'); } })}>Request withdrawal</Button></>}>
        <Field label="Amount (₹)" hint={`Available ${inr(w?.wallet.balance, 2)} · minimum ${inr(w?.rules.minAmount)}`}><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">TDS ({w?.rules.tdsPercent ?? 0}%)</span><span>− {inr(tds, 2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Admin charge ({w?.rules.adminChargePercent ?? 0}%)</span><span>− {inr(adm, 2)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-bold"><span>You receive</span><span>{inr(Math.max(0, gross - tds - adm), 2)}</span></div>
        </div>
      </Modal>
    </div>
  );
}
