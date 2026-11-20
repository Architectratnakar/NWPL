import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { Prisma, type Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createModule, PageQuery } from '../../lib/openapi';
import { ROLES, STAFF } from '../../lib/auth';
import { badRequest, forbidden, notFound } from '../../lib/http';
import { audit } from '../../lib/audit';
import { getSettings } from '../../lib/settings';
import { decrypt, encrypt } from '../../lib/crypto';

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

const MemberStatusEnum = z.enum(['REGISTERED', 'ACTIVE', 'BLOCKED', 'TERMINATED']);
const BankBody = z.object({
  holderName: z.string().trim().min(3, 'Account holder name needs at least 3 letters'),
  accountNumber: z.string().trim().regex(/^\d{9,18}$/, 'Account number must be 9–18 digits').optional().or(z.literal('')).openapi({ description: 'Empty = keep the current account number' }),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC (e.g. SBIN0001234)'),
  bankName: z.string().trim().optional().nullable(),
  verified: z.boolean().optional(),
});
const NomineeBody = z.object({
  name: z.string().trim().min(3, 'Nominee name needs at least 3 letters'),
  relation: z.string().trim().min(2, 'Enter the relation'),
  dob: z.coerce.date().optional().nullable().or(z.literal('').transform(() => null)),
});
const AddressBody = z.object({ line1: z.string().trim().optional(), city: z.string().trim().optional(), state: z.string().trim().optional(), pincode: z.string().trim().optional() });

members.patch('/:id', {
  summary: 'Edit member details / status / wallet hold / special-bonus verification',
  access: ROLES.OPS,
  body: z.object({
    fullName: z.string().trim().min(2, 'Name needs at least 2 letters').max(100).optional(),
    mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').optional().openapi({ description: 'Super Admin only — this is also the login ID' }),
    email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')).nullable().openapi({ description: 'Super Admin only. Empty = remove' }),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional().nullable().or(z.literal('').transform(() => null)),
    dob: z.coerce.date().optional().nullable().or(z.literal('').transform(() => null)),
    address: AddressBody.optional().nullable(),
    status: MemberStatusEnum.optional(),
    specialBonusVerified: z.boolean().optional(),
    walletOnHold: z.boolean().optional(),
    bank: BankBody.optional().openapi({ description: 'Super Admin only' }),
    nominee: NomineeBody.nullable().optional().openapi({ description: 'Super Admin only. null = remove the nominee' }),
    reason: z.string().trim().max(500).optional().openapi({ description: 'Why the change was made (kept in the audit log)' }),
  }),
  handler: async ({ params, body, req, user }) => {
    const before = await prisma.member.findUnique({ where: { id: params.id }, include: { wallet: true, bank: true, nominee: true, user: { select: { mobile: true, email: true } } } });
    if (!before) throw notFound('Distributor');
    const { reason, walletOnHold, mobile, email, bank, nominee, ...data } = body;
    if ((bank || nominee !== undefined) && user.role !== 'ADMIN_SUPER') throw forbidden('Only the Super Admin can change bank or nominee details');
    if (bank && !bank.accountNumber && !before.bank) throw badRequest('Enter the bank account number');

    // the login ID (mobile / email) can only be changed by the Super Admin
    const userData: Prisma.UserUpdateInput = {};
    if (mobile !== undefined && mobile !== before.user.mobile) userData.mobile = mobile;
    if (email !== undefined && (email || null) !== before.user.email) userData.email = email ? email.toLowerCase() : null;
    if (Object.keys(userData).length && user.role !== 'ADMIN_SUPER') throw forbidden('Only the Super Admin can change mobile or email');
    if (userData.mobile && (await prisma.user.findFirst({ where: { mobile: mobile!, NOT: { id: before.userId } } }))) throw badRequest(`Mobile ${mobile} is already used by another login`);
    if (userData.email && (await prisma.user.findFirst({ where: { email: userData.email as string, NOT: { id: before.userId } } }))) throw badRequest(`Email ${userData.email} is already used by another login`);

    const memberData: Prisma.MemberUpdateInput = {};
    if (data.fullName !== undefined) memberData.fullName = data.fullName;
    if (data.status !== undefined) memberData.status = data.status;
    if (data.specialBonusVerified !== undefined) memberData.specialBonusVerified = data.specialBonusVerified;
    if (data.gender !== undefined) memberData.gender = data.gender;
    if (data.dob !== undefined) memberData.dob = data.dob;
    if (data.address !== undefined) memberData.address = data.address ? (data.address as Prisma.InputJsonValue) : Prisma.JsonNull;

    await prisma.$transaction(
      async (tx) => {
        if (Object.keys(memberData).length) await tx.member.update({ where: { id: params.id }, data: memberData });
        // upsert: older members may have no wallet row yet — update() would fail with "Record not found"
        if (bank) {
          const acc = bank.accountNumber
            ? { accountNoEnc: encrypt(bank.accountNumber), accountLast4: bank.accountNumber.slice(-4) }
            : { accountNoEnc: before.bank!.accountNoEnc, accountLast4: before.bank!.accountLast4 };
          // an account entered / checked by the Super Admin counts as verified unless they untick it
          const b = { holderName: bank.holderName, ifsc: bank.ifsc, bankName: bank.bankName || null, verified: bank.verified ?? true, ...acc };
          await tx.bankAccount.upsert({ where: { memberId: params.id }, create: { memberId: params.id, ...b }, update: b });
        }
        if (nominee === null) await tx.nominee.deleteMany({ where: { memberId: params.id } });
        else if (nominee) {
          const n = { name: nominee.name, relation: nominee.relation, dob: nominee.dob ?? null };
          await tx.nominee.upsert({ where: { memberId: params.id }, create: { memberId: params.id, ...n }, update: n });
        }
        if (walletOnHold !== undefined) await tx.wallet.upsert({ where: { memberId: params.id }, create: { memberId: params.id, onHold: walletOnHold }, update: { onHold: walletOnHold } });
        if (data.status === 'BLOCKED' || data.status === 'TERMINATED') {
          await tx.user.update({ where: { id: before.userId }, data: { ...userData, isActive: false } });
          await tx.refreshToken.updateMany({ where: { userId: before.userId, revokedAt: null }, data: { revokedAt: new Date() } });
        } else if (data.status === 'ACTIVE' || data.status === 'REGISTERED') {
          await tx.user.update({ where: { id: before.userId }, data: { ...userData, isActive: true } });
        } else if (Object.keys(userData).length) {
          await tx.user.update({ where: { id: before.userId }, data: userData });
        }
        await audit(req, 'MEMBER.ADMIN_UPDATE', 'Member', params.id,
          { fullName: before.fullName, gender: before.gender, dob: before.dob, address: before.address, mobile: before.user.mobile,
            bank: before.bank ? { holderName: before.bank.holderName, last4: before.bank.accountLast4, ifsc: before.bank.ifsc, bankName: before.bank.bankName, verified: before.bank.verified } : null,
            nominee: before.nominee ? { name: before.nominee.name, relation: before.nominee.relation } : null, email: before.user.email, status: before.status, specialBonusVerified: before.specialBonusVerified, walletOnHold: before.wallet?.onHold },
          // never write the full account number into the audit log
          { ...body, bank: bank ? { ...bank, accountNumber: bank.accountNumber ? `••••${bank.accountNumber.slice(-4)}` : '(unchanged)' } : undefined, reason: reason || 'Updated by admin' }, tx);
      },
      { maxWait: 10_000, timeout: 20_000 }, // hosted databases (Render) can be slow; the default 5 s timeout made saves fail
    );
    return { ok: true };
  },
});

