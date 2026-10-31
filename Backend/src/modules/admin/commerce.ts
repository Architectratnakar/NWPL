import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createModule, PageQuery } from '../../lib/openapi';
import { ROLES } from '../../lib/auth';
import { badRequest, notFound } from '../../lib/http';
import { audit } from '../../lib/audit';
import { approveReturn, currentPrices, markOrderPaid } from '../../services/orders';

/* ======================= PRODUCTS ======================= */
export const products = createModule('/admin/products', 'Admin · Products');

products.get('/', {
  summary: 'All products with current price',
  access: ROLES.STAFF,
  handler: async () => {
    const list = await prisma.product.findMany({ orderBy: { id: 'asc' } });
    const prices = await currentPrices();
    return list.map((p) => {
      const pr = prices.get(p.id);
      return { ...p, mrp: pr?.mrp ?? null, dp: pr?.dp ?? null, bv: pr?.bv ?? null, priceFrom: pr?.effectiveFrom ?? null };
    });
  },
});

const ProductBody = z.object({
  sku: z.string().min(2), name: z.string().min(2), category: z.string().optional().nullable(), hsnCode: z.string().optional().nullable(),
  gstRate: z.number().min(0).max(28), description: z.string().optional().nullable(), isActive: z.boolean().default(true), stock: z.number().int().min(0).default(0),
});
const PriceBody = z.object({ mrp: z.number().positive(), dp: z.number().positive(), bv: z.number().min(0) }).refine((v) => v.dp <= v.mrp, 'DP cannot be more than MRP');

products.post('/', {
  summary: 'Create a product with its first price',
  access: ROLES.OPS,
  body: ProductBody.extend({ price: PriceBody }),
  handler: async ({ body, req }) => {
    const { price, ...data } = body;
    const p = await prisma.product.create({ data: { ...data, prices: { create: price } } });
    await audit(req, 'PRODUCT.CREATE', 'Product', String(p.id), undefined, body);
    return p;
  },
});

products.patch('/:id', {
  summary: 'Edit product details (not price)',
  access: ROLES.OPS,
  body: ProductBody.partial(),
  handler: async ({ params, body, req }) => {
    const before = await prisma.product.findUnique({ where: { id: Number(params.id) } });
    if (!before) throw notFound('Product');
    const p = await prisma.product.update({ where: { id: before.id }, data: body });
    await audit(req, 'PRODUCT.UPDATE', 'Product', params.id, before, body);
    return p;
  },
});

products.post('/:id/prices', {
  summary: 'Set a new price version (old orders keep their old price & BV)',
  access: ROLES.OPS,
  body: PriceBody,
  handler: async ({ params, body, req }) => {
    const id = Number(params.id);
    const now = new Date();
    await prisma.$transaction([
      prisma.productPrice.updateMany({ where: { productId: id, effectiveTo: null }, data: { effectiveTo: now } }),
      prisma.productPrice.create({ data: { productId: id, ...body, effectiveFrom: now } }),
    ]);
    await audit(req, 'PRODUCT.PRICE', 'Product', params.id, undefined, body);
    return prisma.productPrice.findMany({ where: { productId: id }, orderBy: { effectiveFrom: 'desc' } });
  },
});

products.get('/:id/prices', {
  summary: 'Price history',
  access: ROLES.STAFF,
  handler: ({ params }) => prisma.productPrice.findMany({ where: { productId: Number(params.id) }, orderBy: { effectiveFrom: 'desc' } }),
});

/* ======================= PACKAGES ======================= */
export const packages = createModule('/admin/packages', 'Admin · Packages');

packages.get('/', {
  summary: 'Packages with bundles',
  access: ROLES.STAFF,
  handler: () => prisma.package.findMany({ orderBy: { id: 'asc' }, include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } } }),
});

packages.put('/:id', {
  summary: 'Update a package: name, price, BV, active and product bundle',
  access: ROLES.SUPER,
  body: z.object({
    name: z.string().min(3), price: z.number().positive(), bv: z.number().positive(), isActive: z.boolean(),
    items: z.array(z.object({ productId: z.number().int(), qty: z.number().int().min(1) })),
  }),
  handler: async ({ params, body, req }) => {
    const id = Number(params.id);
    const before = await prisma.package.findUnique({ where: { id }, include: { items: true } });
    if (!before) throw notFound('Package');
    await prisma.$transaction([
      prisma.packageItem.deleteMany({ where: { packageId: id } }),
      prisma.package.update({ where: { id }, data: { name: body.name, price: body.price, bv: body.bv, isActive: body.isActive, items: { create: body.items } } }),
    ]);
    await audit(req, 'PACKAGE.UPDATE', 'Package', params.id, before, body);
    return { ok: true };
  },
});

/* ======================= RANKS & REWARDS ======================= */
export const ranks = createModule('/admin/ranks', 'Admin · Ranks');

ranks.get('/', {
  summary: 'Rank master with achiever counts',
  access: ROLES.STAFF,
  handler: async () => {
    const [list, counts] = await Promise.all([prisma.rank.findMany({ orderBy: { id: 'asc' } }), prisma.memberRank.groupBy({ by: ['rankId'], _count: true })]);
    return list.map((r) => ({ ...r, achievers: counts.find((c) => c.rankId === r.id)?._count ?? 0 }));
  },
});

