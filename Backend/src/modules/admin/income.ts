import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createModule, PageQuery } from '../../lib/openapi';
import { ROLES } from '../../lib/auth';
import { notFound } from '../../lib/http';

/**
 * Distributor income — Super Admin only.
 * Income = lines of POSTED closings (pair matching, rank bonus, special bonus, …),
 * filtered by the closing date.
 */
export const income = createModule('/admin/income', 'Admin · Distributor income');

const IncomeType = z.enum(['PAIR_MATCHING', 'RANK_BONUS', 'SPECIAL_BONUS', 'RETAIL_PROFIT', 'LEADERSHIP', 'ROYALTY', 'LEVEL_REWARD', 'AUTOPOOL', 'ADJUSTMENT']);
const DAY = 86_400_000;

const Filters = z.object({
  q: z.string().trim().optional().openapi({ description: 'Distributor ID, name or mobile' }),
  type: IncomeType.optional(),
  from: z.coerce.date().optional().openapi({ description: 'Closing date from (inclusive), default: all time' }),
  to: z.coerce.date().optional().openapi({ description: 'Closing date to (inclusive), default: today' }),
  sort: z.enum(['total', 'recent', 'name']).default('total'),
});

function period(from?: Date, to?: Date) {
  const start = from ?? new Date('2000-01-01T00:00:00Z');
  // "to" is a calendar day chosen in the UI → include the whole day
  const end = to ? new Date(to.getTime() + DAY) : new Date(Date.now() + DAY);
  return { start, end };
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

income.get('/', {
  summary: 'Income of all distributors (totals by type + one row per distributor). Add ?format=csv to download.',
  access: ROLES.SUPER,
  raw: true,
  query: PageQuery.merge(Filters).extend({ format: z.enum(['json', 'csv']).default('json') }),
  handler: async ({ query, res }) => {
    const { start, end } = period(query.from, query.to);
    const typeSql = query.type ? Prisma.sql`AND l."incomeType"::text = ${query.type}` : Prisma.empty;
    const like = query.q ? `%${query.q}%` : null;
    const searchSql = like
      ? Prisma.sql`AND (m."distributorCode" ILIKE ${like} OR m."fullName" ILIKE ${like} OR u."mobile" ILIKE ${like})`
      : Prisma.empty;
    const order =
      query.sort === 'recent' ? Prisma.sql`inc.last_at DESC, inc.total DESC` : query.sort === 'name' ? Prisma.sql`m."fullName" ASC` : Prisma.sql`inc.total DESC, m."distributorCode" ASC`;
    const csv = query.format === 'csv';
    const limit = csv ? 100_000 : query.pageSize;
    const offset = csv ? 0 : (query.page - 1) * query.pageSize;

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      WITH inc AS (
        SELECT l."memberId",
          SUM(l."amount") AS total,
          SUM(l."amount") FILTER (WHERE l."incomeType" = 'PAIR_MATCHING') AS pair_income,
          SUM(l."pairs")  FILTER (WHERE l."incomeType" = 'PAIR_MATCHING') AS pairs,
          SUM(l."flushed") FILTER (WHERE l."incomeType" = 'PAIR_MATCHING') AS flushed,
          SUM(l."amount") FILTER (WHERE l."incomeType" = 'RANK_BONUS') AS rank_bonus,
          SUM(l."amount") FILTER (WHERE l."incomeType" = 'SPECIAL_BONUS') AS special_bonus,
          SUM(l."amount") FILTER (WHERE l."incomeType" NOT IN ('PAIR_MATCHING', 'RANK_BONUS', 'SPECIAL_BONUS')) AS other_income,
          MAX(c."periodStart") AS last_at,
          COUNT(*) AS lines
        FROM "ClosingLine" l
        JOIN "Closing" c ON c."id" = l."closingId"
        WHERE c."status" = 'POSTED' AND c."periodStart" >= ${start} AND c."periodStart" < ${end} ${typeSql}
        GROUP BY l."memberId"
      )
      SELECT m."id", m."distributorCode" AS code, m."fullName" AS name, u."mobile", m."packageTier"::text AS tier,
             m."status"::text AS status, r."name" AS rank,
             inc.total, inc.pair_income, inc.pairs, inc.flushed, inc.rank_bonus, inc.special_bonus, inc.other_income,
             inc.last_at, inc.lines,
             COALESCE(w."balance", 0) AS wallet_balance, COALESCE(wd.withdrawn, 0) AS withdrawn,
             COUNT(*) OVER () AS total_count
      FROM inc
      JOIN "Member" m ON m."id" = inc."memberId"
      JOIN "User" u ON u."id" = m."userId"
      LEFT JOIN "Rank" r ON r."id" = m."currentRankId"
      LEFT JOIN "Wallet" w ON w."memberId" = m."id"
      LEFT JOIN (
        SELECT "memberId", SUM("gross") AS withdrawn FROM "Withdrawal"
        WHERE "status" IN ('REQUESTED', 'APPROVED', 'PAID') GROUP BY 1
      ) wd ON wd."memberId" = m."id"
      WHERE TRUE ${searchSql}
      ORDER BY ${order}
      LIMIT ${limit} OFFSET ${offset}`;

    const items = rows.map((r) => ({
      memberId: r.id as string,
      code: r.code as string,
      name: r.name as string,
      mobile: r.mobile as string,
      tier: r.tier as string,
      status: r.status as string,
      rank: (r.rank as string | null) ?? null,
      totalIncome: num(r.total),
      pairIncome: num(r.pair_income),
      pairs: num(r.pairs),
      flushed: num(r.flushed),
      rankBonus: num(r.rank_bonus),
      specialBonus: num(r.special_bonus),
      otherIncome: num(r.other_income),
      lastIncomeAt: r.last_at as Date | null,
      lines: num(r.lines),
      walletBalance: num(r.wallet_balance),
      withdrawn: num(r.withdrawn),
    }));

    if (csv) {
      const cols: [keyof (typeof items)[number], string][] = [
        ['code', 'Distributor ID'], ['name', 'Name'], ['mobile', 'Mobile'], ['tier', 'Package'], ['rank', 'Rank'], ['status', 'Status'],
        ['pairs', 'Pairs paid'], ['pairIncome', 'Pair income'], ['rankBonus', 'Rank bonus'], ['specialBonus', 'Special bonus'], ['otherIncome', 'Other'],
        ['totalIncome', 'Total income'], ['withdrawn', 'Withdrawn (all time)'], ['walletBalance', 'Wallet balance'], ['lastIncomeAt', 'Last income'],
      ];
      // dates in Indian Standard Time (closings are stored as IST midnight in UTC)
      const ist = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
      const esc = (v: unknown) => `"${String(v instanceof Date ? ist(v) : v ?? '').replace(/"/g, '""')}"`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="distributor-income-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send('﻿' + [cols.map((c) => c[1]).join(','), ...items.map((i) => cols.map((c) => esc(i[c[0]])).join(','))].join('\n'));
      return;
    }

    // Totals for the cards — same period, type AND search filter as the table
    const byType = await prisma.$queryRaw<{ type: string; amount: Prisma.Decimal; lines: bigint; pairs: bigint | null }[]>`
      SELECT l."incomeType"::text AS type, SUM(l."amount") AS amount, COUNT(*) AS lines, SUM(l."pairs") AS pairs
      FROM "ClosingLine" l JOIN "Closing" c ON c."id" = l."closingId"
      JOIN "Member" m ON m."id" = l."memberId" JOIN "User" u ON u."id" = m."userId"
      WHERE c."status" = 'POSTED' AND c."periodStart" >= ${start} AND c."periodStart" < ${end} ${typeSql} ${searchSql}
      GROUP BY 1 ORDER BY 2 DESC`;
    const [earners, active, wallets, paidOut] = await Promise.all([
      prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT l."memberId") AS n FROM "ClosingLine" l JOIN "Closing" c ON c."id" = l."closingId"
        JOIN "Member" m ON m."id" = l."memberId" JOIN "User" u ON u."id" = m."userId"
        WHERE c."status" = 'POSTED' AND l."amount" > 0 AND c."periodStart" >= ${start} AND c."periodStart" < ${end} ${typeSql} ${searchSql}`,
      prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM "Member" m JOIN "User" u ON u."id" = m."userId" WHERE m."status" = 'ACTIVE' ${searchSql}`,
      prisma.$queryRaw<{ s: Prisma.Decimal | null }[]>`
        SELECT SUM(w."balance") AS s FROM "Wallet" w JOIN "Member" m ON m."id" = w."memberId" JOIN "User" u ON u."id" = m."userId" WHERE TRUE ${searchSql}`,
      prisma.$queryRaw<{ s: Prisma.Decimal | null }[]>`
        SELECT SUM(wd."net") AS s FROM "Withdrawal" wd JOIN "Member" m ON m."id" = wd."memberId" JOIN "User" u ON u."id" = m."userId"
        WHERE wd."status" = 'PAID' AND wd."paidAt" >= ${start} AND wd."paidAt" < ${end} ${searchSql}`,
    ]);

    res.json({
      data: {
        period: { from: query.from ?? null, to: query.to ?? null },
        summary: {
          totalIncome: byType.reduce((a, t) => a + num(t.amount), 0),
          byType: byType.map((t) => ({ type: t.type, amount: num(t.amount), lines: num(t.lines), pairs: num(t.pairs) })),
          earners: num(earners[0]?.n),
          activeDistributors: num(active[0]?.n),
          walletBalance: num(wallets[0]?.s),
          paidOut: num(paidOut[0]?.s),
          filteredBySearch: !!query.q,
        },
        items,
        total: num(rows[0]?.total_count),
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  },
});