/* ---------- delete ---------- */
/** Why a distributor can NOT be deleted (empty list = safe to delete). Anyone with team, money or BV history must be Terminated instead. */
async function deleteBlockers(id: string) {
  const m = await prisma.member.findUnique({ where: { id }, include: { wallet: true, user: { select: { role: true, franchise: { select: { id: true } } } } } });
  if (!m) throw notFound('Distributor');
  const [children, directs, orders, bv, closing, ranks, txns, withdrawals, autopool] = await Promise.all([
    prisma.member.count({ where: { parentId: id } }),
    prisma.member.count({ where: { sponsorId: id } }),
    prisma.order.count({ where: { memberId: id } }),
    prisma.bvPosting.count({ where: { memberId: id } }),
    prisma.closingLine.count({ where: { memberId: id } }),
    prisma.memberRank.count({ where: { memberId: id } }),
    prisma.walletTxn.count({ where: { memberId: id } }),
    prisma.withdrawal.count({ where: { memberId: id } }),
    prisma.autopoolEntry.count({ where: { memberId: id } }),
  ]);
  const why: string[] = [];
  if (!m.parentId && !m.sponsorId) why.push('This is the Company ID (top of the tree)');
  if (children) why.push(`${children} member(s) are placed directly under this ID in the tree`);
  if (directs) why.push(`${directs} member(s) were sponsored by this ID`);
  if (orders) why.push(`${orders} order(s) / invoice(s)`);
  if (bv) why.push(`${bv} BV posting(s)`);
  if (closing) why.push(`${closing} closing / income line(s)`);
  if (ranks) why.push(`${ranks} rank(s) achieved`);
  if (txns) why.push(`${txns} wallet transaction(s)`);
  if (withdrawals) why.push(`${withdrawals} withdrawal(s)`);
  if (autopool) why.push('Autopool entry');
  if (m.wallet && Number(m.wallet.balance) !== 0) why.push(`Wallet balance ₹${m.wallet.balance}`);
  if (m.user.role !== 'MEMBER' || m.user.franchise) why.push('This login is also a staff / franchise login');
  return { member: m, blockers: why };
}

