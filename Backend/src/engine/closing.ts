import { Prisma, type ClosingLine, type IncomeType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError, badRequest, conflict, notFound } from '../lib/http';
import { getSettings } from '../lib/settings';
import { creditWallet } from '../services/wallet';
import { propagatePending } from './bv';
import { capRemaining, matchPairs, type Carry } from './pair';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** IST calendar keys used for the day / week / month caps */
export function periodKeys(d: Date) {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth(), day = ist.getUTCDate();
  const dayDate = new Date(Date.UTC(y, m, day));
  // ISO week number
  const t = new Date(Date.UTC(y, m, day));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { dayDate, dayKey: dayDate.toISOString().slice(0, 10), weekKey: `${t.getUTCFullYear()}-W${week}`, monthKey: `${y}-${m + 1}` };
}

/** Cap counters as they stand for the closing day (reset when a new day/week/month has started) */
function countersFor(nv: { capDay: Date | null; pairsToday: number; pairsThisWeek: number; pairsThisMonth: number }, closingDay: Date) {
  if (!nv.capDay) return { day: 0, week: 0, month: 0 };
  const a = periodKeys(new Date(nv.capDay.getTime() + 6 * 3600_000)); // capDay is stored as UTC midnight of the IST day
  const b = periodKeys(closingDay);
  return {
    day: a.dayKey === b.dayKey ? nv.pairsToday : 0,
    week: a.weekKey === b.weekKey ? nv.pairsThisWeek : 0,
    month: a.monthKey === b.monthKey ? nv.pairsThisMonth : 0,
  };
}

/** Step 1 — calculate a closing and save it as PREVIEWED. Nothing is paid yet. */
export async function runClosing(periodStart: Date, periodEnd: Date, runBy: string) {
  if (periodEnd <= periodStart) throw badRequest('Period end must be after period start');
  const open = await prisma.closing.findFirst({ where: { status: { in: ['DRAFT', 'PREVIEWED', 'APPROVED'] } } });
  if (open) throw conflict('Another closing is still open. Post or delete it first.');

  await propagatePending();
  const { version, values: s } = await getSettings();
  const closingDay = new Date(periodEnd.getTime() - 1);
  const keys = periodKeys(closingDay);

  const closing = await prisma.closing.create({ data: { periodStart, periodEnd, settingsVer: version, runBy, status: 'DRAFT' } });

  try {
    const lines: Prisma.ClosingLineCreateManyInput[] = [];

    // ---- 1. pair matching ----
    const candidates = await prisma.member.findMany({
      where: { status: 'ACTIVE', packageTier: { in: ['BASIC', 'FULL'] }, activatedAt: { lt: periodEnd } },
      select: { id: true, packageTier: true, volume: true },
    });
    for (const m of candidates) {
      const nv = m.volume;
      if (!nv) continue;
      const carry: Carry = { lf: nv.carryLeftFull, lb: nv.carryLeftBasic, rf: nv.carryRightFull, rb: nv.carryRightBasic };
      if (carry.lf + carry.lb < 1 || carry.rf + carry.rb < 1) continue;
      const counters = countersFor(nv, closingDay);
      const rem = capRemaining(counters, s.caps);
      const r = matchPairs(m.packageTier as 'BASIC' | 'FULL', carry, rem, s.pairRates, s.capOverflow !== 'CARRY');
      const pairs = r.fullPairs + r.basicPairs;
      if (pairs === 0 && r.flushed === 0) continue;
      lines.push({
        closingId: closing.id,
        memberId: m.id,
        incomeType: 'PAIR_MATCHING',
        pairs,
        rate: pairs ? D(r.amount).div(pairs).toDecimalPlaces(2) : 0,
        amount: r.amount,
        flushed: r.flushed,
        detail: {
          tier: m.packageTier,
          carryBefore: carry,
          consumed: r.consumed,
          carryAfter: r.carryAfter,
          countersBefore: counters,
          capRemaining: rem,
          fullPairs: r.fullPairs,
          basicPairs: r.basicPairs,
          rates: s.pairRates,
          dayKey: keys.dayKey,
        } as unknown as Prisma.InputJsonValue,
      });
    }

    // ---- 2. ranks (BV on the weaker leg >= threshold) ----
    const ranks = await prisma.rank.findMany({ orderBy: { id: 'asc' } });
    const active = await prisma.member.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, specialBonusVerified: true, volume: true, ranks: { select: { rankId: true } } },
    });
    for (const m of active) {
      if (!m.volume) continue;
      const weak = Prisma.Decimal.min(m.volume.totalLeftBv, m.volume.totalRightBv);
      const have = new Set(m.ranks.map((r) => r.rankId));
      for (const rank of ranks) {
        if (have.has(rank.id) || weak.lt(rank.thresholdBv)) continue;
        lines.push({
          closingId: closing.id, memberId: m.id, incomeType: 'RANK_BONUS', amount: rank.bonusAmount,
          detail: { rankId: rank.id, rankName: rank.name, reward: rank.reward, weakLegBv: weak.toString() },
        });
        if (m.specialBonusVerified && rank.id >= s.specialBonus.fromRankId) {
          lines.push({
            closingId: closing.id, memberId: m.id, incomeType: 'SPECIAL_BONUS', amount: s.specialBonus.amount,
            detail: { rankId: rank.id, rankName: rank.name, reason: 'Women / divyang special bonus' },
          });
        }
      }
    }

    if (lines.length) await prisma.closingLine.createMany({ data: lines });

    const turnover = await prisma.order.aggregate({
      _sum: { grandTotal: true },
      where: { paidAt: { gte: periodStart, lt: periodEnd }, status: { in: ['PAID', 'INVOICED', 'SHIPPED', 'DELIVERED'] } },
    });
    const totalPayout = lines.reduce((a, l) => a.add(D(l.amount as Prisma.Decimal.Value)), D(0));
    return prisma.closing.update({
      where: { id: closing.id },
      data: { status: 'PREVIEWED', totalPayout, turnover: turnover._sum.grandTotal ?? 0 },
    });
  } catch (e) {
    await prisma.closingLine.deleteMany({ where: { closingId: closing.id } });
    await prisma.closing.delete({ where: { id: closing.id } });
    throw e;
  }
}