income.get('/:memberId', {
  summary: 'One distributor: income summary, every income line with its calculation, and withdrawals',
  access: ROLES.SUPER,
  query: PageQuery.merge(Filters.pick({ type: true, from: true, to: true })),
  handler: async ({ params, query }) => {
    const member = await prisma.member.findUnique({
      where: { id: params.memberId },
      include: {
        user: { select: { mobile: true, email: true } },
        currentRank: { select: { name: true } },
        sponsor: { select: { distributorCode: true, fullName: true } },
        wallet: true,
        volume: { select: { totalLeftBv: true, totalRightBv: true, totalLeftCount: true, totalRightCount: true } },
      },
    });
    if (!member) throw notFound('Distributor');
    const { start, end } = period(query.from, query.to);
    const where: Prisma.ClosingLineWhereInput = {
      memberId: member.id,
      incomeType: query.type,
      closing: { status: 'POSTED', periodStart: { gte: start, lt: end } },
    };
    const [lines, total, byType, withdrawals] = await Promise.all([
      prisma.closingLine.findMany({
        where,
        orderBy: [{ closing: { periodStart: 'desc' } }, { amount: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { closing: { select: { periodStart: true, periodEnd: true } } },
      }),
      prisma.closingLine.count({ where }),
      prisma.closingLine.groupBy({ by: ['incomeType'], where, _sum: { amount: true, pairs: true, flushed: true }, _count: true }),
      prisma.withdrawal.findMany({ where: { memberId: member.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return {
      member: {
        id: member.id, code: member.distributorCode, name: member.fullName, mobile: member.user.mobile, email: member.user.email,
        tier: member.packageTier, status: member.status, rank: member.currentRank?.name ?? null, kycStatus: member.kycStatus,
        sponsor: member.sponsor, joinedAt: member.createdAt, activatedAt: member.activatedAt,
        walletBalance: num(member.wallet?.balance), walletOnHold: member.wallet?.onHold ?? false, volume: member.volume,
      },
      summary: {
        totalIncome: byType.reduce((a, t) => a + num(t._sum.amount), 0),
        byType: byType.map((t) => ({ type: t.incomeType, amount: num(t._sum.amount), pairs: num(t._sum.pairs), flushed: num(t._sum.flushed), lines: t._count })),
        withdrawn: withdrawals.filter((w) => w.status !== 'REJECTED').reduce((a, w) => a + num(w.gross), 0),
      },
      lines: { items: lines, total, page: query.page, pageSize: query.pageSize },
      withdrawals,
    };
  },
});
