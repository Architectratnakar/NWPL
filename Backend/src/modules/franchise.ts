import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createModule, PageQuery } from '../lib/openapi';
import { ROLES, type AuthUser } from '../lib/auth';
import { AppError, badRequest, notFound } from '../lib/http';
import { audit } from '../lib/audit';
import { createOrder, currentPrices, markOrderPaid, packagePrice } from '../services/orders';
import { nextFranchiseCode, transferStock } from '../services/franchise';
import { renderInvoice } from '../services/invoice';

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const istDayStart = () => new Date(Date.now() - ((Date.now() + 330 * 60_000) % 86_400_000));
const istMonthStart = () => {
  const n = new Date(Date.now() + 330 * 60_000);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1) - 330 * 60_000);
};
const PAID_STATUSES: Prisma.OrderWhereInput['status'] = { in: ['PAID', 'INVOICED', 'SHIPPED', 'DELIVERED'] };

const FranchiseType = z.enum(['MINI', 'DISTRICT', 'STATE', 'MASTER']);
const Address = z.object({ line1: z.string().optional(), city: z.string().optional(), state: z.string().optional(), pincode: z.string().optional() }).partial();
const GSTIN = z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN').optional().or(z.literal(''));

/** Stats for a set of franchises in one go (list page + detail). */
async function franchiseStats(ids: string[]) {
  if (!ids.length) return new Map<string, { stockUnits: number; sales: number; salesCount: number; commissionPending: number; commissionPaid: number }>();
  const [stock, sales, comm] = await Promise.all([
    prisma.franchiseStock.groupBy({ by: ['franchiseId'], where: { franchiseId: { in: ids } }, _sum: { qty: true } }),
    prisma.order.groupBy({ by: ['franchiseId'], where: { franchiseId: { in: ids }, status: PAID_STATUSES }, _sum: { grandTotal: true }, _count: true }),
    prisma.franchiseCommission.groupBy({ by: ['franchiseId', 'status'], where: { franchiseId: { in: ids } }, _sum: { amount: true } }),
  ]);
  return new Map(
    ids.map((id) => [
      id,
      {
        stockUnits: num(stock.find((s) => s.franchiseId === id)?._sum.qty),
        sales: num(sales.find((s) => s.franchiseId === id)?._sum.grandTotal),
        salesCount: sales.find((s) => s.franchiseId === id)?._count ?? 0,
        commissionPending: num(comm.find((c) => c.franchiseId === id && c.status === 'PENDING')?._sum.amount),
        commissionPaid: num(comm.find((c) => c.franchiseId === id && c.status === 'PAID')?._sum.amount),
      },
    ]),
  );
}

/** Products with the franchise's stock and the current price row. */
async function stockList(franchiseId: string) {
  const [products, stock, prices] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, orderBy: { id: 'asc' }, select: { id: true, sku: true, name: true, category: true, imageUrl: true, stock: true } }),
    prisma.franchiseStock.findMany({ where: { franchiseId } }),
    currentPrices(),
  ]);
  return products.map((p) => {
    const pr = prices.get(p.id);
    return {
      productId: p.id, sku: p.sku, name: p.name, category: p.category, imageUrl: p.imageUrl, companyStock: p.stock,
      qty: stock.find((s) => s.productId === p.id)?.qty ?? 0,
      mrp: num(pr?.mrp), dp: num(pr?.dp), bv: num(pr?.bv),
    };
  });
}

/* ================================ ADMIN ================================ */
export const admin = createModule('/admin/franchises', 'Admin · Franchises');
const VIEW = ['ADMIN_SUPER', 'ADMIN_OPS', 'ADMIN_FINANCE'] as AuthUser['role'][];

