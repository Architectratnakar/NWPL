import { CreditCard, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { post, errMsg } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button, Modal, useToast } from '@/components/ui';
import { bv, inr } from '@/lib/format';
import { useState } from 'react';

export interface OrderLite { id: string; orderNo: string; type: string; grandTotal: string; gstTotal: string; subTotal: string; bvTotal: string }

/** DEMO payment step. In production this opens the payment gateway (Razorpay / PayU / Cashfree) checkout. */
export default function PayModal({ order, onClose, onPaid }: { order: OrderLite | null; onClose: () => void; onPaid?: () => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  if (!order) return null;
  const pay = async () => {
    setBusy(true);
    try {
      await post(`/orders/${order.id}/pay`);
      toast.success('Payment successful — invoice generated');
      await refreshUser();
      await qc.invalidateQueries();
      onPaid?.();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Complete payment" size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Pay later</Button><Button loading={busy} onClick={pay} icon={<CreditCard className="h-4 w-4" />}>Pay {inr(order.grandTotal)} (demo)</Button></>}>
      <div className="space-y-3 text-sm">
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="flex justify-between"><span className="text-slate-500">Order</span><b>{order.orderNo}</b></div>
          <div className="mt-1 flex justify-between"><span className="text-slate-500">Type</span><b>{order.type}</b></div>
          <div className="mt-1 flex justify-between"><span className="text-slate-500">Taxable value</span><span>{inr(order.subTotal, 2)}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-slate-500">GST (included)</span><span>{inr(order.gstTotal, 2)}</span></div>
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base"><span className="font-semibold">Total</span><b>{inr(order.grandTotal)}</b></div>
          <div className="mt-1 flex justify-between"><span className="text-slate-500">Business volume</span><b className="text-brand-700">{bv(order.bvTotal)} BV</b></div>
        </div>
        <p className="flex items-start gap-2 text-xs text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />Demo mode: no money is charged. In production this button opens the payment gateway and the order is confirmed by its webhook.</p>
      </div>
    </Modal>
  );
}
