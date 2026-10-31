import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createModule, memberOnly } from '../lib/openapi';
import { encrypt, mask } from '../lib/crypto';
import { audit } from '../lib/audit';
import { getSettings } from '../lib/settings';
import { periodKeys } from '../engine/closing';

const m = createModule('/me', 'My account');

m.get('/dashboard', {
  summary: 'Everything the distributor dashboard needs in one call',
  handler: async ({ user }) => {
    const memberId = memberOnly(user);
    const [member, s, ranks, directs, recentTxns] = await Promise.all([
      prisma.member.findUniqueOrThrow({
        where: { id: memberId },
        include: { volume: true, wallet: true, currentRank: true, sponsor: { select: { distributorCode: true, fullName: true } } },
      }),
      getSettings(),
      prisma.rank.findMany({ orderBy: { id: 'asc' } }),
      prisma.member.count({ where: { sponsorId: memberId } }),
      prisma.walletTxn.findMany({ where: { memberId }, orderBy: { createdAt: 'desc' }, take: 6 }),
    ]);
    const nv = member.volume!;
    const nextRank = ranks.find((r) => r.id > (member.currentRankId ?? 0));
    const pct = (v: Prisma.Decimal, t: Prisma.Decimal) => Math.min(100, Number(v.div(t).mul(100).toFixed(1)));

    const incomeByType = await prisma.walletTxn.groupBy({
      by: ['incomeType'],
      where: { memberId, type: 'CREDIT', incomeType: { not: null } },
      _sum: { amount: true },
    });
    const daily = await prisma.$queryRaw<{ d: string; amount: Prisma.Decimal }[]>`
      SELECT to_char(c."periodStart" + interval '330 minutes', 'YYYY-MM-DD') AS d, SUM(l."amount") AS amount
      FROM "ClosingLine" l JOIN "Closing" c ON c."id" = l."closingId"
      WHERE l."memberId" = ${memberId} AND c."status" = 'POSTED' AND c."periodStart" >= now() - interval '30 days'
      GROUP BY 1 ORDER BY 1`;
    const today = periodKeys(new Date()).dayKey;
    const capDayKey = nv.capDay ? periodKeys(new Date(nv.capDay.getTime() + 6 * 3600_000)).dayKey : null;

    return {
      member: {
        code: member.distributorCode, name: member.fullName, status: member.status, tier: member.packageTier,
        kycStatus: member.kycStatus, activatedAt: member.activatedAt, joinedAt: member.createdAt, side: member.side,
        sponsor: member.sponsor ? { code: member.sponsor.distributorCode, name: member.sponsor.fullName } : null,
        rank: member.currentRank?.name ?? null,
      },
      volume: {
        leftBv: nv.totalLeftBv, rightBv: nv.totalRightBv, leftCount: nv.totalLeftCount, rightCount: nv.totalRightCount,
        carryLeft: nv.carryLeftFull + nv.carryLeftBasic, carryRight: nv.carryRightFull + nv.carryRightBasic,
        carry: { lf: nv.carryLeftFull, lb: nv.carryLeftBasic, rf: nv.carryRightFull, rb: nv.carryRightBasic },
        pairsToday: capDayKey === today ? nv.pairsToday : 0, dayCap: s.values.caps.day,
      },
      wallet: { balance: member.wallet?.balance ?? 0, onHold: member.wallet?.onHold ?? false },
      totalIncome: incomeByType.reduce((a, r) => a.add(r._sum.amount ?? 0), new Prisma.Decimal(0)),
      incomeByType: incomeByType.map((r) => ({ type: r.incomeType, amount: r._sum.amount })),
      dailyIncome: daily.map((r) => ({ date: r.d, amount: Number(r.amount) })),
      nextRank: nextRank
        ? { id: nextRank.id, name: nextRank.name, threshold: nextRank.thresholdBv, bonus: nextRank.bonusAmount, reward: nextRank.reward,
            leftPct: pct(nv.totalLeftBv, nextRank.thresholdBv), rightPct: pct(nv.totalRightBv, nextRank.thresholdBv) }
        : null,
      directs,
      recentTxns,
      pairRates: s.values.pairRates,
    };
  },
});