members.get('/:id/delete-check', {
  summary: 'Super Admin: can this distributor be deleted? Lists what is blocking it',
  access: ROLES.SUPER,
  handler: async ({ params }) => {
    const { member, blockers } = await deleteBlockers(params.id);
    return { code: member.distributorCode, name: member.fullName, status: member.status, canDelete: blockers.length === 0, blockers };
  },
});

members.delete('/:id', {
  summary: 'Super Admin: permanently delete a distributor that has no team, orders, BV or money history',
  access: ROLES.SUPER,
  query: z.object({ confirm: z.string().trim().openapi({ description: 'Type the distributor code (e.g. NW100123) to confirm' }), reason: z.string().trim().max(500).optional() }),
  handler: async ({ params, query, req }) => {
    const { member: m, blockers } = await deleteBlockers(params.id);
    if (query.confirm.toUpperCase() !== m.distributorCode) throw badRequest(`Type ${m.distributorCode} to confirm the delete`);
    if (blockers.length) throw badRequest(`${m.distributorCode} cannot be deleted: ${blockers.join('; ')}. Set the status to Terminated instead.`);
    const docs = await prisma.kycDocument.findMany({ where: { memberId: m.id }, select: { id: true } });
    await prisma.$transaction(
      async (tx) => {
        await tx.ticket.deleteMany({ where: { memberId: m.id } });
        await tx.kycDocument.deleteMany({ where: { memberId: m.id } });
        await tx.bankAccount.deleteMany({ where: { memberId: m.id } });
        await tx.nominee.deleteMany({ where: { memberId: m.id } });
        await tx.nodeVolume.deleteMany({ where: { memberId: m.id } });
        await tx.wallet.deleteMany({ where: { memberId: m.id } });
        await tx.franchise.updateMany({ where: { ownerMemberId: m.id }, data: { ownerMemberId: null } });
        await tx.member.delete({ where: { id: m.id } });
        await tx.refreshToken.deleteMany({ where: { userId: m.userId } });
        await tx.otpCode.deleteMany({ where: { userId: m.userId } });
        await tx.user.delete({ where: { id: m.userId } });
        // the audit log keeps a record of who was deleted and why (the audit log itself can never be deleted)
        await audit(req, 'MEMBER.DELETE', 'Member', m.id,
          { code: m.distributorCode, name: m.fullName, status: m.status, sponsorId: m.sponsorId, parentId: m.parentId, side: m.side, kycDocs: docs.length },
          { reason: query.reason || 'Deleted by Super Admin' }, tx);
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    return { ok: true, code: m.distributorCode };
  },
});

members.post('/:id/reset-password', {
  summary: 'Super Admin: set or generate a new password for a distributor (logs them out everywhere)',
  access: ROLES.SUPER,
  body: z.object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Needs a capital letter')
      .regex(/[0-9]/, 'Needs a number')
      .optional()
      .openapi({ description: 'Leave empty to generate a strong password automatically' }),
  }),
  handler: async ({ params, body, req }) => {
    const m = await prisma.member.findUnique({ where: { id: params.id }, include: { user: { select: { id: true } } } });
    if (!m) throw notFound('Distributor');
    const generated = !body.password;
    const password = body.password ?? generatePassword();
    await prisma.$transaction([
      prisma.user.update({ where: { id: m.user.id }, data: { passwordHash: await bcrypt.hash(password, 10) } }),
      prisma.refreshToken.updateMany({ where: { userId: m.user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    // the password itself is never written to the audit log
    await audit(req, 'MEMBER.RESET_PASSWORD', 'Member', m.id, undefined, { code: m.distributorCode, generated });
    return { code: m.distributorCode, name: m.fullName, generated, password: generated ? password : undefined };
  },
});

/** Easy to read out on the phone: no 0/O or 1/l/I. Always has a capital, a number and a symbol. */
function generatePassword() {
  const pick = (s: string) => s[crypto.randomInt(s.length)];
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnopqrstuvwxyz', D = '23456789';
  return `${pick(U)}${pick(L)}${pick(L)}${pick(L)}@${pick(D)}${pick(D)}${pick(D)}${pick(D)}`;
}

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
