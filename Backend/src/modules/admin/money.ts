import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createModule, PageQuery } from '../../lib/openapi';
import { ROLES } from '../../lib/auth';
import { badRequest, notFound } from '../../lib/http';
import { audit } from '../../lib/audit';
import { getSettings, DEFAULT_SETTINGS } from '../../lib/settings';
import { decrypt } from '../../lib/crypto';
import { approveClosing, deleteClosing, postClosing, runClosing } from '../../engine/closing';
import { propagatePending } from '../../engine/bv';
import { creditWallet } from '../../services/wallet';
import type { TicketMessage } from '../tickets';

/* ======================= CLOSINGS ======================= */
export const closings = createModule('/admin/closings', 'Admin · Closings');

closings.get('/', {
  summary: 'Closing runs',
  access: ROLES.REPORTS,
  query: PageQuery,
  handler: async ({ query }) => {
    const [items, total] = await Promise.all([
      prisma.closing.findMany({ orderBy: { periodStart: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { _count: { select: { lines: true } } } }),
      prisma.closing.count(),
    ]);
    const ids = [...new Set(items.flatMap((c) => [c.runBy, c.approvedBy]).filter(Boolean))] as string[];
    const people = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
    const name = (id: string | null) => people.find((p) => p.id === id)?.email ?? id;
    return { items: items.map((c) => ({ ...c, runByName: name(c.runBy), approvedByName: name(c.approvedBy) })), total, page: query.page, pageSize: query.pageSize };
  },
});

closings.post('/run', {
  summary: 'Calculate a closing (preview). Default period = today in IST.',
  access: ROLES.FINANCE.concat(['ADMIN_OPS']),
  body: z.object({ periodStart: z.coerce.date().optional(), periodEnd: z.coerce.date().optional() }),
  handler: async ({ body, user, req }) => {
    const istMidnight = new Date(Date.now() - ((Date.now() + 330 * 60_000) % 86_400_000));
    const start = body.periodStart ?? istMidnight;
    const end = body.periodEnd ?? new Date(start.getTime() + 86_400_000);
    const c = await runClosing(start, end, user.id);
    await audit(req, 'CLOSING.RUN', 'Closing', c.id, undefined, { periodStart: start, periodEnd: end, totalPayout: c.totalPayout });
    return c;
  },
});

closings.get('/:id', {
  summary: 'Closing with its lines (preview or posted)',
  access: ROLES.REPORTS,
  query: PageQuery.extend({ type: z.string().optional() }),
  handler: async ({ params, query }) => {
    const c = await prisma.closing.findUnique({ where: { id: params.id } });
    if (!c) throw notFound('Closing');
    const where: Prisma.ClosingLineWhereInput = { closingId: c.id, incomeType: (query.type as never) || undefined };
    const [lines, total, byType] = await Promise.all([
      prisma.closingLine.findMany({ where, orderBy: { amount: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { member: { select: { distributorCode: true, fullName: true, packageTier: true } } } }),
      prisma.closingLine.count({ where }),
      prisma.closingLine.groupBy({ by: ['incomeType'], where: { closingId: c.id }, _sum: { amount: true, pairs: true, flushed: true }, _count: true }),
    ]);
    return { closing: c, byType, lines: { items: lines, total, page: query.page, pageSize: query.pageSize } };
  },
});

closings.post('/:id/approve', {
  summary: 'Approve a previewed closing (must be a different person from who ran it)',
  access: ROLES.FINANCE,
  handler: async ({ params, user, req }) => {
    const c = await approveClosing(params.id, user.id);
    await audit(req, 'CLOSING.APPROVE', 'Closing', c.id);
    return c;
  },
});

closings.post('/:id/post', {
  summary: 'Post an approved closing: credit wallets, update carry & caps, award ranks',
  access: ROLES.FINANCE,
  handler: async ({ params, req }) => {
    const c = await postClosing(params.id);
    await audit(req, 'CLOSING.POST', 'Closing', params.id, undefined, { totalPayout: c?.totalPayout });
    return c;
  },
});

closings.delete('/:id', {
  summary: 'Delete a closing that is not yet posted (to re-run it)',
  access: ROLES.FINANCE.concat(['ADMIN_OPS']),
  handler: async ({ params, req }) => {
    const r = await deleteClosing(params.id);
    await audit(req, 'CLOSING.DELETE', 'Closing', params.id);
    return r;
  },
});

closings.post('/propagate', {
  summary: 'Push any pending BV up the tree now (normally done by the worker)',
  access: ROLES.FINANCE.concat(['ADMIN_OPS']),
  handler: async () => ({ processed: await propagatePending() }),
});

/* ======================= WITHDRAWALS ======================= */
export const withdrawals = createModule('/admin/withdrawals', 'Admin · Withdrawals');

withdrawals.get('/', {
  summary: 'Withdrawal requests',
  access: ROLES.FINANCE,
  query: PageQuery.extend({ status: z.enum(['REQUESTED', 'APPROVED', 'PAID', 'REJECTED']).optional() }),
  handler: async ({ query }) => {
    const where = { status: query.status };
    const [items, total, sums] = await Promise.all([
      prisma.withdrawal.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { wallet: { include: { member: { select: { distributorCode: true, fullName: true, kycStatus: true, bank: { select: { accountLast4: true, ifsc: true, bankName: true, verified: true } } } } } } } }),
      prisma.withdrawal.count({ where }),
      prisma.withdrawal.groupBy({ by: ['status'], _sum: { net: true }, _count: true }),
    ]);
    return { items: items.map(({ wallet, ...w }) => ({ ...w, member: wallet.member })), total, page: query.page, pageSize: query.pageSize, summary: sums };
  },
});