admin.get('/', {
  summary: 'All franchises with stock, sales and commission totals',
  access: VIEW,
  query: PageQuery.extend({ q: z.string().trim().optional(), status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']).optional() }),
  handler: async ({ query }) => {
    const where: Prisma.FranchiseWhereInput = {
      status: query.status,
      ...(query.q ? { OR: [{ code: { contains: query.q.toUpperCase() } }, { name: { contains: query.q, mode: 'insensitive' } }, { ownerName: { contains: query.q, mode: 'insensitive' } }, { mobile: { contains: query.q } }, { territory: { contains: query.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total, kpi] = await Promise.all([
      prisma.franchise.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { ownerMember: { select: { distributorCode: true } } } }),
      prisma.franchise.count({ where }),
      Promise.all([
        prisma.franchise.groupBy({ by: ['status'], _count: true }),
        prisma.order.aggregate({ where: { franchiseId: { not: null }, status: PAID_STATUSES, paidAt: { gte: istMonthStart() } }, _sum: { grandTotal: true }, _count: true }),
        prisma.franchiseCommission.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true }, _count: true }),
      ]),
    ]);
    const stats = await franchiseStats(rows.map((r) => r.id));
    const [byStatus, month, pending] = kpi;
    return {
      items: rows.map((r) => ({ ...r, ownerCode: r.ownerMember?.distributorCode ?? null, ownerMember: undefined, stats: stats.get(r.id) })),
      total, page: query.page, pageSize: query.pageSize,
      summary: {
        active: byStatus.find((s) => s.status === 'ACTIVE')?._count ?? 0,
        suspended: byStatus.find((s) => s.status === 'SUSPENDED')?._count ?? 0,
        closed: byStatus.find((s) => s.status === 'CLOSED')?._count ?? 0,
        monthSales: num(month._sum.grandTotal), monthOrders: month._count,
        commissionPending: num(pending._sum.amount), commissionPendingCount: pending._count,
      },
    };
  },
});

/* --- commissions (registered before '/:id' so the path is not taken as an id) --- */
admin.get('/commissions', {
  summary: 'Franchise commission ledger (filter by status / franchise)',
  access: VIEW,
  query: PageQuery.extend({ status: z.enum(['PENDING', 'PAID', 'CANCELLED']).optional(), franchiseId: z.string().optional() }),
  handler: async ({ query }) => {
    const where: Prisma.FranchiseCommissionWhereInput = { status: query.status, franchiseId: query.franchiseId };
    const [items, total, sum] = await Promise.all([
      prisma.franchiseCommission.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { franchise: { select: { code: true, name: true } }, order: { select: { orderNo: true, invoiceNo: true, type: true, grandTotal: true, member: { select: { distributorCode: true, fullName: true } } } } },
      }),
      prisma.franchiseCommission.count({ where }),
      prisma.franchiseCommission.aggregate({ where, _sum: { amount: true } }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize, amount: num(sum._sum.amount) };
  },
});

admin.post('/commissions/pay', {
  summary: 'Mark PENDING commission lines as paid (bank transfer UTR)',
  access: ROLES.FINANCE,
  body: z.object({ ids: z.array(z.string()).min(1).max(500), utr: z.string().trim().min(4) }),
  handler: async ({ body, user, req }) => {
    const r = await prisma.franchiseCommission.updateMany({ where: { id: { in: body.ids }, status: 'PENDING' }, data: { status: 'PAID', utr: body.utr, paidBy: user.id, paidAt: new Date() } });
    await audit(req, 'FRANCHISE.COMMISSION_PAID', 'FranchiseCommission', body.ids.join(',').slice(0, 190), undefined, { count: r.count, utr: body.utr });
    return { paid: r.count };
  },
});

admin.get('/check-partner/:code', {
  summary: 'Check a distributor ID before giving them a franchise',
  access: ROLES.OPS,
  handler: async ({ params }) => {
    const m = await prisma.member.findUnique({ where: { distributorCode: params.code.trim().toUpperCase() }, include: { user: { select: { mobile: true, email: true, role: true } } } });
    if (!m) throw notFound('Distributor');
    const owns = await prisma.franchise.findUnique({ where: { userId: m.userId }, select: { code: true } });
    return { code: m.distributorCode, name: m.fullName, status: m.status, kycStatus: m.kycStatus, mobile: m.user.mobile, email: m.user.email, alreadyFranchise: owns?.code ?? null };
  },
});

const Partner = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('EXISTING'), distributorCode: z.string().trim().min(3) }),
  z.object({
    mode: z.literal('NEW'),
    name: z.string().trim().min(3),
    mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
    email: z.string().email().optional().or(z.literal('')),
    password: z.string().min(8).regex(/[A-Z]/, 'needs a capital letter').regex(/[0-9]/, 'needs a number'),
  }),
]);
const FranchiseFields = z.object({
  name: z.string().trim().min(3).openapi({ description: 'Outlet / shop name', example: 'Navarth Wellness Store – Indore' }),
  type: FranchiseType.default('MINI'),
  gstin: GSTIN,
  territory: z.string().trim().max(200).optional(),
  address: Address.optional(),
  commissionPercent: z.number().min(0).max(50),
  securityDeposit: z.number().min(0).nullable().optional(),
  agreementStart: z.coerce.date().nullable().optional(),
  agreementEnd: z.coerce.date().nullable().optional(),
});

