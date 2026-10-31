import { Prisma, type OrderType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/http';
import { nextInvoiceNo, nextOrderNo } from '../lib/counters';
import { propagatePosting } from '../engine/bv';
import { getSettings } from '../lib/settings';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** Current price row of every product */
export async function currentPrices(productIds?: number[]) {
  const now = new Date();
  const prices = await prisma.productPrice.findMany({
    where: { productId: productIds ? { in: productIds } : undefined, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    orderBy: { effectiveFrom: 'desc' },
  });
  const map = new Map<number, (typeof prices)[number]>();
  for (const p of prices) if (!map.has(p.productId)) map.set(p.productId, p);
  return map;
}

/** GST included in a GST-inclusive amount */
const gstPart = (gross: Prisma.Decimal, rate: Prisma.Decimal.Value) => gross.sub(gross.div(D(1).add(D(rate).div(100)))).toDecimalPlaces(2);

export interface CreateOrderInput {
  memberId: string;
  type: OrderType;
  packageCode?: string;
  items?: { productId: number; qty: number }[];
  shipping?: Record<string, string>;
}

export async function createOrder(input: CreateOrderInput) {
  const member = await prisma.member.findUnique({ where: { id: input.memberId } });
  if (!member) throw notFound('Member');
  if (member.status === 'BLOCKED' || member.status === 'TERMINATED') throw badRequest('Your ID is not active');

  let packageId: number | null = null;
  let lines: { productId: number; qty: number; unitPrice: Prisma.Decimal; unitBv: Prisma.Decimal; gstRate: Prisma.Decimal }[] = [];
  let grand = D(0);
  let bv = D(0);

  if (input.type === 'JOINING' || input.type === 'UPGRADE') {
    const pkg = await prisma.package.findUnique({ where: { code: input.packageCode ?? '' }, include: { items: { include: { product: true } } } });
    if (!pkg || !pkg.isActive) throw badRequest('Package not found');
    if (input.type === 'JOINING') {
      if (pkg.isUpgrade) throw badRequest('Choose a joining package, not an upgrade');
      if (member.packageTier !== 'NONE') throw badRequest('Your ID is already activated');
    } else {
      if (!pkg.isUpgrade) throw badRequest('Choose the upgrade package');
      if (member.packageTier !== 'BASIC') throw badRequest('Only 40 BV IDs can upgrade');
    }
    const pending = await prisma.order.findFirst({ where: { memberId: member.id, type: input.type, status: 'PENDING_PAYMENT' } });
    if (pending) return pending; // reuse the unpaid order
    packageId = pkg.id;
    grand = D(pkg.price);
    bv = D(pkg.bv);
    // the package price covers the bundled products; item prices are shown as 0 (bundle)
    lines = pkg.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: D(0), unitBv: D(0), gstRate: i.product.gstRate }));
  } else {
    if (!input.items?.length) throw badRequest('Add at least one product');
    if (input.type === 'REPURCHASE' && member.packageTier === 'NONE') throw badRequest('Activate your ID first');
    const products = await prisma.product.findMany({ where: { id: { in: input.items.map((i) => i.productId) }, isActive: true } });
    const prices = await currentPrices(products.map((p) => p.id));
    for (const it of input.items) {
      const p = products.find((x) => x.id === it.productId);
      const pr = prices.get(it.productId);
      if (!p || !pr) throw badRequest(`Product ${it.productId} is not available`);
      const unit = input.type === 'RETAIL' ? pr.mrp : pr.dp;
      lines.push({ productId: p.id, qty: it.qty, unitPrice: unit, unitBv: input.type === 'RETAIL' ? D(0) : pr.bv, gstRate: p.gstRate });
      grand = grand.add(unit.mul(it.qty));
      bv = bv.add((input.type === 'RETAIL' ? D(0) : pr.bv).mul(it.qty));
    }
  }

  const gst = lines.length ? gstPart(grand, lines[0].gstRate) : gstPart(grand, 18);
  return prisma.$transaction(async (tx) =>
    tx.order.create({
      data: {
        orderNo: await nextOrderNo(tx),
        memberId: member.id,
        type: input.type,
        packageId,
        subTotal: grand.sub(gst),
        gstTotal: gst,
        grandTotal: grand,
        bvTotal: bv,
        shipping: input.shipping ?? undefined,
        items: { create: lines },
      },
      include: { items: true },
    }),
  );
}