withdrawals.post('/:id/decision', {
  summary: 'Approve, reject (refund to wallet) or mark paid with bank UTR',
  access: ROLES.FINANCE,
  body: z.object({ action: z.enum(['APPROVE', 'REJECT', 'PAID']), utr: z.string().optional(), reason: z.string().optional() }),
  handler: async ({ params, body, user, req }) => {
    const w = await prisma.withdrawal.findUnique({ where: { id: params.id } });
    if (!w) throw notFound('Withdrawal');
    if (body.action === 'APPROVE') {
      if (w.status !== 'REQUESTED') throw badRequest('Only new requests can be approved');
      await prisma.withdrawal.update({ where: { id: w.id }, data: { status: 'APPROVED', approvedBy: user.id } });
    } else if (body.action === 'PAID') {
      if (w.status !== 'APPROVED') throw badRequest('Approve the request first');
      if (!body.utr) throw badRequest('Enter the bank UTR / reference number');
      await prisma.withdrawal.update({ where: { id: w.id }, data: { status: 'PAID', utr: body.utr, paidAt: new Date() } });
    } else {
      if (!['REQUESTED', 'APPROVED'].includes(w.status)) throw badRequest('This request cannot be rejected');
      await prisma.$transaction(async (tx) => {
        await tx.withdrawal.update({ where: { id: w.id }, data: { status: 'REJECTED', approvedBy: user.id } });
        await creditWallet(tx, w.memberId, w.gross, 'WITHDRAWAL_REVERSAL', w.id, null, `Withdrawal rejected${body.reason ? ': ' + body.reason : ''}`);
      });
    }
    await audit(req, `WITHDRAWAL.${body.action}`, 'Withdrawal', w.id, { status: w.status }, body);
    return { ok: true };
  },
});