/** Step 2 — a second person (finance) approves. */
export async function approveClosing(id: string, userId: string) {
  const c = await prisma.closing.findUnique({ where: { id } });
  if (!c) throw notFound('Closing');
  if (c.status !== 'PREVIEWED') throw badRequest(`Closing is ${c.status}, only PREVIEWED can be approved`);
  const { values: s } = await getSettings();
  if (s.makerChecker && c.runBy === userId) {
    throw new AppError(403, 'MAKER_CHECKER', 'The person who ran the closing cannot approve it. Ask a finance user to approve.');
  }
  return prisma.closing.update({ where: { id }, data: { status: 'APPROVED', approvedBy: userId } });
}

/** Step 3 — post: update carry/caps, award ranks, credit wallets. One transaction. */
export async function postClosing(id: string) {
  const c = await prisma.closing.findUnique({ where: { id }, include: { lines: true } });
  if (!c) throw notFound('Closing');
  if (c.status !== 'APPROVED') throw badRequest(`Closing is ${c.status}, only APPROVED can be posted`);
  const closingDay = new Date(c.periodEnd.getTime() - 1);
  const { dayDate } = periodKeys(closingDay);

  await prisma.$transaction(
    async (tx) => {
      for (const l of c.lines as ClosingLine[]) {
        const d = l.detail as Record<string, unknown>;
        if (l.incomeType === 'PAIR_MATCHING') {
          const nv = await tx.nodeVolume.findUniqueOrThrow({ where: { memberId: l.memberId } });
          const counters = countersFor(nv, closingDay);
          const used = d.consumed as Carry;
          await tx.nodeVolume.update({
            where: { memberId: l.memberId },
            data: {
              carryLeftFull: Math.max(0, nv.carryLeftFull - used.lf),
              carryLeftBasic: Math.max(0, nv.carryLeftBasic - used.lb),
              carryRightFull: Math.max(0, nv.carryRightFull - used.rf),
              carryRightBasic: Math.max(0, nv.carryRightBasic - used.rb),
              pairsToday: counters.day + l.pairs,
              pairsThisWeek: counters.week + l.pairs,
              pairsThisMonth: counters.month + l.pairs,
              capDay: dayDate,
            },
          });
        }
        if (l.incomeType === 'RANK_BONUS') {
          const rankId = Number(d.rankId);
          await tx.memberRank.upsert({
            where: { memberId_rankId: { memberId: l.memberId, rankId } },
            create: { memberId: l.memberId, rankId, bonusPaid: true },
            update: { bonusPaid: true },
          });
          const mem = await tx.member.findUniqueOrThrow({ where: { id: l.memberId }, select: { currentRankId: true } });
          if ((mem.currentRankId ?? 0) < rankId) await tx.member.update({ where: { id: l.memberId }, data: { currentRankId: rankId } });
        }
        await creditWallet(tx, l.memberId, l.amount, 'CLOSING_LINE', l.id, l.incomeType as IncomeType, `Closing ${periodKeys(c.periodStart).dayKey}`);
      }
      await tx.closing.update({ where: { id }, data: { status: 'POSTED', postedAt: new Date() } });
    },
    { timeout: 120_000 },
  );
  return prisma.closing.findUnique({ where: { id } });
}

export async function deleteClosing(id: string) {
  const c = await prisma.closing.findUnique({ where: { id } });
  if (!c) throw notFound('Closing');
  if (c.status === 'POSTED') throw badRequest('A posted closing cannot be deleted');
  await prisma.$transaction([prisma.closingLine.deleteMany({ where: { closingId: id } }), prisma.closing.delete({ where: { id } })]);
  return { deleted: true };
}