/**
 * Called when the payment gateway confirms payment (here: the DEMO gateway).
 * Idempotent: paying an already-paid order does nothing.
 */
export async function markOrderPaid(orderId: string, gateway = 'DEMO', gatewayRef?: string) {
  const posting = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound('Order');
    if (order.status !== 'PENDING_PAYMENT') return null;

    await tx.payment.create({ data: { orderId, gateway, gatewayRef: gatewayRef ?? `${gateway}-${orderId}`, amount: order.grandTotal, status: 'SUCCESS' } });
    await tx.order.update({ where: { id: orderId }, data: { status: 'INVOICED', paidAt: new Date(), invoiceNo: await nextInvoiceNo(tx) } });

    const member = await tx.member.findUniqueOrThrow({ where: { id: order.memberId! } });
    let tier = member.packageTier;
    let pairUnits = 0;
    if (order.type === 'JOINING' || order.type === 'UPGRADE') {
      const pkg = await tx.package.findUniqueOrThrow({ where: { id: order.packageId! } });
      tier = pkg.tier;
      if (order.type === 'JOINING') pairUnits = 1;
      await tx.member.update({
        where: { id: member.id },
        data: order.type === 'JOINING'
          ? { status: 'ACTIVE', packageTier: pkg.tier, activatedAt: new Date() }
          : { packageTier: pkg.tier, upgradedAt: new Date() },
      });
    }
    // stock out
    const items = await tx.orderItem.findMany({ where: { orderId } });
    for (const it of items) await tx.product.update({ where: { id: it.productId }, data: { stock: { decrement: it.qty } } });

    if (order.bvTotal.gt(0) || pairUnits) {
      return tx.bvPosting.create({ data: { memberId: member.id, orderId, bv: order.bvTotal, pairUnits, tier: order.type === 'UPGRADE' ? 'NONE' : tier } });
    }
    return null;
  });
  // In production a background worker does this; the demo does it immediately.
  if (posting) await prisma.$transaction((tx) => propagatePosting(tx, posting.id));
  return prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: true } }, payments: true } });
}

/** Approve a return: refund, reverse BV (and the joining unit), deactivate if it was the joining order. */
export async function approveReturn(returnId: string) {
  const posting = await prisma.$transaction(async (tx) => {
    const rr = await tx.returnRequest.findUnique({ where: { id: returnId }, include: { order: true } });
    if (!rr) throw notFound('Return request');
    if (rr.status !== 'REQUESTED') throw badRequest('Return is already processed');
    const order = rr.order;
    await tx.returnRequest.update({ where: { id: returnId }, data: { status: 'REFUNDED' } });
    await tx.order.update({ where: { id: order.id }, data: { status: 'RETURNED' } });
    await tx.payment.updateMany({ where: { orderId: order.id, status: 'SUCCESS' }, data: { status: 'REFUNDED' } });
    const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
    for (const it of items) await tx.product.update({ where: { id: it.productId }, data: { stock: { increment: it.qty } } });

    const original = await tx.bvPosting.findFirst({ where: { orderId: order.id, reversalOf: null } });
    if (order.type === 'JOINING') {
      await tx.member.update({ where: { id: order.memberId! }, data: { status: 'REGISTERED', packageTier: 'NONE' } });
    }
    if (original) {
      return tx.bvPosting.create({
        data: { memberId: original.memberId, orderId: order.id, bv: original.bv.neg(), pairUnits: -original.pairUnits, tier: original.tier, reversalOf: original.id },
      });
    }
    return null;
  });
  if (posting) await prisma.$transaction((tx) => propagatePosting(tx, posting.id));
  return { ok: true };
}

export async function requestReturn(orderId: string, memberId: string, reason: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.memberId !== memberId) throw notFound('Order');
  if (!order.paidAt || order.status === 'RETURNED' || order.status === 'CANCELLED') throw badRequest('This order cannot be returned');
  const { values: s } = await getSettings();
  const days = (Date.now() - order.paidAt.getTime()) / 86_400_000;
  if (days > s.coolingOffDays) throw badRequest(`Returns are allowed within ${s.coolingOffDays} days`);
  const open = await prisma.returnRequest.findFirst({ where: { orderId, status: 'REQUESTED' } });
  if (open) throw badRequest('A return request is already open for this order');
  return prisma.returnRequest.create({ data: { orderId, reason } });
}
