import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createModule, memberOnly, PageQuery } from '../lib/openapi';
import { ROLES } from '../lib/auth';
import { badRequest, notFound } from '../lib/http';
import { audit } from '../lib/audit';
import { getSettings, type AutopoolSettings } from '../lib/settings';
import {
  addMemberByCode, childrenOf, levelRange, parentOf, poolSize, progressFor, repurchaseBvMap, requiredBv, syncActiveMembers, WIDTH,
} from '../engine/autopool';

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Positions whose level k is completely filled when the pool has `total` positions. */
function completedCount(k: number, total: number) {
  const size = WIDTH ** k;
  const offset = (size - 1) / (WIDTH - 1) + size; // end(p,k) = size*(p-1) + offset
  return Math.max(0, Math.floor((total - offset) / size) + 1);
}

/* ============================== SUPER ADMIN ============================== */
export const admin = createModule('/admin/autopool', 'Admin · Autopool');

admin.get('/summary', {
  summary: 'Autopool dashboard: settings, pool size, level-wise completion and payouts',
  access: ROLES.SUPER,
  handler: async () => {
    const { version, values: s } = await getSettings();
    const cfg = s.autopool;
    const total = await poolSize();
    const [inPool, notInPool, paidByLevel] = await Promise.all([
      prisma.autopoolEntry.count(),
      prisma.member.count({ where: { status: 'ACTIVE', packageTier: { not: 'NONE' }, autopoolEntry: null } }),
      prisma.autopoolPayout.groupBy({ by: ['level'], _sum: { amount: true }, _count: true }),
    ]);

    // pending money: every position whose level 1 is complete (same set the closing looks at)
    const lastEarner = Math.max(0, Math.floor((total - 2 - (WIDTH - 1)) / WIDTH) + 1);
    const earners = lastEarner
      ? await prisma.autopoolEntry.findMany({
          where: { position: { lte: lastEarner } },
          select: { position: true, memberId: true, member: { select: { status: true } }, payouts: { select: { level: true } } },
        })
      : [];
    const rep = await repurchaseBvMap(earners.map((e) => e.memberId));
    const pend = new Map<number, { ready: number; readyAmt: number; waiting: number; waitingAmt: number; inactive: number }>();
    for (const e of earners) {
      for (const l of progressFor(e.position, total, rep.get(e.memberId) ?? 0, new Set(e.payouts.map((p) => p.level)), cfg, e.member.status === 'ACTIVE')) {
        const p = pend.get(l.level) ?? { ready: 0, readyAmt: 0, waiting: 0, waitingAmt: 0, inactive: 0 };
        if (l.state === 'READY') { p.ready++; p.readyAmt += l.income; }
        if (l.state === 'WAITING_REPURCHASE') { p.waiting++; p.waitingAmt += l.income; }
        if (l.state === 'INACTIVE') p.inactive++;
        pend.set(l.level, p);
      }
    }

    const levels = [...cfg.levels].sort((a, b) => a.level - b.level).map((l) => {
      const paid = paidByLevel.find((x) => x.level === l.level);
      const p = pend.get(l.level);
      return {
        level: l.level, team: WIDTH ** l.level, income: l.income, conditionBv: l.conditionBv,
        requiredBv: requiredBv(cfg.levels, l.level, cfg.conditionMode),
        completed: completedCount(l.level, total),
        paidCount: paid?._count ?? 0, paidAmount: num(paid?._sum.amount),
        readyCount: p?.ready ?? 0, readyAmount: p?.readyAmt ?? 0,
        waitingCount: p?.waiting ?? 0, waitingAmount: p?.waitingAmt ?? 0,
        inactiveCount: p?.inactive ?? 0,
      };
    });
    const sum = (k: 'paidAmount' | 'readyAmount' | 'waitingAmount') => levels.reduce((a, l) => a + l[k], 0);
    return {
      enabled: !!s.features.autopool,
      settingsVersion: version,
      config: cfg,
      width: WIDTH,
      maxPotential: cfg.levels.reduce((a, l) => a + Number(l.income), 0),
      pool: { positions: total, members: inPool, activeNotInPool: notInPool },
      totals: { paid: sum('paidAmount'), ready: sum('readyAmount'), waitingRepurchase: sum('waitingAmount') },
      levels,
    };
  },
});