admin.post('/', {
  summary: 'Give a franchise to a partner — an existing distributor, or a new partner (creates a franchise login)',
  access: ROLES.OPS,
  body: FranchiseFields.extend({ partner: Partner }),
  handler: async ({ body, user, req }) => {
    const f = await prisma.$transaction(async (tx) => {
      let userId: string, ownerMemberId: string | null = null, ownerName: string, mobile: string, email: string | null;
      if (body.partner.mode === 'EXISTING') {
        const m = await tx.member.findUnique({ where: { distributorCode: body.partner.distributorCode.toUpperCase() }, include: { user: true } });
        if (!m) throw notFound('Distributor');
        if (m.status === 'BLOCKED' || m.status === 'TERMINATED') throw badRequest('This distributor ID is blocked / terminated');
        if (!['MEMBER', 'FRANCHISE'].includes(m.user.role)) throw badRequest('Staff logins cannot own a franchise');
        if (await tx.franchise.findUnique({ where: { userId: m.userId } })) throw badRequest('This distributor already has a franchise');
        await tx.user.update({ where: { id: m.userId }, data: { role: 'FRANCHISE' } });
        userId = m.userId; ownerMemberId = m.id; ownerName = m.fullName; mobile = m.user.mobile; email = m.user.email;
      } else {
        const p = body.partner;
        const u = await tx.user.create({ data: { mobile: p.mobile, email: p.email ? p.email.toLowerCase() : null, role: 'FRANCHISE', passwordHash: await bcrypt.hash(p.password, 10) } });
        userId = u.id; ownerName = p.name; mobile = p.mobile; email = u.email;
      }
      return tx.franchise.create({
        data: {
          code: await nextFranchiseCode(tx), name: body.name, type: body.type, userId, ownerMemberId, ownerName, mobile, email,
          gstin: body.gstin || null, territory: body.territory || null, address: body.address ?? undefined,
          commissionPercent: body.commissionPercent, securityDeposit: body.securityDeposit ?? null,
          agreementStart: body.agreementStart ?? null, agreementEnd: body.agreementEnd ?? null, createdBy: user.id,
        },
      });
    });
    await audit(req, 'FRANCHISE.CREATE', 'Franchise', f.id, undefined, { code: f.code, name: f.name, partner: body.partner.mode, commissionPercent: body.commissionPercent });
    return f;
  },
});

admin.get('/:id', {
  summary: 'Franchise detail: profile, stock, recent sales and commission',
  access: VIEW,
  handler: async ({ params }) => {
    const f = await prisma.franchise.findUnique({ where: { id: params.id }, include: { ownerMember: { select: { id: true, distributorCode: true, fullName: true } }, user: { select: { id: true, isActive: true, lastLoginAt: true } } } });
    if (!f) throw notFound('Franchise');
    const [stock, sales, stats] = await Promise.all([
      stockList(f.id),
      prisma.order.findMany({ where: { franchiseId: f.id }, orderBy: { createdAt: 'desc' }, take: 15, include: { member: { select: { distributorCode: true, fullName: true } }, franchiseCommission: { select: { amount: true, status: true } } } }),
      franchiseStats([f.id]),
    ]);
    return { franchise: f, stock, sales, stats: stats.get(f.id) };
  },
});

