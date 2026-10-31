import { prisma } from '../lib/prisma';
import { createModule } from '../lib/openapi';
import { currentPrices } from '../services/orders';

const m = createModule('/catalog', 'Catalogue');

m.get('/products', {
  summary: 'Products with MRP, DP and BV',
  handler: async () => {
    const products = await prisma.product.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } });
    const prices = await currentPrices();
    return products.map((p) => {
      const pr = prices.get(p.id);
      return { ...p, mrp: pr?.mrp ?? null, dp: pr?.dp ?? null, bv: pr?.bv ?? null };
    });
  },
});

m.get('/packages', {
  summary: 'Joining / upgrade packages with their product bundles',
  handler: () =>
    prisma.package.findMany({ where: { isActive: true }, orderBy: { price: 'asc' }, include: { items: { include: { product: { select: { name: true, sku: true } } } } } }),
});

m.get('/ranks', { summary: 'Rank master (17 ranks)', handler: () => prisma.rank.findMany({ orderBy: { id: 'asc' } }) });

export default m;
