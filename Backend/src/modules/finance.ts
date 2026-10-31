import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createModule, memberOnly, PageQuery } from '../lib/openapi';
import { badRequest } from '../lib/http';
import { getSettings } from '../lib/settings';
import { debitWallet } from '../services/wallet';
import { audit } from '../lib/audit';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const IncomeTypes = z.enum(['PAIR_MATCHING', 'RANK_BONUS', 'SPECIAL_BONUS', 'RETAIL_PROFIT', 'LEADERSHIP', 'ROYALTY', 'LEVEL_REWARD', 'AUTOPOOL', 'ADJUSTMENT']);

const m = createModule('/finance', 'Income & wallet');

m.get('/income', {
  summary: 'My income lines from posted closings, with the calculation breakdown',
  query: PageQuery.extend({ type: IncomeTypes.optional() }),
  handler: async ({ user, query }) => {
    const where: Prisma.ClosingLineWhereInput = { memberId: memberOnly(user), incomeType: query.type, closing: { status: 'POSTED' } };
    const [items, total, sums] = await Promise.all([
      prisma.closingLine.findMany({ where, orderBy: { closing: { periodStart: 'desc' } }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { closing: { select: { periodStart: true, periodEnd: true } } } }),
      prisma.closingLine.count({ where }),
      prisma.closingLine.groupBy({ by: ['incomeType'], where: { memberId: memberOnly(user), closing: { status: 'POSTED' } }, _sum: { amount: true, pairs: true } }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize, summary: sums.map((s) => ({ type: s.incomeType, amount: s._sum.amount, pairs: s._sum.pairs })) };
  },
});

m.get('/wallet', {
  summary: 'Wallet balance and ledger',
  query: PageQuery.extend({ type: z.enum(['CREDIT', 'DEBIT']).optional() }),
  handler: async ({ user, query }) => {
    const memberId = memberOnly(user);
    const where = { memberId, type: query.type };
    const [wallet, items, total, s, member] = await Promise.all([
      prisma.wallet.findUniqueOrThrow({ where: { memberId } }),
      prisma.walletTxn.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.walletTxn.count({ where }),
      getSettings(),
      prisma.member.findUniqueOrThrow({ where: { id: memberId }, select: { kycStatus: true, bank: { select: { accountLast4: true, ifsc: true, verified: true } } } }),
    ]);
    return {
      wallet, items, total, page: query.page, pageSize: query.pageSize,
      rules: { minAmount: s.values.withdrawal.minAmount, tdsPercent: s.values.deductions.tdsPercent ?? 0, adminChargePercent: s.values.deductions.adminChargePercent, allowedDays: s.values.withdrawal.enforceDays ? s.values.withdrawal.allowedDays : null },
      kycStatus: member.kycStatus, bank: member.bank,
    };
  },
});

m.post('/withdrawals', {
  summary: 'Request a withdrawal to my bank account',
  body: z.object({ amount: z.number().positive() }),
  handler: async ({ user, body, req }) => {
    const memberId = memberOnly(user);
    const { values: s } = await getSettings();
    const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId }, include: { bank: true, wallet: true } });
    if (member.kycStatus !== 'APPROVED') throw badRequest('Your KYC must be approved before you can withdraw');
    if (!member.bank) throw badRequest('Add your bank account first');
    if (member.wallet?.onHold) throw badRequest('Your wallet is on hold. Please contact support.');
    if (body.amount < s.withdrawal.minAmount) throw badRequest(`Minimum withdrawal is ₹${s.withdrawal.minAmount}`);
    if (s.withdrawal.enforceDays) {
      const day = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date(Date.now() + 330 * 60_000).getUTCDay()];
      if (!s.withdrawal.allowedDays.includes(day)) throw badRequest(`Withdrawals are allowed on: ${s.withdrawal.allowedDays.join(', ')}`);
    }
    const gross = D(body.amount).toDecimalPlaces(2);
    const tds = gross.mul(s.deductions.tdsPercent ?? 0).div(100).toDecimalPlaces(2);
    const admin = gross.mul(s.deductions.adminChargePercent).div(100).toDecimalPlaces(2);
    const net = gross.sub(tds).sub(admin);
    const w = await prisma.$transaction(async (tx) => {
      const wd = await tx.withdrawal.create({ data: { memberId, gross, tds, adminCharge: admin, net } });
      await debitWallet(tx, memberId, gross, 'WITHDRAWAL', wd.id, `Withdrawal request (net ₹${net})`);
      return wd;
    });
    await audit(req, 'WITHDRAWAL.REQUEST', 'Withdrawal', w.id, undefined, { gross, net });
    return w;
  },
});

m.get('/withdrawals', {
  summary: 'My withdrawals',
  query: PageQuery,
  handler: async ({ user, query }) => {
    const where = { memberId: memberOnly(user) };
    const [items, total] = await Promise.all([
      prisma.withdrawal.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.withdrawal.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
});

export default m;
