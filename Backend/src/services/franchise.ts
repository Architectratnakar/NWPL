import { Prisma, type FranchiseStockTxnType } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma';
import { badRequest, notFound } from '../lib/http';
import { nextCounter } from '../lib/counters';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export const nextFranchiseCode = async (db: Tx) => `FR${String(await nextCounter(db, 'franchise_code', 1)).padStart(4, '0')}`;

/**
 * Move stock in or out of a franchise and write the ledger row.
 * delta > 0 = into the franchise, delta < 0 = out of it. Never lets franchise stock go below zero.
 */
export async function moveFranchiseStock(
  db: Tx,
  franchiseId: string,
  productId: number,
  delta: number,
  type: FranchiseStockTxnType,
  createdBy: string,
  refId?: string | null,
  note?: string | null,
) {
  if (!Number.isInteger(delta) || delta === 0) throw badRequest('Quantity must be a whole number');
  let balance: number;
  if (delta > 0) {
    const row = await db.franchiseStock.upsert({
      where: { franchiseId_productId: { franchiseId, productId } },
      create: { franchiseId, productId, qty: delta },
      update: { qty: { increment: delta } },
    });
    balance = row.qty;
  } else {
    // atomic: only succeeds if enough stock is there
    const r = await db.franchiseStock.updateMany({ where: { franchiseId, productId, qty: { gte: -delta } }, data: { qty: { increment: delta } } });
    if (r.count !== 1) {
      const p = await db.product.findUnique({ where: { id: productId }, select: { name: true } });
      const have = await db.franchiseStock.findUnique({ where: { franchiseId_productId: { franchiseId, productId } } });
      throw badRequest(`Not enough franchise stock of ${p?.name ?? `product ${productId}`} (available ${have?.qty ?? 0}, needed ${-delta})`);
    }
    balance = (await db.franchiseStock.findUniqueOrThrow({ where: { franchiseId_productId: { franchiseId, productId } } })).qty;
  }
  await db.franchiseStockTxn.create({ data: { franchiseId, productId, type, qty: delta, balanceAfter: balance, refId: refId ?? null, note: note ?? null, createdBy } });
  return balance;
}

/** Company stock → franchise (ALLOT) or franchise → company (TAKE_BACK). */
export async function transferStock(franchiseId: string, items: { productId: number; qty: number }[], direction: 'ALLOT' | 'TAKE_BACK', userId: string, note?: string) {
  const f = await prisma.franchise.findUnique({ where: { id: franchiseId } });
  if (!f) throw notFound('Franchise');
  if (direction === 'ALLOT' && f.status !== 'ACTIVE') throw badRequest('Stock can only be allotted to an ACTIVE franchise');
  const merged = new Map<number, number>();
  for (const i of items) merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.qty);
  return prisma.$transaction(async (tx) => {
    for (const [productId, qty] of merged) {
      if (qty <= 0) continue;
      if (direction === 'ALLOT') {
        const r = await tx.product.updateMany({ where: { id: productId, stock: { gte: qty } }, data: { stock: { decrement: qty } } });
        if (r.count !== 1) {
          const p = await tx.product.findUnique({ where: { id: productId }, select: { name: true, stock: true } });
          if (!p) throw badRequest(`Product ${productId} not found`);
          throw badRequest(`Company stock of ${p.name} is only ${p.stock}`);
        }
        await moveFranchiseStock(tx, franchiseId, productId, qty, 'ALLOT', userId, null, note);
      } else {
        await moveFranchiseStock(tx, franchiseId, productId, -qty, 'TAKE_BACK', userId, null, note);
        await tx.product.update({ where: { id: productId }, data: { stock: { increment: qty } } });
      }
    }
    return { ok: true, products: merged.size };
  });
}

/** Called inside markOrderPaid for an order sold at a franchise counter. */
export async function franchiseSaleStockOut(tx: Tx, order: { id: string; franchiseId: string; orderNo: string }, items: { productId: number; qty: number }[], userId: string) {
  const f = await tx.franchise.findUniqueOrThrow({ where: { id: order.franchiseId } });
  if (f.status !== 'ACTIVE') throw badRequest('This franchise is not active');
  for (const it of items) await moveFranchiseStock(tx, f.id, it.productId, -it.qty, 'SALE', userId, order.id, `Sale ${order.orderNo}`);
}

/** Commission on the taxable value of a franchise sale (PENDING until finance marks it paid). */
export async function createFranchiseCommission(tx: Tx, order: { id: string; franchiseId: string; subTotal: Prisma.Decimal }) {
  const f = await tx.franchise.findUniqueOrThrow({ where: { id: order.franchiseId }, select: { commissionPercent: true } });
  const amount = D(order.subTotal).mul(f.commissionPercent).div(100).toDecimalPlaces(2);
  return tx.franchiseCommission.upsert({
    where: { orderId: order.id },
    create: { franchiseId: order.franchiseId, orderId: order.id, saleAmount: order.subTotal, percent: f.commissionPercent, amount },
    update: {},
  });
}

/** Approved return of a franchise sale: goods go back to the franchise, unpaid commission is cancelled. */
export async function franchiseReturnStockIn(tx: Tx, order: { id: string; franchiseId: string; orderNo: string }, items: { productId: number; qty: number }[], userId: string) {
  for (const it of items) await moveFranchiseStock(tx, order.franchiseId, it.productId, it.qty, 'RETURN', userId, order.id, `Return ${order.orderNo}`);
  await tx.franchiseCommission.updateMany({ where: { orderId: order.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
}
