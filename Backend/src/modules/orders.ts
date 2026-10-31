import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { createModule, memberOnly, PageQuery } from '../lib/openapi';
import { badRequest, forbidden, notFound } from '../lib/http';
import { isStaff } from '../lib/auth';
import { env } from '../config/env';
import { createOrder, markOrderPaid, requestReturn } from '../services/orders';
import { renderInvoice } from '../services/invoice';
import { audit } from '../lib/audit';

const m = createModule('/orders', 'Orders');

m.post('/', {
  summary: 'Create an order (JOINING / UPGRADE use packageCode; REPURCHASE / RETAIL use items)',
  body: z
    .object({
      type: z.enum(['JOINING', 'UPGRADE', 'REPURCHASE', 'RETAIL']),
      packageCode: z.string().optional(),
      items: z.array(z.object({ productId: z.number().int(), qty: z.number().int().min(1).max(99) })).optional(),
      shipping: z.object({ name: z.string(), phone: z.string(), line1: z.string(), city: z.string(), state: z.string(), pincode: z.string() }).partial().optional(),
    })
    .openapi('CreateOrder'),
  handler: async ({ user, body, req }) => {
    const order = await createOrder({ memberId: memberOnly(user), ...body });
    await audit(req, 'ORDER.CREATE', 'Order', order.id, undefined, { type: body.type, total: order.grandTotal });
    return order;
  },
});

m.post('/:id/pay', {
  summary: 'DEMO payment gateway: marks the order as paid (replace with Razorpay / PayU / Cashfree webhook in production)',
  handler: async ({ user, params, req }) => {
    if (!env.DEMO_PAYMENTS) throw badRequest('Demo payments are disabled');
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) throw notFound('Order');
    if (order.memberId !== user.memberId && !isStaff(user)) throw forbidden();
    const paid = await markOrderPaid(order.id, 'DEMO', `DEMO-${Date.now()}`);
    await audit(req, 'ORDER.PAID', 'Order', order.id, undefined, { gateway: 'DEMO' });
    return paid;
  },
});

m.get('/my', {
  summary: 'My orders',
  query: PageQuery.extend({ type: z.enum(['JOINING', 'UPGRADE', 'REPURCHASE', 'RETAIL']).optional() }),
  handler: async ({ user, query }) => {
    const where = { memberId: memberOnly(user), type: query.type };
    const [items, total] = await Promise.all([
      prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { returns: true, _count: { select: { items: true } } } }),
      prisma.order.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
});

m.get('/:id', {
  summary: 'Order detail',
  handler: async ({ user, params }) => {
    const o = await prisma.order.findUnique({
      where: { id: params.id },
      include: { items: { include: { product: { select: { name: true, sku: true, hsnCode: true } } } }, payments: true, returns: true, member: { select: { distributorCode: true, fullName: true } } },
    });
    if (!o) throw notFound('Order');
    if (o.memberId !== user.memberId && !isStaff(user)) throw forbidden();
    return o;
  },
});

m.get('/:id/invoice', {
  summary: 'Printable GST invoice (HTML)',
  raw: true,
  handler: async ({ user, params, res }) => {
    const o = await prisma.order.findUnique({ where: { id: params.id } });
    if (!o) throw notFound('Order');
    if (o.memberId !== user.memberId && !isStaff(user)) throw forbidden();
    if (!o.invoiceNo) throw badRequest('Invoice is generated after payment');
    res.type('html').send(await renderInvoice(o.id));
  },
});

m.post('/:id/return', {
  summary: 'Request a return within the cooling-off period',
  body: z.object({ reason: z.string().min(5) }),
  handler: async ({ user, params, body, req }) => {
    const r = await requestReturn(params.id, memberOnly(user), body.reason);
    await audit(req, 'ORDER.RETURN_REQUEST', 'Order', params.id, undefined, { reason: body.reason });
    return r;
  },
});

export default m;
