import { Prisma, type IncomeType } from '@prisma/client';
import type { Tx } from '../lib/prisma';
import { badRequest } from '../lib/http';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** Credit a wallet. The unique (refType, refId, type) index makes this idempotent at DB level. */
export async function creditWallet(
  db: Tx,
  memberId: string,
  amount: Prisma.Decimal.Value,
  refType: string,
  refId: string,
  incomeType: IncomeType | null = null,
  note?: string,
) {
  const amt = D(amount);
  if (amt.lte(0)) return null;
  const w = await db.wallet.upsert({
    where: { memberId },
    create: { memberId, balance: amt },
    update: { balance: { increment: amt } },
  });
  return db.walletTxn.create({
    data: { memberId, type: 'CREDIT', incomeType, amount: amt, balanceAfter: w.balance, refType, refId, note },
  });
}

/** Debit a wallet; fails if the balance is too low (checked atomically). */
export async function debitWallet(db: Tx, memberId: string, amount: Prisma.Decimal.Value, refType: string, refId: string, note?: string) {
  const amt = D(amount);
  const updated = await db.wallet.updateMany({ where: { memberId, balance: { gte: amt } }, data: { balance: { decrement: amt } } });
  if (updated.count !== 1) throw badRequest('Insufficient wallet balance');
  const w = await db.wallet.findUniqueOrThrow({ where: { memberId } });
  return db.walletTxn.create({
    data: { memberId, type: 'DEBIT', amount: amt, balanceAfter: w.balance, refType, refId, note },
  });
}