m.get('/profile', {
  summary: 'My profile, bank (masked) and nominee',
  handler: async ({ user }) => {
    const memberId = memberOnly(user);
    const mem = await prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      include: { user: { select: { mobile: true, email: true } }, bank: true, nominee: true, sponsor: { select: { distributorCode: true, fullName: true } }, parent: { select: { distributorCode: true } } },
    });
    return {
      code: mem.distributorCode, fullName: mem.fullName, gender: mem.gender, dob: mem.dob, address: mem.address,
      mobile: mem.user.mobile, email: mem.user.email, status: mem.status, tier: mem.packageTier, kycStatus: mem.kycStatus,
      sponsor: mem.sponsor, parentCode: mem.parent?.distributorCode ?? null, side: mem.side, joinedAt: mem.createdAt,
      agreementVersion: mem.agreementVersion, agreementAcceptedAt: mem.agreementAcceptedAt, specialBonusVerified: mem.specialBonusVerified,
      bank: mem.bank ? { holderName: mem.bank.holderName, account: mask('0000' + mem.bank.accountLast4), ifsc: mem.bank.ifsc, bankName: mem.bank.bankName, verified: mem.bank.verified } : null,
      nominee: mem.nominee,
    };
  },
});

m.put('/profile', {
  summary: 'Update my name, email, address',
  body: z.object({
    fullName: z.string().min(3).max(100),
    email: z.string().email().optional().or(z.literal('')),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional().nullable(),
    dob: z.coerce.date().optional().nullable(),
    address: z.object({ line1: z.string().optional(), city: z.string().optional(), state: z.string().optional(), pincode: z.string().optional() }).optional(),
  }),
  handler: async ({ user, body, req }) => {
    const memberId = memberOnly(user);
    const before = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
    await prisma.$transaction([
      prisma.member.update({ where: { id: memberId }, data: { fullName: body.fullName, gender: body.gender ?? null, dob: body.dob ?? null, address: body.address } }),
      prisma.user.update({ where: { id: user.id }, data: { email: body.email || null } }),
    ]);
    await audit(req, 'MEMBER.PROFILE_UPDATE', 'Member', memberId, { fullName: before.fullName }, { fullName: body.fullName });
    return { ok: true };
  },
});

m.put('/bank', {
  summary: 'Add / change bank account (needs re-verification by admin)',
  body: z.object({
    holderName: z.string().min(3),
    accountNumber: z.string().regex(/^\d{9,18}$/, 'Account number must be 9–18 digits'),
    ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC (e.g. SBIN0001234)'),
    bankName: z.string().optional(),
  }),
  handler: async ({ user, body, req }) => {
    const memberId = memberOnly(user);
    const data = { holderName: body.holderName, accountNoEnc: encrypt(body.accountNumber), accountLast4: body.accountNumber.slice(-4), ifsc: body.ifsc, bankName: body.bankName ?? null, verified: false };
    await prisma.bankAccount.upsert({ where: { memberId }, create: { memberId, ...data }, update: data });
    await audit(req, 'MEMBER.BANK_UPDATE', 'Member', memberId, undefined, { last4: data.accountLast4, ifsc: body.ifsc });
    return { ok: true };
  },
});

m.put('/nominee', {
  summary: 'Add / change nominee',
  body: z.object({ name: z.string().min(3), relation: z.string().min(2), dob: z.coerce.date().optional().nullable() }),
  handler: async ({ user, body }) => {
    const memberId = memberOnly(user);
    await prisma.nominee.upsert({ where: { memberId }, create: { memberId, ...body }, update: body });
    return { ok: true };
  },
});

m.get('/ranks', {
  summary: 'Rank ladder with my progress and achievements',
  handler: async ({ user }) => {
    const memberId = memberOnly(user);
    const [ranks, mine, nv] = await Promise.all([
      prisma.rank.findMany({ orderBy: { id: 'asc' } }),
      prisma.memberRank.findMany({ where: { memberId } }),
      prisma.nodeVolume.findUniqueOrThrow({ where: { memberId } }),
    ]);
    const got = new Map(mine.map((r) => [r.rankId, r]));
    return {
      leftBv: nv.totalLeftBv, rightBv: nv.totalRightBv,
      ranks: ranks.map((r) => ({ ...r, achievedAt: got.get(r.id)?.achievedAt ?? null, rewardStatus: got.get(r.id)?.rewardStatus ?? null })),
    };
  },
});

export default m;