admin.patch('/:id', {
  summary: 'Edit a franchise, or suspend / close / re-activate it',
  access: ROLES.OPS,
  body: FranchiseFields.partial().extend({ status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']).optional(), reason: z.string().trim().min(3) }),
  handler: async ({ params, body, req }) => {
    const before = await prisma.franchise.findUnique({ where: { id: params.id }, include: { user: true } });
    if (!before) throw notFound('Franchise');
    const { reason, ...data } = body;
    const f = await prisma.$transaction(async (tx) => {
      const updated = await tx.franchise.update({ where: { id: params.id }, data: { ...data, gstin: data.gstin === '' ? null : data.gstin, address: data.address ?? undefined } });
      if (data.status && data.status !== before.status) {
        if (data.status === 'CLOSED') {
          if (before.ownerMemberId) await tx.user.update({ where: { id: before.userId }, data: { role: 'MEMBER' } }); // distributor keeps their member login
          else {
            await tx.user.update({ where: { id: before.userId }, data: { isActive: false } });
            await tx.refreshToken.updateMany({ where: { userId: before.userId, revokedAt: null }, data: { revokedAt: new Date() } });
          }
        } else if (before.status === 'CLOSED') {
          await tx.user.update({ where: { id: before.userId }, data: { role: 'FRANCHISE', isActive: true } });
        }
      }
      return updated;
    });
    await audit(req, 'FRANCHISE.UPDATE', 'Franchise', f.id, { status: before.status, commissionPercent: before.commissionPercent }, { ...data, reason });
    return f;
  },
});

admin.post('/:id/stock', {
  summary: 'Allot company stock to the franchise, or take stock back',
  access: ROLES.OPS,
  body: z.object({
    direction: z.enum(['ALLOT', 'TAKE_BACK']),
    items: z.array(z.object({ productId: z.number().int(), qty: z.number().int().min(1).max(100_000) })).min(1),
    note: z.string().trim().max(200).optional(),
  }),
  handler: async ({ params, body, user, req }) => {
    const r = await transferStock(params.id, body.items, body.direction, user.id, body.note);
    await audit(req, `FRANCHISE.STOCK_${body.direction}`, 'Franchise', params.id, undefined, body);
    return r;
  },
});

admin.get('/:id/stock-ledger', {
  summary: 'Stock movements of a franchise',
  access: VIEW,
  query: PageQuery,
  handler: async ({ params, query }) => {
    const where = { franchiseId: params.id };
    const [items, total] = await Promise.all([
      prisma.franchiseStockTxn.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { product: { select: { name: true, sku: true } } } }),
      prisma.franchiseStockTxn.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
});

/* ============================ FRANCHISE PANEL ============================ */
export const panel = createModule('/franchise', 'Franchise panel');
const FR = ['FRANCHISE'] as AuthUser['role'][];

async function myFranchise(user: AuthUser, mustBeActive = false) {
  const f = await prisma.franchise.findUnique({ where: { userId: user.id } });
  if (!f || f.status === 'CLOSED') throw new AppError(403, 'NO_FRANCHISE', 'No active franchise is linked to this login');
  if (mustBeActive && f.status !== 'ACTIVE') throw new AppError(403, 'FRANCHISE_SUSPENDED', 'Your franchise is suspended. Please contact the company.');
  return f;
}

panel.get('/me', {
  summary: 'My franchise: profile and today / this month figures',
  access: FR,
  handler: async ({ user }) => {
    const f = await myFranchise(user);
    const [stats, stock, today, month, recent] = await Promise.all([
      franchiseStats([f.id]),
      stockList(f.id),
      prisma.order.aggregate({ where: { franchiseId: f.id, status: PAID_STATUSES, paidAt: { gte: istDayStart() } }, _sum: { grandTotal: true, bvTotal: true }, _count: true }),
      prisma.order.aggregate({ where: { franchiseId: f.id, status: PAID_STATUSES, paidAt: { gte: istMonthStart() } }, _sum: { grandTotal: true, bvTotal: true }, _count: true }),
      prisma.order.findMany({ where: { franchiseId: f.id }, orderBy: { createdAt: 'desc' }, take: 8, include: { member: { select: { distributorCode: true, fullName: true } } } }),
    ]);
    return {
      franchise: f,
      stats: stats.get(f.id),
      stockValueDp: stock.reduce((a, s) => a + s.qty * s.dp, 0),
      lowStock: stock.filter((s) => s.qty > 0 && s.qty <= 5).length,
      today: { sales: num(today._sum.grandTotal), bv: num(today._sum.bvTotal), orders: today._count },
      month: { sales: num(month._sum.grandTotal), bv: num(month._sum.bvTotal), orders: month._count },
      recent,
    };
  },
});

panel.get('/stock', { summary: 'My stock with current prices', access: FR, handler: async ({ user }) => stockList((await myFranchise(user)).id) });

panel.get('/stock-ledger', {
  summary: 'My stock movements',
  access: FR,
  query: PageQuery,
  handler: async ({ user, query }) => {
    const where = { franchiseId: (await myFranchise(user)).id };
    const [items, total] = await Promise.all([
      prisma.franchiseStockTxn.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { product: { select: { name: true, sku: true } } } }),
      prisma.franchiseStockTxn.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
});

panel.get('/packages', {
  summary: 'Joining / upgrade packages that can be sold at the counter',
  access: FR,
  handler: async ({ user }) => {
    await myFranchise(user);
    const pkgs = await prisma.package.findMany({ where: { isActive: true }, orderBy: { id: 'asc' }, include: { items: { include: { product: { select: { name: true } } } } } });
    return Promise.all(pkgs.map(async (p) => ({ code: p.code, name: p.name, bv: p.bv, tier: p.tier, isUpgrade: p.isUpgrade, price: (await packagePrice(p)).price, items: p.items.map((i) => ({ productId: i.productId, name: i.product.name, qty: i.qty })) })));
  },
});

panel.get('/member/:code', {
  summary: 'Look up a distributor before billing',
  access: FR,
  handler: async ({ user, params }) => {
    await myFranchise(user);
    const m = await prisma.member.findUnique({ where: { distributorCode: params.code.trim().toUpperCase() }, select: { distributorCode: true, fullName: true, status: true, packageTier: true } });
    if (!m) throw notFound('Distributor ID');
    const ok = m.status !== 'BLOCKED' && m.status !== 'TERMINATED';
    return { ...m, canRepurchase: ok && m.packageTier !== 'NONE', canJoin: ok && m.packageTier === 'NONE', canUpgrade: ok && m.packageTier === 'BASIC' };
  },
});

panel.post('/sales', {
  summary: 'Bill a distributor at the counter (stock comes out of the franchise stock, BV is credited to the distributor)',
  access: FR,
  body: z.object({
    distributorCode: z.string().trim().min(3),
    type: z.enum(['REPURCHASE', 'JOINING', 'UPGRADE']),
    items: z.array(z.object({ productId: z.number().int(), qty: z.number().int().min(1).max(99) })).optional(),
    packageCode: z.string().optional(),
    paymentMode: z.enum(['CASH', 'UPI', 'CARD']),
    paymentRef: z.string().trim().max(60).optional(),
  }),
  handler: async ({ user, body, req }) => {
    const f = await myFranchise(user, true);
    const code = body.distributorCode.toUpperCase();
    const m = await prisma.member.findUnique({ where: { distributorCode: code }, select: { id: true, packageTier: true, status: true } });
    if (!m) throw notFound('Distributor ID');
    if (m.status === 'BLOCKED' || m.status === 'TERMINATED') throw badRequest(`${code} is ${m.status.toLowerCase()} — it cannot be billed`);
    if (body.type === 'JOINING' && m.packageTier !== 'NONE') throw badRequest(`${code} is already activated — bill a repurchase instead`);
    if (body.type === 'UPGRADE' && m.packageTier !== 'BASIC') throw badRequest(`Only 40 BV IDs can be upgraded (${code} is ${m.packageTier === 'NONE' ? 'not activated' : 'already 100 BV'})`);
    if (body.type === 'REPURCHASE' && m.packageTier === 'NONE') throw badRequest(`${code} is not activated yet — bill a joining package first`);
    if (body.type === 'REPURCHASE' && !body.items?.length) throw badRequest('Add at least one product');
    if (body.type !== 'REPURCHASE' && !body.packageCode) throw badRequest('Choose a package');

    // friendly stock check before anything is created (the real check is atomic inside markOrderPaid)
    const need = new Map<number, number>();
    if (body.type === 'REPURCHASE') for (const i of body.items!) need.set(i.productId, (need.get(i.productId) ?? 0) + i.qty);
    else {
      const pkg = await prisma.package.findUnique({ where: { code: body.packageCode! }, include: { items: true } });
      if (!pkg) throw badRequest('Package not found');
      for (const i of pkg.items) need.set(i.productId, (need.get(i.productId) ?? 0) + i.qty);
    }
    const stock = await prisma.franchiseStock.findMany({ where: { franchiseId: f.id, productId: { in: [...need.keys()] } }, include: { product: { select: { name: true } } } });
    for (const [pid, qty] of need) {
      const s = stock.find((x) => x.productId === pid);
      if (!s || s.qty < qty) {
        const name = s?.product.name ?? (await prisma.product.findUnique({ where: { id: pid }, select: { name: true } }))?.name ?? `product ${pid}`;
        throw badRequest(`Not enough stock of ${name} (you have ${s?.qty ?? 0}, need ${qty})`);
      }
    }

    const order = await createOrder({ memberId: m.id, type: body.type, items: body.items, packageCode: body.packageCode, franchiseId: f.id });
    try {
      const paid = await markOrderPaid(order.id, `FRANCHISE_${body.paymentMode}`, `${f.code}-${order.id}`, user.id);
      await audit(req, 'FRANCHISE.SALE', 'Order', order.id, undefined, { franchise: f.code, member: body.distributorCode, type: body.type, total: order.grandTotal, paymentMode: body.paymentMode, paymentRef: body.paymentRef });
      return paid;
    } catch (e) {
      await prisma.order.updateMany({ where: { id: order.id, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED' } });
      throw e;
    }
  },
});

panel.get('/sales', {
  summary: 'Orders billed at my counter',
  access: FR,
  query: PageQuery.extend({ q: z.string().trim().optional() }),
  handler: async ({ user, query }) => {
    const f = await myFranchise(user);
    const where: Prisma.OrderWhereInput = {
      franchiseId: f.id,
      ...(query.q ? { OR: [{ orderNo: { contains: query.q.toUpperCase() } }, { member: { distributorCode: { contains: query.q.toUpperCase() } } }, { member: { fullName: { contains: query.q, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { member: { select: { distributorCode: true, fullName: true } }, franchiseCommission: { select: { amount: true, status: true } }, payments: { select: { gateway: true } } } }),
      prisma.order.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
});

panel.get('/sales/:id/invoice', {
  summary: 'Printable GST invoice of a counter sale',
  access: FR,
  raw: true,
  handler: async ({ user, params, res }) => {
    const f = await myFranchise(user);
    const o = await prisma.order.findUnique({ where: { id: params.id } });
    if (!o || o.franchiseId !== f.id) throw notFound('Order');
    if (!o.invoiceNo) throw badRequest('Invoice is generated after payment');
    res.type('html').send(await renderInvoice(o.id));
  },
});

panel.get('/commissions', {
  summary: 'My commission lines',
  access: FR,
  query: PageQuery.extend({ status: z.enum(['PENDING', 'PAID', 'CANCELLED']).optional() }),
  handler: async ({ user, query }) => {
    const f = await myFranchise(user);
    const where: Prisma.FranchiseCommissionWhereInput = { franchiseId: f.id, status: query.status };
    const [items, total, byStatus] = await Promise.all([
      prisma.franchiseCommission.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { order: { select: { orderNo: true, type: true, grandTotal: true, member: { select: { distributorCode: true, fullName: true } } } } } }),
      prisma.franchiseCommission.count({ where }),
      prisma.franchiseCommission.groupBy({ by: ['status'], where: { franchiseId: f.id }, _sum: { amount: true } }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize, totals: Object.fromEntries(byStatus.map((b) => [b.status, num(b._sum.amount)])) };
  },
});
