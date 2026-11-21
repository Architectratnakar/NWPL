/**
 * Cancel / delete orders safely.
 *
 *  - Only UNPAID orders can be cancelled (status PENDING_PAYMENT).
 *  - Only orders that never became a sale can be deleted: PENDING_PAYMENT or CANCELLED, no successful payment,
 *    no invoice number, no BV posting, no return request, no franchise sale / commission.
 *  - A PAID / INVOICED / SHIPPED / DELIVERED / RETURNED order is a GST record with BV postings (append-only):
 *    it is NEVER deleted — it goes through the return / buy-back flow instead.
 *
 *  Stock: products leave company or franchise stock only when an order is PAID (markOrderPaid), so an unpaid or
 *  cancelled order holds no stock and there is nothing to put back. The delete check still refuses any order that
 *  has a franchise stock movement, so stock can never be lost.
 */
import type { Request } from 'express';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/http';
import { audit } from '../lib/audit';

const NEVER_DELETE = ['PAID', 'INVOICED', 'SHIPPED', 'DELIVERED', 'RETURNED'];

/** Everything that stops an order from being deleted (empty list = safe). */
export async function orderDeleteBlockers(orderId: string) {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    include: { member: { select: { distributorCode: true, fullName: true } }, _count: { select: { items: true, bvPostings: true, returns: true } } },
  });
  if (!o) throw notFound('Order');
  const [paidPayments, stockMoves, commission] = await Promise.all([
    prisma.payment.count({ where: { orderId, status: { in: ['SUCCESS', 'REFUNDED'] } } }),
    prisma.franchiseStockTxn.count({ where: { refId: orderId } }),
    prisma.franchiseCommission.count({ where: { orderId } }),
  ]);
  const why: string[] = [];
  if (NEVER_DELETE.includes(o.status)) why.push(`The order is ${o.status.toLowerCase().replace('_', ' ')} — paid orders are kept for GST and BV. Use a return instead`);
  else if (!['PENDING_PAYMENT', 'CANCELLED'].includes(o.status)) why.push(`Status ${o.status} cannot be deleted`);
  if (o.invoiceNo) why.push(`Invoice ${o.invoiceNo} has been issued`);
  if (o.paidAt) why.push('Payment was received');
  if (paidPayments) why.push(`${paidPayments} successful / refunded payment(s)`);
  if (o._count.bvPostings) why.push(`${o._count.bvPostings} BV posting(s)`);
  if (o._count.returns) why.push(`${o._count.returns} return request(s)`);
  if (stockMoves) why.push(`${stockMoves} franchise stock movement(s)`);
  if (commission) why.push('Franchise commission was created');
  return { order: o, blockers: [...new Set(why)] };
}

const snapshot = (o: { orderNo: string; type: string; status: string; grandTotal: unknown; bvTotal: unknown; memberId: string | null; franchiseId: string | null; createdAt: Date }) => ({
  orderNo: o.orderNo, type: o.type, status: o.status, amount: String(o.grandTotal), bv: String(o.bvTotal), memberId: o.memberId, franchiseId: o.franchiseId, createdAt: o.createdAt,
});

/** Cancel an unpaid order. `memberId` = only that member's own order. */
export async function cancelOrder(orderId: string, req: Request, opts: { reason: string; memberId?: string; by: 'MEMBER' | 'ADMIN' }) {
  const o = await prisma.order.findUnique({ where: { id: orderId } });
  if (!o || (opts.memberId && o.memberId !== opts.memberId)) throw notFound('Order');
  if (o.status === 'CANCELLED') throw badRequest(`Order ${o.orderNo} is already cancelled`);
  if (o.status !== 'PENDING_PAYMENT') throw badRequest(`Order ${o.orderNo} is ${o.status.toLowerCase().replace('_', ' ')}. Paid orders cannot be cancelled — request a return instead.`);
  await prisma.$transaction(async (tx) => {
    // atomic: if a payment lands at the same moment, only one of the two wins
    const r = await tx.order.updateMany({ where: { id: o.id, status: 'PENDING_PAYMENT', paidAt: null }, data: { status: 'CANCELLED' } });
    if (r.count !== 1) throw badRequest(`Order ${o.orderNo} was just paid or changed — refresh the page`);
    await tx.payment.updateMany({ where: { orderId: o.id, status: 'CREATED' }, data: { status: 'FAILED' } });
    await audit(req, 'ORDER.CANCEL', 'Order', o.id, snapshot(o), { status: 'CANCELLED', by: opts.by, reason: opts.reason }, tx);
  });
  return { ok: true, orderNo: o.orderNo };
}

/** Delete an order that never became a sale. `memberId` = only that member's own CANCELLED order. */
export async function deleteOrder(orderId: string, req: Request, opts: { reason: string; memberId?: string; by: 'MEMBER' | 'ADMIN' }) {
  const { order: o, blockers } = await orderDeleteBlockers(orderId);
  if (opts.memberId) {
    if (o.memberId !== opts.memberId) throw notFound('Order');
    if (o.status !== 'CANCELLED') throw badRequest('Cancel the order first; only cancelled orders can be removed');
  }
  if (blockers.length) throw badRequest(`Order ${o.orderNo} cannot be deleted: ${blockers.join('; ')}.`);
  await prisma.$transaction(
    async (tx) => {
      // re-check inside the transaction: still unpaid and not invoiced
      const still = await tx.order.findUnique({ where: { id: o.id }, select: { status: true, invoiceNo: true, paidAt: true } });
      if (!still || !['PENDING_PAYMENT', 'CANCELLED'].includes(still.status) || still.invoiceNo || still.paidAt) throw badRequest(`Order ${o.orderNo} changed — refresh the page`);
      await tx.payment.deleteMany({ where: { orderId: o.id, status: { in: ['CREATED', 'FAILED'] } } });
      await tx.orderItem.deleteMany({ where: { orderId: o.id } });
      await tx.order.delete({ where: { id: o.id } });
      await audit(req, 'ORDER.DELETE', 'Order', o.id, { ...snapshot(o), member: o.member?.distributorCode ?? null, items: o._count.items }, { by: opts.by, reason: opts.reason }, tx);
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
  return { ok: true, orderNo: o.orderNo };
}