withdrawals.get('/bank-file', {
  summary: 'CSV bank upload file for all APPROVED withdrawals',
  access: ROLES.FINANCE,
  raw: true,
  handler: async ({ res, req }) => {
    const list = await prisma.withdrawal.findMany({ where: { status: 'APPROVED' }, include: { wallet: { include: { member: { include: { bank: true } } } } } });
    const rows = [['WithdrawalId', 'DistributorID', 'Name', 'AccountHolder', 'AccountNumber', 'IFSC', 'NetAmount']];
    for (const w of list) {
      const m = w.wallet.member;
      rows.push([w.id, m.distributorCode, m.fullName, m.bank?.holderName ?? '', m.bank ? decrypt(m.bank.accountNoEnc) : '', m.bank?.ifsc ?? '', w.net.toString()]);
    }
    await audit(req, 'WITHDRAWAL.BANK_FILE', 'Withdrawal', 'bulk', undefined, { count: list.length });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="bank-file-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));
  },
});

/* ======================= PLAN SETTINGS ======================= */
export const settings = createModule('/admin/settings', 'Admin · Plan settings');

settings.get('/current', { summary: 'Plan settings in force', access: ROLES.STAFF, handler: () => getSettings() });

settings.get('/history', {
  summary: 'All versions',
  access: ROLES.STAFF,
  handler: () => prisma.planSetting.findMany({ orderBy: { version: 'desc' } }),
});

settings.post('/', {
  summary: 'Save a NEW version of the plan settings (old versions are kept)',
  access: ROLES.SUPER,
  body: z.object({ values: z.record(z.any()), effectiveFrom: z.coerce.date().optional() }),
  handler: async ({ body, user, req }) => {
    const merged = { ...DEFAULT_SETTINGS, ...(body.values as object) };
    const last = await prisma.planSetting.findFirst({ orderBy: { version: 'desc' } });
    const row = await prisma.planSetting.create({
      data: { version: (last?.version ?? 0) + 1, values: merged as Prisma.InputJsonValue, effectiveFrom: body.effectiveFrom ?? new Date(), createdBy: user.id },
    });
    await audit(req, 'SETTINGS.NEW_VERSION', 'PlanSetting', String(row.version), last?.values, merged);
    return row;
  },
});

/* ======================= REPORTS ======================= */
export const reports = createModule('/admin/reports', 'Admin · Reports');

const toCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return 'no data';
  const cols = Object.keys(rows[0]);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
};

