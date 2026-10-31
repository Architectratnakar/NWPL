import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma, type Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createModule, PageQuery } from '../../lib/openapi';
import { ROLES, STAFF } from '../../lib/auth';
import { badRequest, forbidden, notFound } from '../../lib/http';
import { audit } from '../../lib/audit';
import { getSettings } from '../../lib/settings';
import { decrypt } from '../../lib/crypto';

/* ======================= DASHBOARD ======================= */
export const dashboard = createModule('/admin/dashboard', 'Admin · Dashboard');

dashboard.get('/', {
  summary: 'KPIs, charts and queues for the admin home page',
  access: ROLES.STAFF,
  handler: async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayStart = new Date(Date.now() - ((Date.now() + 330 * 60_000) % 86_400_000));
    const paid: Prisma.OrderWhereInput = { status: { in: ['PAID', 'INVOICED', 'SHIPPED', 'DELIVERED'] } };
    const [members, active, joinedToday, pendingKyc, pendingWd, pendingWdSum, monthSales, monthPayout, openTickets, pendingReturns, recentOrders, s, openClosing] = await Promise.all([
      prisma.member.count(),
      prisma.member.count({ where: { status: 'ACTIVE' } }),
      prisma.member.count({ where: { createdAt: { gte: dayStart } } }),
      prisma.member.count({ where: { kycStatus: 'PENDING' } }),
      prisma.withdrawal.count({ where: { status: { in: ['REQUESTED', 'APPROVED'] } } }),
      prisma.withdrawal.aggregate({ _sum: { net: true }, where: { status: { in: ['REQUESTED', 'APPROVED'] } } }),
      prisma.order.aggregate({ _sum: { grandTotal: true, bvTotal: true }, _count: true, where: { ...paid, paidAt: { gte: monthStart } } }),
      prisma.closingLine.aggregate({ _sum: { amount: true }, where: { closing: { status: 'POSTED', periodStart: { gte: monthStart } } } }),
      prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'ESCALATED'] } } }),
      prisma.returnRequest.count({ where: { status: 'REQUESTED' } }),
      prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { member: { select: { distributorCode: true, fullName: true } } } }),
      getSettings(),
      prisma.closing.findFirst({ where: { status: { in: ['PREVIEWED', 'APPROVED'] } } }),
    ]);
    const series = await prisma.$queryRaw<{ d: string; joins: bigint; sales: Prisma.Decimal | null }[]>`
      WITH days AS (SELECT generate_series(0, 13) AS n),
      d AS (SELECT to_char((now() + interval '330 minutes')::date - n, 'YYYY-MM-DD') AS d FROM days)
      SELECT d.d,
        (SELECT COUNT(*) FROM "Member" m WHERE to_char(m."createdAt" + interval '330 minutes', 'YYYY-MM-DD') = d.d) AS joins,
        (SELECT SUM(o."grandTotal") FROM "Order" o WHERE o."paidAt" IS NOT NULL AND o."status" <> 'RETURNED' AND to_char(o."paidAt" + interval '330 minutes', 'YYYY-MM-DD') = d.d) AS sales
      FROM d ORDER BY d.d`;
    const tiers = await prisma.member.groupBy({ by: ['packageTier'], _count: true });
    const top = await prisma.walletTxn.groupBy({ by: ['memberId'], where: { type: 'CREDIT', incomeType: { not: null } }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } }, take: 5 });
    const topMembers = await prisma.member.findMany({ where: { id: { in: top.map((t) => t.memberId) } }, select: { id: true, distributorCode: true, fullName: true } });
    const sales = Number(monthSales._sum.grandTotal ?? 0);
    const payout = Number(monthPayout._sum.amount ?? 0);
    return {
      kpis: {
        members, active, joinedToday, pendingKyc, pendingWithdrawals: pendingWd, pendingWithdrawalAmount: pendingWdSum._sum.net ?? 0,
        monthSales: sales, monthBv: monthSales._sum.bvTotal ?? 0, monthOrders: monthSales._count, monthPayout: payout,
        payoutRatio: sales ? Math.round((payout / sales) * 1000) / 10 : 0, payoutAlertPercent: s.values.payoutAlertPercent, openTickets, pendingReturns,
      },
      series: series.map((r) => ({ date: r.d, joins: Number(r.joins), sales: Number(r.sales ?? 0) })),
      tiers: tiers.map((t) => ({ tier: t.packageTier, count: t._count })),
      topEarners: top.map((t) => ({ ...topMembers.find((m) => m.id === t.memberId), amount: t._sum.amount })),
      recentOrders,
      openClosing,
    };
  },
});

/* ======================= STAFF USER MANAGEMENT ======================= */
export const users = createModule('/admin/users', 'Admin · Users');
const StaffRole = z.enum(['ADMIN_SUPER', 'ADMIN_OPS', 'ADMIN_FINANCE', 'COMPLIANCE', 'SUPPORT']);