admin.get('/entries', {
  summary: 'Pool positions with level progress (search by distributor ID, name or mobile)',
  access: ROLES.SUPER,
  query: PageQuery.extend({ q: z.string().trim().optional() }),
  handler: async ({ query }) => {
    const { values: s } = await getSettings();
    const total = await poolSize();
    const where: Prisma.AutopoolEntryWhereInput = query.q
      ? { OR: [
          { member: { distributorCode: { contains: query.q.toUpperCase() } } },
          { member: { fullName: { contains: query.q, mode: 'insensitive' } } },
          { member: { user: { mobile: { contains: query.q } } } },
          ...(/^\d+$/.test(query.q) ? [{ position: Number(query.q) }] : []),
        ] }
      : {};
    const [rows, count] = await Promise.all([
      prisma.autopoolEntry.findMany({
        where, orderBy: { position: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { member: { select: { id: true, distributorCode: true, fullName: true, status: true, packageTier: true, user: { select: { mobile: true } } } }, payouts: { select: { level: true, amount: true } } },
      }),
      prisma.autopoolEntry.count({ where }),
    ]);
    const rep = await repurchaseBvMap(rows.map((r) => r.memberId));
    const items = rows.map((r) => {
      const bv = rep.get(r.memberId) ?? 0;
      const prog = progressFor(r.position, total, bv, new Set(r.payouts.map((p) => p.level)), s.autopool, r.member.status === 'ACTIVE');
      const next = prog.find((l) => !l.paid) ?? null;
      return {
        id: r.id, position: r.position, enteredAt: r.enteredAt, source: r.source,
        member: { id: r.member.id, code: r.member.distributorCode, name: r.member.fullName, mobile: r.member.user.mobile, status: r.member.status, tier: r.member.packageTier },
        parentPosition: parentOf(r.position),
        repurchaseBv: bv,
        levelsComplete: prog.filter((l) => l.complete).length,
        levelsPaid: prog.filter((l) => l.paid).length,
        earned: r.payouts.reduce((a, p) => a + num(p.amount), 0),
        next,
      };
    });
    return { items, total: count, page: query.page, pageSize: query.pageSize, poolSize: total };
  },
});

admin.get('/entries/:id', {
  summary: 'One pool position: level-by-level progress, payouts, parent and children',
  access: ROLES.SUPER,
  handler: async ({ params }) => {
    const { values: s } = await getSettings();
    const e = await prisma.autopoolEntry.findFirst({
      where: { OR: [{ id: params.id }, ...(/^\d+$/.test(params.id) ? [{ position: Number(params.id) }] : [])] },
      include: { member: { select: { id: true, distributorCode: true, fullName: true, status: true, packageTier: true, activatedAt: true, user: { select: { mobile: true } } } }, payouts: { orderBy: { level: 'asc' } } },
    });
    if (!e) throw notFound('Pool position');
    const total = await poolSize();
    const bv = (await repurchaseBvMap([e.memberId])).get(e.memberId) ?? 0;
    const progress = progressFor(e.position, total, bv, new Set(e.payouts.map((p) => p.level)), s.autopool, e.member.status === 'ACTIVE');
    const near = [parentOf(e.position), ...childrenOf(e.position)].filter((p): p is number => !!p);
    const nearEntries = await prisma.autopoolEntry.findMany({ where: { position: { in: near } }, include: { member: { select: { distributorCode: true, fullName: true } } } });
    const at = (p: number | null) => {
      if (!p) return null;
      const x = nearEntries.find((n) => n.position === p);
      return { position: p, filled: !!x, id: x?.id ?? null, code: x?.member.distributorCode ?? null, name: x?.member.fullName ?? null };
    };
    return {
      entry: { id: e.id, position: e.position, enteredAt: e.enteredAt, source: e.source },
      member: { ...e.member, mobile: e.member.user.mobile, user: undefined },
      poolSize: total, repurchaseBv: bv, conditionMode: s.autopool.conditionMode,
      progress: progress.map((l) => ({ ...l, range: levelRange(e.position, l.level) })),
      payouts: e.payouts,
      earned: e.payouts.reduce((a, p) => a + num(p.amount), 0),
      parent: at(parentOf(e.position)),
      children: childrenOf(e.position).map(at),
    };
  },
});

admin.get('/matrix', {
  summary: 'Matrix view: a position and the next two levels below it (1 + 4 + 16 slots)',
  access: ROLES.SUPER,
  query: z.object({ position: z.coerce.number().int().min(1).default(1) }),
  handler: async ({ query }) => {
    const total = await poolSize();
    const rows = [[query.position], levelRangeList(query.position, 1), levelRangeList(query.position, 2)];
    const want = rows.flat().filter((p) => p <= total);
    const entries = await prisma.autopoolEntry.findMany({ where: { position: { in: want } }, include: { member: { select: { distributorCode: true, fullName: true, status: true } } } });
    const node = (p: number) => {
      const x = entries.find((e) => e.position === p);
      return { position: p, filled: !!x, id: x?.id ?? null, code: x?.member.distributorCode ?? null, name: x?.member.fullName ?? null, status: x?.member.status ?? null };
    };
    return { poolSize: total, root: query.position, parent: parentOf(query.position), levels: rows.map((r) => r.map(node)) };
  },
});
function levelRangeList(p: number, k: number) {
  const r = levelRange(p, k);
  return Array.from({ length: r.size }, (_, i) => r.start + i);
}

admin.post('/sync', {
  summary: 'Add every ACTIVE distributor who is not in the pool yet (oldest activation first)',
  access: ROLES.SUPER,
  handler: async ({ req }) => {
    const r = await syncActiveMembers();
    await audit(req, 'AUTOPOOL.SYNC', 'AutopoolEntry', 'bulk', undefined, r);
    return r;
  },
});

admin.post('/entries', {
  summary: 'Add one ACTIVE distributor to the pool (takes the next free position)',
  access: ROLES.SUPER,
  body: z.object({ distributorCode: z.string().min(3) }),
  handler: async ({ body, req }) => {
    const e = await addMemberByCode(body.distributorCode);
    await audit(req, 'AUTOPOOL.ADD', 'AutopoolEntry', e.id, undefined, { position: e.position, distributorCode: body.distributorCode });
    return e;
  },
});

const LevelSchema = z.object({ level: z.number().int().min(1).max(9), income: z.number().min(0), conditionBv: z.number().min(0) });
admin.put('/settings', {
  summary: 'Switch the autopool on/off and change level income / repurchase conditions (saves a NEW plan-settings version)',
  access: ROLES.SUPER,
  body: z.object({
    enabled: z.boolean(),
    conditionMode: z.enum(['CUMULATIVE', 'THRESHOLD']),
    autoEnterOnActivation: z.boolean(),
    levels: z.array(LevelSchema).min(1).max(9),
    reason: z.string().trim().min(3).openapi({ description: 'Why the change was made (kept in the audit log)' }),
  }),
  handler: async ({ body, user, req }) => {
    const levelNos = body.levels.map((l) => l.level).sort((a, b) => a - b);
    if (levelNos.some((n, i) => n !== i + 1)) throw badRequest('Levels must be numbered 1, 2, 3 … without gaps');
    const last = await prisma.planSetting.findFirst({ orderBy: { version: 'desc' } });
    const { values: current } = await getSettings();
    const autopool: AutopoolSettings = { conditionMode: body.conditionMode, autoEnterOnActivation: body.autoEnterOnActivation, levels: [...body.levels].sort((a, b) => a.level - b.level) };
    const values = { ...current, features: { ...current.features, autopool: body.enabled }, autopool };
    const row = await prisma.planSetting.create({
      data: { version: (last?.version ?? 0) + 1, values: values as unknown as Prisma.InputJsonValue, effectiveFrom: new Date(), createdBy: user.id },
    });
    await audit(req, 'AUTOPOOL.SETTINGS', 'PlanSetting', String(row.version), { enabled: current.features.autopool, autopool: current.autopool }, { enabled: body.enabled, autopool, reason: body.reason });
    return { version: row.version };
  },
});

/* ============================== DISTRIBUTOR ============================== */
export const member = createModule('/autopool', 'Autopool');

member.get('/my', {
  summary: 'My autopool position, level progress and payouts',
  handler: async ({ user }) => {
    const memberId = memberOnly(user);
    const { values: s } = await getSettings();
    const plan = [...s.autopool.levels].sort((a, b) => a.level - b.level).map((l) => ({ ...l, team: WIDTH ** l.level, requiredBv: requiredBv(s.autopool.levels, l.level, s.autopool.conditionMode) }));
    const e = await prisma.autopoolEntry.findUnique({ where: { memberId }, include: { payouts: { orderBy: { level: 'asc' } }, member: { select: { status: true } } } });
    const bv = (await repurchaseBvMap([memberId])).get(memberId) ?? 0;
    if (!e) return { enabled: !!s.features.autopool, entry: null, plan, repurchaseBv: bv, conditionMode: s.autopool.conditionMode };
    const total = await poolSize();
    return {
      enabled: !!s.features.autopool,
      entry: { position: e.position, enteredAt: e.enteredAt, parentPosition: parentOf(e.position) },
      poolSize: total,
      repurchaseBv: bv,
      conditionMode: s.autopool.conditionMode,
      progress: progressFor(e.position, total, bv, new Set(e.payouts.map((p) => p.level)), s.autopool, e.member.status === 'ACTIVE'),
      payouts: e.payouts,
      earned: e.payouts.reduce((a, p) => a + num(p.amount), 0),
      plan,
    };
  },
});