reports.get('/:type', {
  summary: 'Reports: joinings | sales | payouts | top-earners | tds | income-disclosure. Add ?format=csv to download.',
  access: ROLES.REPORTS,
  raw: true,
  query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), format: z.enum(['json', 'csv']).default('json') }),
  handler: async ({ params, query, res }) => {
    const from = query.from ?? new Date(Date.now() - 30 * 86_400_000);
    const to = query.to ?? new Date(Date.now() + 86_400_000);
    let rows: Record<string, unknown>[] = [];
    switch (params.type) {
      case 'joinings':
        rows = (await prisma.member.findMany({ where: { createdAt: { gte: from, lt: to } }, orderBy: { createdAt: 'desc' }, include: { sponsor: { select: { distributorCode: true } }, user: { select: { mobile: true } } } })).map((m) => ({
          date: m.createdAt.toISOString().slice(0, 10), code: m.distributorCode, name: m.fullName, mobile: m.user.mobile, sponsor: m.sponsor?.distributorCode, side: m.side, tier: m.packageTier, status: m.status,
        }));
        break;
      case 'sales':
        rows = (await prisma.order.findMany({ where: { paidAt: { gte: from, lt: to } }, orderBy: { paidAt: 'desc' }, include: { member: { select: { distributorCode: true } } } })).map((o) => ({
          date: o.paidAt?.toISOString().slice(0, 10), invoice: o.invoiceNo, order: o.orderNo, member: o.member?.distributorCode, type: o.type, status: o.status, taxable: o.subTotal, gst: o.gstTotal, total: o.grandTotal, bv: o.bvTotal,
        }));
        break;
      case 'payouts':
        rows = (await prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT to_char(c."periodStart" + interval '330 minutes','YYYY-MM-DD') AS date, m."distributorCode" AS member, m."fullName" AS name, l."incomeType"::text AS type, l."pairs", l."flushed", l."amount"
          FROM "ClosingLine" l JOIN "Closing" c ON c."id" = l."closingId" JOIN "Member" m ON m."id" = l."memberId"
          WHERE c."status" = 'POSTED' AND c."periodStart" >= ${from} AND c."periodStart" < ${to} ORDER BY c."periodStart" DESC, l."amount" DESC`);
        break;
      case 'top-earners':
        rows = await prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT m."distributorCode" AS member, m."fullName" AS name, m."packageTier"::text AS tier, SUM(t."amount") AS income
          FROM "WalletTxn" t JOIN "Member" m ON m."id" = t."memberId"
          WHERE t."type" = 'CREDIT' AND t."incomeType" IS NOT NULL AND t."createdAt" >= ${from} AND t."createdAt" < ${to}
          GROUP BY 1, 2, 3 ORDER BY income DESC LIMIT 100`;
        break;
      case 'tds':
        rows = (await prisma.withdrawal.findMany({ where: { createdAt: { gte: from, lt: to }, status: { in: ['APPROVED', 'PAID'] } }, include: { wallet: { include: { member: { select: { distributorCode: true, fullName: true } } } } } })).map((w) => ({
          date: w.createdAt.toISOString().slice(0, 10), member: w.wallet.member.distributorCode, name: w.wallet.member.fullName, gross: w.gross, tds: w.tds, adminCharge: w.adminCharge, net: w.net, status: w.status, utr: w.utr,
        }));
        break;
      case 'income-disclosure': {
        // realistic earnings statement: distribution of income across ACTIVE distributors
        const r = await prisma.$queryRaw<Record<string, unknown>[]>`
          WITH inc AS (
            SELECT m."id", COALESCE(SUM(t."amount") FILTER (WHERE t."type" = 'CREDIT' AND t."incomeType" IS NOT NULL AND t."createdAt" >= ${from} AND t."createdAt" < ${to}), 0) AS income
            FROM "Member" m LEFT JOIN "WalletTxn" t ON t."memberId" = m."id" WHERE m."status" = 'ACTIVE' GROUP BY m."id")
          SELECT CASE WHEN income = 0 THEN '₹0' WHEN income < 1000 THEN '₹1 – 999' WHEN income < 10000 THEN '₹1,000 – 9,999'
                      WHEN income < 100000 THEN '₹10,000 – 99,999' ELSE '₹1,00,000+' END AS band,
                 COUNT(*) AS distributors, ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS percent, ROUND(AVG(income), 2) AS average_income
          FROM inc GROUP BY 1 ORDER BY MIN(income)`;
        rows = r;
        break;
      }
      default:
        throw notFound('Report');
    }
    rows = JSON.parse(JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${params.type}-report.csv"`);
      res.send(toCsv(rows));
    } else res.json({ data: { type: params.type, from, to, rows } });
  },
});

/* ======================= SUPPORT ======================= */
export const tickets = createModule('/admin/tickets', 'Admin · Support');

tickets.get('/', {
  summary: 'All tickets',
  access: ROLES.SUPPORT,
  query: PageQuery.extend({ status: z.enum(['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED']).optional() }),
  handler: async ({ query }) => {
    const where = { status: query.status };
    const [items, total] = await Promise.all([
      prisma.ticket.findMany({ where, orderBy: [{ slaDueAt: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { member: { select: { distributorCode: true, fullName: true } } } }),
      prisma.ticket.count({ where }),
    ]);
    return { items: items.map((t) => ({ ...t, lastMessage: (t.messages as unknown as TicketMessage[]).at(-1) ?? null, overdue: !!t.slaDueAt && t.slaDueAt < new Date() && !['RESOLVED', 'CLOSED'].includes(t.status) })), total, page: query.page, pageSize: query.pageSize };
  },
});