users.get('/', {
  summary: 'List staff logins',
  access: ROLES.SUPER,
  query: PageQuery.extend({ q: z.string().optional() }),
  handler: async ({ query }) => {
    const where: Prisma.UserWhereInput = { role: { in: STAFF }, ...(query.q ? { OR: [{ email: { contains: query.q, mode: 'insensitive' } }, { mobile: { contains: query.q } }] } : {}) };
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true, email: true, mobile: true, role: true, isActive: true, lastLoginAt: true, createdAt: true } }),
      prisma.user.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
});

users.post('/', {
  summary: 'Create a staff login',
  access: ROLES.SUPER,
  body: z.object({ email: z.string().email(), mobile: z.string().regex(/^\d{10}$/), role: StaffRole, password: z.string().min(8) }),
  handler: async ({ body, req }) => {
    const u = await prisma.user.create({ data: { email: body.email.toLowerCase(), mobile: body.mobile, role: body.role, passwordHash: await bcrypt.hash(body.password, 10) } });
    await audit(req, 'USER.CREATE', 'User', u.id, undefined, { email: u.email, role: u.role });
    return { id: u.id };
  },
});

users.patch('/:id', {
  summary: 'Change role / enable / disable a staff login',
  access: ROLES.SUPER,
  body: z.object({ role: StaffRole.optional(), isActive: z.boolean().optional(), email: z.string().email().optional(), mobile: z.string().regex(/^\d{10}$/).optional() }),
  handler: async ({ params, body, req, user }) => {
    if (params.id === user.id && (body.isActive === false || (body.role && body.role !== 'ADMIN_SUPER'))) throw badRequest('You cannot disable or demote yourself');
    const before = await prisma.user.findUnique({ where: { id: params.id } });
    if (!before || !STAFF.includes(before.role)) throw notFound('Staff user');
    const u = await prisma.user.update({ where: { id: params.id }, data: body });
    if (body.isActive === false) await prisma.refreshToken.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(req, 'USER.UPDATE', 'User', u.id, { role: before.role, isActive: before.isActive }, body);
    return { ok: true };
  },
});

