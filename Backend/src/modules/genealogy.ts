import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { createModule, memberOnly, PageQuery } from '../lib/openapi';
import { forbidden, notFound } from '../lib/http';
import { isStaff } from '../lib/auth';
import { getTeam, getTree, isInDownline } from '../services/members';

const m = createModule('/genealogy', 'Genealogy');

m.get('/tree', {
  summary: 'Binary tree (members see only their own downline)',
  query: z.object({ code: z.string().optional(), depth: z.coerce.number().int().min(1).max(5).default(3) }),
  handler: async ({ user, query }) => {
    let rootId: string;
    if (query.code) {
      const r = await prisma.member.findUnique({ where: { distributorCode: query.code.toUpperCase() } });
      if (!r) throw notFound('Member');
      rootId = r.id;
    } else if (user.memberId) {
      rootId = user.memberId;
    } else {
      const root = await prisma.member.findFirst({ where: { parentId: null }, orderBy: { createdAt: 'asc' } });
      if (!root) throw notFound('Root member');
      rootId = root.id;
    }
    if (!isStaff(user) && !(await isInDownline(memberOnly(user), rootId))) throw forbidden('You can only view your own team');
    return getTree(rootId, query.depth);
  },
});

m.get('/directs', {
  summary: 'Members I sponsored',
  query: PageQuery,
  handler: async ({ user, query }) => {
    const memberId = memberOnly(user);
    const where = { sponsorId: memberId };
    const [items, total] = await Promise.all([
      prisma.member.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        select: { id: true, distributorCode: true, fullName: true, side: true, packageTier: true, status: true, createdAt: true, activatedAt: true, user: { select: { mobile: true } }, currentRank: { select: { name: true } } },
      }),
      prisma.member.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
});

m.get('/team', {
  summary: 'My whole downline in one leg (or both)',
  query: PageQuery.extend({ side: z.enum(['LEFT', 'RIGHT']).optional() }),
  handler: ({ user, query }) => getTeam(memberOnly(user), query.side ?? null, query.page, query.pageSize),
});

export default m;
