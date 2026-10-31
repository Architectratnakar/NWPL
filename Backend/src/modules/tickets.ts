import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { createModule, memberOnly, PageQuery } from '../lib/openapi';
import { badRequest, forbidden, notFound } from '../lib/http';
import { isStaff } from '../lib/auth';

const m = createModule('/tickets', 'Support');
export const SLA_HOURS = 48;

export interface TicketMessage { by: 'MEMBER' | 'STAFF'; name: string; text: string; at: string }

m.get('/', {
  summary: 'My support tickets',
  query: PageQuery,
  handler: async ({ user, query }) => {
    const where = { memberId: memberOnly(user) };
    const [items, total] = await Promise.all([
      prisma.ticket.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.ticket.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
});

m.post('/', {
  summary: 'Open a ticket',
  body: z.object({ category: z.enum(['ORDER', 'PAYMENT', 'INCOME', 'KYC', 'PRODUCT', 'ACCOUNT', 'OTHER']), subject: z.string().min(5).max(150), message: z.string().min(5) }),
  handler: async ({ user, body }) => {
    const msg: TicketMessage = { by: 'MEMBER', name: user.name, text: body.message, at: new Date().toISOString() };
    return prisma.ticket.create({
      data: { memberId: memberOnly(user), category: body.category, subject: body.subject, messages: [msg] as object[], slaDueAt: new Date(Date.now() + SLA_HOURS * 3600_000) },
    });
  },
});

m.get('/:id', {
  summary: 'Ticket with messages',
  handler: async ({ user, params }) => {
    const t = await prisma.ticket.findUnique({ where: { id: params.id }, include: { member: { select: { distributorCode: true, fullName: true } } } });
    if (!t) throw notFound('Ticket');
    if (t.memberId !== user.memberId && !isStaff(user)) throw forbidden();
    return t;
  },
});

m.post('/:id/messages', {
  summary: 'Reply on a ticket (member or staff)',
  body: z.object({ text: z.string().min(1), status: z.enum(['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED']).optional() }),
  handler: async ({ user, params, body }) => {
    const t = await prisma.ticket.findUnique({ where: { id: params.id } });
    if (!t) throw notFound('Ticket');
    const staff = isStaff(user);
    if (!staff && t.memberId !== user.memberId) throw forbidden();
    if (t.status === 'CLOSED') throw badRequest('This ticket is closed');
    const msgs = [...((t.messages as unknown as TicketMessage[]) ?? []), { by: staff ? 'STAFF' : 'MEMBER', name: user.name, text: body.text, at: new Date().toISOString() }];
    const status = staff ? (body.status ?? 'IN_PROGRESS') : t.status === 'RESOLVED' ? 'OPEN' : t.status;
    return prisma.ticket.update({ where: { id: t.id }, data: { messages: msgs as object[], status } });
  },
});

export default m;