ranks.put('/:id', {
  summary: 'Edit rank threshold / bonus / reward',
  access: ROLES.SUPER,
  body: z.object({ name: z.string(), nameHi: z.string().optional().nullable(), thresholdBv: z.number().positive(), bonusAmount: z.number().min(0), reward: z.string().optional().nullable(), confirmed: z.boolean() }),
  handler: async ({ params, body, req }) => {
    const before = await prisma.rank.findUnique({ where: { id: Number(params.id) } });
    if (!before) throw notFound('Rank');
    await prisma.rank.update({ where: { id: before.id }, data: body });
    await audit(req, 'RANK.UPDATE', 'Rank', params.id, before, body);
    return { ok: true };
  },
});

ranks.get('/achievers', {
  summary: 'Rank achievers & reward fulfilment',
  access: ROLES.STAFF,
  query: PageQuery.extend({ rankId: z.coerce.number().optional(), rewardStatus: z.string().optional() }),
  handler: async ({ query }) => {
    const where: Prisma.MemberRankWhereInput = { rankId: query.rankId, rewardStatus: query.rewardStatus };
    const [items, total] = await Promise.all([
      prisma.memberRank.findMany({ where, orderBy: { achievedAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { rank: true, member: { select: { distributorCode: true, fullName: true } } } }),
      prisma.memberRank.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
});

ranks.patch('/achievers/:id', {
  summary: 'Update reward status (PENDING → CONFIRMED → COMPLETED / CASH_OPTION)',
  access: ROLES.OPS,
  body: z.object({ rewardStatus: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CASH_OPTION']) }),
  handler: async ({ params, body, req }) => {
    await prisma.memberRank.update({ where: { id: params.id }, data: body });
    await audit(req, 'REWARD.UPDATE', 'MemberRank', params.id, undefined, body);
    return { ok: true };
  },
});

/* ======================= ORDERS & RETURNS ======================= */
export const orders = createModule('/admin/orders', 'Admin · Orders');

orders.get('/', {
  summary: 'All orders',
  access: ROLES.STAFF,
  query: PageQuery.extend({
    q: z.string().optional(),
    type: z.enum(['JOINING', 'UPGRADE', 'REPURCHASE', 'RETAIL']).optional(),
    status: z.enum(['PENDING_PAYMENT', 'PAID', 'INVOICED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']).optional(),
  }),
  handler: async ({ query }) => {
    const where: Prisma.OrderWhereInput = {
      type: query.type, status: query.status,
      ...(query.q ? { OR: [{ orderNo: { contains: query.q.toUpperCase() } }, { invoiceNo: { contains: query.q.toUpperCase() } }, { member: { distributorCode: { contains: query.q.toUpperCase() } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { member: { select: { distributorCode: true, fullName: true } } } }),
      prisma.order.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
});

orders.patch('/:id/status', {
  summary: 'Move an order through dispatch (SHIPPED / DELIVERED / CANCELLED) or mark a pending order paid (cash at franchise)',
  access: ROLES.OPS,
  body: z.object({ status: z.enum(['PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED']), note: z.string().optional() }),
  handler: async ({ params, body, req }) => {
    const o = await prisma.order.findUnique({ where: { id: params.id } });
    if (!o) throw notFound('Order');
    if (body.status === 'PAID') {
      if (o.status !== 'PENDING_PAYMENT') throw badRequest('Only unpaid orders can be marked paid');
      await markOrderPaid(o.id, 'CASH_FRANCHISE', `CASH-${Date.now()}`);
    } else if (body.status === 'CANCELLED') {
      if (o.status !== 'PENDING_PAYMENT') throw badRequest('Paid orders must go through a return, not cancel');
      await prisma.order.update({ where: { id: o.id }, data: { status: 'CANCELLED' } });
    } else {
      if (!['INVOICED', 'PAID', 'SHIPPED'].includes(o.status)) throw badRequest(`Cannot move a ${o.status} order to ${body.status}`);
      await prisma.order.update({ where: { id: o.id }, data: { status: body.status } });
    }
    await audit(req, 'ORDER.STATUS', 'Order', o.id, { status: o.status }, body);
    return { ok: true };
  },
});

export const returns = createModule('/admin/returns', 'Admin · Returns');

returns.get('/', {
  summary: 'Return / buy-back requests',
  access: ROLES.STAFF,
  query: PageQuery.extend({ status: z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED']).optional() }),
  handler: async ({ query }) => {
    const where = { status: query.status };
    const [items, total] = await Promise.all([
      prisma.returnRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { order: { include: { member: { select: { distributorCode: true, fullName: true } } } } } }),
      prisma.returnRequest.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
});

returns.post('/:id/decision', {
  summary: 'Approve (refund + reverse BV) or reject a return',
  access: ROLES.OPS,
  body: z.object({ approve: z.boolean() }),
  handler: async ({ params, body, req }) => {
    if (body.approve) await approveReturn(params.id);
    else await prisma.returnRequest.update({ where: { id: params.id }, data: { status: 'REJECTED' } });
    await audit(req, body.approve ? 'RETURN.APPROVE' : 'RETURN.REJECT', 'ReturnRequest', params.id);
    return { ok: true };
  },
});
