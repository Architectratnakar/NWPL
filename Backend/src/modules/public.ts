import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { createModule } from '../lib/openapi';
import { notFound } from '../lib/http';
import { registerMember } from '../services/members';
import { currentPrices } from '../services/orders';

const m = createModule('/public', 'Public');

m.get('/sponsor/:code', {
  summary: 'Check a sponsor ID before registering (returns the name only)',
  access: 'public',
  handler: async ({ params }) => {
    const s = await prisma.member.findUnique({ where: { distributorCode: params.code.toUpperCase() }, select: { distributorCode: true, fullName: true, status: true } });
    if (!s || s.status === 'BLOCKED' || s.status === 'TERMINATED') throw notFound('Sponsor ID');
    return { code: s.distributorCode, name: s.fullName };
  },
});

const RegisterBody = z
  .object({
    fullName: z.string().min(3).max(100),
    mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
    email: z.string().email().optional().or(z.literal('')),
    password: z.string().min(8).regex(/[A-Z]/, 'needs a capital letter').regex(/[0-9]/, 'needs a number'),
    sponsorCode: z.string().min(3),
    side: z.enum(['LEFT', 'RIGHT']),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    dob: z.coerce.date().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    acceptAgreement: z.literal(true, { errorMap: () => ({ message: 'Please accept the distributor agreement' }) }),
  })
  .openapi('RegisterBody');

m.post('/register', {
  summary: 'Register a new distributor (placed at the extreme left/right of the sponsor)',
  access: 'public',
  body: RegisterBody,
  handler: async ({ body, req }) => {
    const member = await registerMember({
      ...body,
      email: body.email || null,
      address: { city: body.city ?? '', state: body.state ?? '', pincode: body.pincode ?? '' },
      ip: req.ip,
    });
    return { distributorCode: member.distributorCode, fullName: member.fullName, message: 'Registration successful. Log in and activate your ID with a joining package.' };
  },
});

m.get('/products', {
  summary: 'Public product catalogue (MRP only)',
  access: 'public',
  handler: async () => {
    const products = await prisma.product.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } });
    const prices = await currentPrices();
    return products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, category: p.category, imageUrl: p.imageUrl, mrp: prices.get(p.id)?.mrp ?? null }));
  },
});

m.get('/company', {
  summary: 'Company & grievance contact details (shown on public pages)',
  access: 'public',
  handler: () => ({
    name: 'Navarth Wellness Pvt. Ltd.',
    tagline: 'Jiyo Zindagi Shaan Se',
    grievanceOfficer: { name: 'To be appointed', email: 'grievance@example.com', phone: '+91-00000-00000' },
    returnPolicyDays: 30,
  }),
});

export default m;
