import { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma';
import { nextCounter } from '../lib/counters';
import { badRequest, notFound } from '../lib/http';
import type { AutopoolLevel, AutopoolSettings } from '../lib/settings';

/**
 * AUTOPOOL — one global 4 × 4 matrix ("non-working": placement does not depend on who sponsored whom).
 *
 * Members get the next free position (1, 2, 3 …) in the order they enter the pool. The matrix is filled
 * left-to-right, level by level, like a 4-ary heap:
 *
 *     position p  →  children 4(p-1)+2 … 4(p-1)+5      parent = ⌊(p-2)/4⌋ + 1
 *
 * So the positions at depth k under p form ONE continuous range, and "how full is level k of p" is pure
 * arithmetic on the total number of positions N — no tree walk, no recursive query, any size.
 *
 * Income: when level k of a position is completely filled (4^k positions) AND the member has the required
 * repurchase BV on their own ID, the level income is paid ONCE through the normal closing
 * (preview → approve → post), as an AUTOPOOL income line.
 */
export const WIDTH = 4;
export const MAX_LEVELS = 9;

export interface LevelRange { start: number; end: number; size: number }

/** Positions at depth `k` (1-based) below position `p`. */
export function levelRange(p: number, k: number): LevelRange {
  const size = WIDTH ** k;
  const start = size * (p - 1) + (size - 1) / (WIDTH - 1) + 1;
  return { start, end: start + size - 1, size };
}

/** How many of the level-k slots under p are filled when the pool has N positions. */
export function filledAt(p: number, k: number, total: number): number {
  const r = levelRange(p, k);
  return Math.max(0, Math.min(total, r.end) - r.start + 1);
}

export const parentOf = (p: number) => (p <= 1 ? null : Math.floor((p - 2) / WIDTH) + 1);
export const childrenOf = (p: number) => Array.from({ length: WIDTH }, (_, i) => WIDTH * (p - 1) + 2 + i);
/** Depth of a position from the top of the pool (position 1 = depth 0). */
export function depthOf(p: number): number {
  let d = 0;
  while (levelRange(1, d + 1).start <= p) d++;
  return d;
}

/** Repurchase BV a member needs on their own ID before level `level` is paid. */
export function requiredBv(levels: AutopoolLevel[], level: number, mode: AutopoolSettings['conditionMode']): number {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  if (mode === 'THRESHOLD') return Number(sorted.find((l) => l.level === level)?.conditionBv ?? 0);
  return sorted.filter((l) => l.level <= level).reduce((a, l) => a + Number(l.conditionBv), 0);
}

export type LevelState = 'PAID' | 'READY' | 'WAITING_REPURCHASE' | 'FILLING' | 'INACTIVE';

export interface LevelProgress {
  level: number;
  team: number;
  filled: number;
  complete: boolean;
  income: number;
  requiredBv: number;
  qualified: boolean;
  paid: boolean;
  state: LevelState;
}

/** Level-by-level progress of one position. Pure — used by the closing, the admin page and the member page. */
export function progressFor(
  position: number,
  total: number,
  repurchaseBv: number,
  paidLevels: Set<number>,
  cfg: AutopoolSettings,
  memberActive = true,
): LevelProgress[] {
  return [...cfg.levels]
    .sort((a, b) => a.level - b.level)
    .map((l) => {
      const team = WIDTH ** l.level;
      const filled = filledAt(position, l.level, total);
      const complete = filled >= team;
      const need = requiredBv(cfg.levels, l.level, cfg.conditionMode);
      const qualified = repurchaseBv >= need;
      const paid = paidLevels.has(l.level);
      const state: LevelState = paid ? 'PAID' : !complete ? 'FILLING' : !memberActive ? 'INACTIVE' : qualified ? 'READY' : 'WAITING_REPURCHASE';
      return { level: l.level, team, filled, complete, income: Number(l.income), requiredBv: need, qualified, paid, state };
    });
}

/* ------------------------------------------------------------------ DB helpers */

/** Total positions in the pool (optionally: only those that entered before `until`). Positions are a gap-free prefix. */
export async function poolSize(db: Tx = prisma, until?: Date): Promise<number> {
  const r = await db.autopoolEntry.aggregate({ _max: { position: true }, where: until ? { enteredAt: { lt: until } } : undefined });
  return r._max.position ?? 0;
}

/** Net repurchase BV per member (reversals from returns are included as negative BV). */
export async function repurchaseBvMap(memberIds: string[], until?: Date): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!memberIds.length) return map;
  const untilSql = until ? Prisma.sql`AND bp."postedAt" < ${until}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ memberId: string; bv: Prisma.Decimal | null }[]>`
    SELECT bp."memberId", SUM(bp."bv") AS bv
    FROM "BvPosting" bp JOIN "Order" o ON o."id" = bp."orderId"
    WHERE o."type" = 'REPURCHASE' AND bp."memberId" IN (${Prisma.join(memberIds)}) ${untilSql}
    GROUP BY bp."memberId"`;
  for (const r of rows) map.set(r.memberId, Number(r.bv ?? 0));
  return map;
}

/** Put a member into the pool (idempotent: returns the existing entry if they are already in). */
export async function enterAutopool(db: Tx, memberId: string, source: 'ACTIVATION' | 'ADMIN_SYNC' | 'ADMIN_MANUAL') {
  const existing = await db.autopoolEntry.findUnique({ where: { memberId } });
  if (existing) return existing;
  // serialise position numbers (also safe when two activations are paid at the same moment)
  const position = await nextCounter(db, 'autopool_position', 1);
  return db.autopoolEntry.create({ data: { memberId, position, source } });
}

/** Admin: add every ACTIVE member who is not in the pool yet, oldest activation first. */
export async function syncActiveMembers() {
  const missing = await prisma.member.findMany({
    where: { status: 'ACTIVE', autopoolEntry: null, packageTier: { not: 'NONE' } },
    orderBy: [{ activatedAt: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  for (const m of missing) await prisma.$transaction((tx) => enterAutopool(tx, m.id, 'ADMIN_SYNC'));
  return { added: missing.length, total: await poolSize() };
}

export async function addMemberByCode(code: string) {
  const m = await prisma.member.findUnique({ where: { distributorCode: code.trim().toUpperCase() }, select: { id: true, status: true, packageTier: true } });
  if (!m) throw notFound('Distributor');
  if (m.status !== 'ACTIVE' || m.packageTier === 'NONE') throw badRequest('Only ACTIVE (activated) distributors can enter the autopool');
  return prisma.$transaction((tx) => enterAutopool(tx, m.id, 'ADMIN_MANUAL'));
}

/**
 * Closing step: one AUTOPOOL income line for every level that is complete, qualified and not yet paid.
 * Uses only data from BEFORE periodEnd, so re-running the same closing gives the same result.
 */
export async function autopoolClosingLines(closingId: string, periodEnd: Date, cfg: AutopoolSettings): Promise<Prisma.ClosingLineCreateManyInput[]> {
  const total = await poolSize(prisma, periodEnd);
  if (total < 1 + WIDTH) return []; // nobody can have a complete level yet
  // only positions whose level 1 is complete can earn anything: start(p,1) + 3 <= total
  const lastEarner = Math.floor((total - 2 - (WIDTH - 1)) / WIDTH) + 1;
  const entries = await prisma.autopoolEntry.findMany({
    where: { position: { lte: lastEarner }, enteredAt: { lt: periodEnd } },
    orderBy: { position: 'asc' },
    select: { id: true, position: true, memberId: true, member: { select: { status: true } }, payouts: { select: { level: true } } },
  });
  const rep = await repurchaseBvMap(entries.map((e) => e.memberId), periodEnd);
  const lines: Prisma.ClosingLineCreateManyInput[] = [];
  for (const e of entries) {
    if (e.member.status !== 'ACTIVE') continue;
    const bv = rep.get(e.memberId) ?? 0;
    const prog = progressFor(e.position, total, bv, new Set(e.payouts.map((p) => p.level)), cfg);
    for (const l of prog) {
      if (l.state !== 'READY' || l.income <= 0) continue;
      lines.push({
        closingId,
        memberId: e.memberId,
        incomeType: 'AUTOPOOL',
        amount: l.income,
        detail: {
          entryId: e.id,
          position: e.position,
          level: l.level,
          team: l.team,
          filled: l.filled,
          poolSize: total,
          repurchaseBv: bv,
          requiredBv: l.requiredBv,
          conditionMode: cfg.conditionMode,
        } as Prisma.InputJsonValue,
      });
    }
  }
  return lines;
}
