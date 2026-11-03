import { prisma } from '../lib/prisma';
import { createModule } from '../lib/openapi';
import { currentPrices, packagePrice } from '../services/orders';

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
  summary: 'Joining / upgrade packages with their product bundles and the price to pay',
  handler: async () => {
    const list = await prisma.package.findMany({ where: { isActive: true }, orderBy: { id: 'asc' }, include: { items: { include: { product: { select: { name: true, sku: true } } } } } });
    const out = await Promise.all(list.map(async (p) => {
      const pp = await packagePrice(p);
      return { ...p, price: pp.price, fixedPrice: pp.fixedPrice, productsTotal: pp.productsTotal };
    }));
    return out.sort((a, b) => Number(a.price) - Number(b.price));
  },
});

m.get('/ranks', { summary: 'Rank master (17 ranks)', handler: () => prisma.rank.findMany({ orderBy: { id: 'asc' } }) });

export default m;