users.post('/:id/reset-password', {
  summary: 'Set a new password for any login (staff or member)',
  access: ROLES.SUPER,
  body: z.object({ password: z.string().min(8) }),
  handler: async ({ params, body, req }) => {
    await prisma.user.update({ where: { id: params.id }, data: { passwordHash: await bcrypt.hash(body.password, 10) } });
    await prisma.refreshToken.updateMany({ where: { userId: params.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(req, 'USER.RESET_PASSWORD', 'User', params.id);
    return { ok: true };
  },
});

/* ======================= MEMBERS ======================= */
export const members = createModule('/admin/members', 'Admin · Members');

members.get('/', {
  summary: 'Search distributors',
  access: ROLES.STAFF,
  query: PageQuery.extend({
    q: z.string().optional(),
    status: z.enum(['REGISTERED', 'ACTIVE', 'BLOCKED', 'TERMINATED']).optional(),
    tier: z.enum(['NONE', 'BASIC', 'FULL']).optional(),
    kyc: z.enum(['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
  }),
  handler: async ({ query }) => {
    const where: Prisma.MemberWhereInput = {
      status: query.status, packageTier: query.tier, kycStatus: query.kyc,
      ...(query.q ? { OR: [{ distributorCode: { contains: query.q.toUpperCase() } }, { fullName: { contains: query.q, mode: 'insensitive' } }, { user: { mobile: { contains: query.q } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.member.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { user: { select: { mobile: true, email: true, isActive: true } }, sponsor: { select: { distributorCode: true } }, currentRank: { select: { name: true } }, wallet: { select: { balance: true, onHold: true } }, volume: { select: { totalLeftBv: true, totalRightBv: true } } },
      }),
      prisma.member.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
});

members.get('/:id', {
  summary: 'Full member profile for admins',
  access: ROLES.STAFF,
  handler: async ({ params, user }) => {
    const m = await prisma.member.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, mobile: true, email: true, isActive: true, lastLoginAt: true } }, sponsor: { select: { distributorCode: true, fullName: true } }, parent: { select: { distributorCode: true } },
        volume: true, wallet: true, bank: true, nominee: true, currentRank: true, kycDocs: { orderBy: { createdAt: 'desc' } },
        orders: { orderBy: { createdAt: 'desc' }, take: 10 }, ranks: { include: { rank: true } },
      },
    });
    if (!m) throw notFound('Member');
    const canSeeBank = ['ADMIN_SUPER', 'ADMIN_FINANCE'].includes(user.role);
    const _count = await prisma.member.count({ where: { sponsorId: m.id } });
    return {
      ...m,
      directs: _count,
      bank: m.bank ? { ...m.bank, accountNoEnc: undefined, accountNumber: canSeeBank ? decrypt(m.bank.accountNoEnc) : `••••${m.bank.accountLast4}` } : null,
      kycDocs: m.kycDocs.map((d) => ({ ...d, numberEnc: undefined, number: d.numberEnc ? decrypt(d.numberEnc) : null })),
    };
  },
});

members.patch('/:id', {
  summary: 'Edit member details / status / wallet hold / special-bonus verification',
  access: ROLES.OPS,
  body: z.object({
    fullName: z.string().min(3).optional(),
    status: z.enum(['REGISTERED', 'ACTIVE', 'BLOCKED', 'TERMINATED']).optional(),
    specialBonusVerified: z.boolean().optional(),
    walletOnHold: z.boolean().optional(),
    reason: z.string().min(3).openapi({ description: 'Required: why the change was made (kept in the audit log)' }),
  }),
  handler: async ({ params, body, req }) => {
    const before = await prisma.member.findUnique({ where: { id: params.id }, include: { wallet: true } });
    if (!before) throw notFound('Member');
    const { reason, walletOnHold, ...data } = body;
    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.member.update({ where: { id: params.id }, data });
      if (walletOnHold !== undefined) await tx.wallet.update({ where: { memberId: params.id }, data: { onHold: walletOnHold } });
      if (data.status === 'BLOCKED' || data.status === 'TERMINATED') {
        await tx.user.update({ where: { id: before.userId }, data: { isActive: false } });
        await tx.refreshToken.updateMany({ where: { userId: before.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      if (data.status === 'ACTIVE' || data.status === 'REGISTERED') await tx.user.update({ where: { id: before.userId }, data: { isActive: true } });
      await audit(req, 'MEMBER.ADMIN_UPDATE', 'Member', params.id,
        { fullName: before.fullName, status: before.status, specialBonusVerified: before.specialBonusVerified, walletOnHold: before.wallet?.onHold },
        { ...body }, tx);
    });
    return { ok: true };
  },
});

/* ======================= KYC QUEUE ======================= */
export const kyc = createModule('/admin/kyc', 'Admin · KYC');

kyc.get('/', {
  summary: 'KYC documents by status',
  access: ROLES.KYC,
  query: PageQuery.extend({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING') }),
  handler: async ({ query }) => {
    const where = { status: query.status };
    const [items, total] = await Promise.all([
      prisma.kycDocument.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { member: { select: { id: true, distributorCode: true, fullName: true } } } }),
      prisma.kycDocument.count({ where }),
    ]);
    return { items: items.map((d) => ({ ...d, numberEnc: undefined, number: d.numberEnc ? decrypt(d.numberEnc) : null })), total, page: query.page, pageSize: query.pageSize };
  },
});

kyc.post('/:id/decision', {
  summary: 'Approve or reject a KYC document',
  access: ROLES.KYC,
  body: z.object({ approve: z.boolean(), remarks: z.string().optional() }),
  handler: async ({ params, body, user, req }) => {
    const doc = await prisma.kycDocument.findUnique({ where: { id: params.id } });
    if (!doc) throw notFound('Document');
    if (!body.approve && !body.remarks) throw badRequest('Give a reason for rejection');
    await prisma.kycDocument.update({ where: { id: doc.id }, data: { status: body.approve ? 'APPROVED' : 'REJECTED', remarks: body.remarks ?? null, reviewedBy: user.id, reviewedAt: new Date() } });
    // member is KYC-approved when PAN + one address/ID proof + bank proof are approved
    const docs = await prisma.kycDocument.findMany({ where: { memberId: doc.memberId } });
    const ok = (t: string) => docs.some((d) => d.type === t && d.status === 'APPROVED');
    const anyPending = docs.some((d) => d.status === 'PENDING');
    const status = ok('PAN') && (ok('AADHAAR') || ok('OTHER')) && ok('BANK_PROOF') ? 'APPROVED' : !body.approve && !anyPending ? 'REJECTED' : 'PENDING';
    await prisma.member.update({ where: { id: doc.memberId }, data: { kycStatus: status } });
    if (status === 'APPROVED') await prisma.bankAccount.updateMany({ where: { memberId: doc.memberId }, data: { verified: true } });
    await audit(req, body.approve ? 'KYC.APPROVE' : 'KYC.REJECT', 'KycDocument', doc.id, undefined, { memberKyc: status, remarks: body.remarks });
    return { memberKycStatus: status };
  },
});

/* ======================= AUDIT LOG ======================= */
export const auditLog = createModule('/admin/audit-logs', 'Admin · Audit');

auditLog.get('/', {
  summary: 'Who changed what, and when',
  access: ROLES.AUDIT,
  query: PageQuery.extend({ entity: z.string().optional(), action: z.string().optional(), actorId: z.string().optional() }),
  handler: async ({ query }) => {
    const where: Prisma.AuditLogWhereInput = { entity: query.entity || undefined, actorId: query.actorId || undefined, action: query.action ? { contains: query.action.toUpperCase() } : undefined };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.auditLog.count({ where }),
    ]);
    const actorIds = [...new Set(items.map((i) => i.actorId).filter(Boolean))] as string[];
    const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true, role: true, member: { select: { distributorCode: true } } } });
    return {
      items: items.map((i) => {
        const a = actors.find((x) => x.id === i.actorId);
        return { ...i, actor: a ? a.member?.distributorCode ?? a.email : i.actorId, actorRole: a?.role ?? null };
      }),
      total, page: query.page, pageSize: query.pageSize,
    };
  },
});

export const roleList: Role[] = STAFF;
export { forbidden };
