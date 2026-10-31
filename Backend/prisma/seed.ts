/**
 * Demo data for the MLM portal.
 *   npm run db:seed
 * Creates: ranks, 26 products, packages, plan settings, staff logins,
 * the company root ID, a demo distributor with a ~40-member team,
 * 10 days of closings (income history), KYC, withdrawals, tickets and a return.
 */
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { env } from '../src/config/env';
import { DEFAULT_SETTINGS } from '../src/lib/settings';
import { registerMember } from '../src/services/members';
import { createOrder, markOrderPaid } from '../src/services/orders';
import { approveClosing, postClosing, runClosing } from '../src/engine/closing';
import { encrypt } from '../src/lib/crypto';

const DAY = 86_400_000;
const istMidnight = (daysAgo: number) => new Date(Date.now() - ((Date.now() + 330 * 60_000) % DAY) - daysAgo * DAY);

const RANKS: [number, string, string, number, number, string | null, boolean][] = [
  [1, 'Star', 'स्टार', 1500, 0, null, false], [2, 'Silver', 'सिल्वर', 3000, 0, null, false], [3, 'Gold', 'गोल्ड', 6000, 0, null, false],
  [4, 'Topaz', 'टोपाज', 12000, 0, null, false], [5, 'Emerald', 'एमरल्ड', 24000, 0, null, false], [6, 'Ruby', 'रुबी', 48000, 0, null, false],
  [7, 'Sapphire', 'सैफायर', 96000, 0, null, false],
  [8, 'Diamond', 'डायमंड', 192000, 256000, 'Dubai trip', true], [9, 'Green Diamond', 'ग्रीन डायमंड', 384000, 512000, null, true],
  [10, 'Blue Diamond', 'ब्लू डायमंड', 768000, 1024000, 'Hong Kong trip', true], [11, 'Black Diamond', 'ब्लैक डायमंड', 1536000, 2048000, 'Malaysia trip', true],
  [12, 'Double Diamond', 'डबल डायमंड', 3072000, 4096000, null, true], [13, 'Royal Diamond', 'रॉयल डायमंड', 6144000, 8192000, 'Indonesia trip', true],
  [14, 'Royal Brand Diamond', 'रॉयल ब्रांड डायमंड', 12288000, 16384000, null, true], [15, 'Crown Diamond', 'क्राउन डायमंड', 24576000, 32768000, 'Switzerland trip', true],
  [16, 'Ambassador', 'एम्बेसडर', 49152000, 65536000, null, true], [17, 'Brand Ambassador', 'ब्रांड एम्बेसडर', 98304000, 131072000, 'Thailand trip (with family)', true],
];

// [sku, name, category, MRP, DP, BV]  — from the company price list
const PRODUCTS: [string, string, string, number, number, number][] = [
  ['NW-001', 'Alobera Juice', 'Health Juice', 1020, 612, 12], ['NW-002', 'Punch Tulsi Drop', 'Health Drops', 390, 234, 5],
  ['NW-003', 'Oilbonil Juice', 'Health Juice', 1780, 708, 14], ['NW-004', 'Manpower Juice', 'Health Juice', 1280, 788, 15],
  ['NW-005', 'Lady Care Juice', 'Health Juice', 1220, 732, 15], ['NW-006', 'Lover Care SPF', 'Personal Care', 390, 234, 5],
  ['NW-007', 'Thunder Blue Juice', 'Health Juice', 2499, 1750, 36], ['NW-008', 'Mix Berry Juice', 'Health Juice', 1900, 1140, 23],
  ['NW-009', 'Cardio Cure Juice', 'Health Juice', 1260, 756, 15], ['NW-010', 'Pain Relief Oil', 'Personal Care', 470, 282, 6],
  ['NW-011', 'Glucosamine Juice', 'Health Juice', 1380, 828, 17], ['NW-012', 'Calcium Tablet', 'Supplements', 1040, 624, 12],
  ['NW-013', 'Noni Juice', 'Health Juice', 1290, 774, 15], ['NW-014', 'Navarth Power Juice', 'Health Juice', 1999, 1200, 24],
  ['NW-015', 'Cough Syrup', 'Health Drops', 350, 210, 4], ['NW-016', 'Anti Addiction Drop', 'Health Drops', 780, 468, 9],
  ['NW-017', 'Kesh Mantra Hair Oil', 'Personal Care', 450, 360, 4], ['NW-018', 'Mexodent Paste', 'Personal Care', 250, 200, 2],
  ['NW-019', 'Clin Herbal Facewash', 'Personal Care', 480, 384, 4], ['NW-020', '4 in 1 Soap Combo', 'Personal Care', 200, 160, 1.2],
  ['NW-021', 'Glow Night Cream', 'Personal Care', 560, 448, 5], ['NW-022', 'Rice Bran Oil', 'Food', 290, 232, 2.5],
  ['NW-023', 'Mix Masala', 'Food', 350, 280, 2.8], ['NW-024', 'Herbal Tea', 'Food', 480, 384, 4.5],
  ['NW-025', 'Haldi Powder', 'Food', 120, 96, 1], ['NW-026', 'Dishwash', 'Home Care', 250, 200, 2],
];

const NAMES = [
  'Sunita Devi', 'Amit Sharma', 'Priya Verma', 'Rahul Yadav', 'Neha Gupta', 'Vikas Singh', 'Pooja Patel', 'Sanjay Mishra', 'Kavita Joshi', 'Deepak Chauhan',
  'Anjali Tiwari', 'Rohit Pandey', 'Meena Kumari', 'Arjun Reddy', 'Swati Jain', 'Manoj Thakur', 'Rekha Saini', 'Suresh Nair', 'Geeta Rawat', 'Ajay Kushwaha',
  'Nisha Agarwal', 'Ravi Shankar', 'Komal Bansal', 'Harish Meena', 'Shalini Dubey', 'Gaurav Malik', 'Ritu Bhatia', 'Naveen Kumar', 'Seema Rathore', 'Pankaj Soni',
  'Lata Chaudhary', 'Yogesh Bhardwaj', 'Divya Kapoor', 'Mukesh Prajapati', 'Asha Rani', 'Vinod Saxena', 'Kiran Bala', 'Alok Srivastava', 'Usha Pal', 'Tarun Goyal',
  'Bhavna Shah', 'Rajesh Lodhi', 'Sarita Nagar', 'Hemant Vyas',
];
const CITIES = [['Indore', 'Madhya Pradesh'], ['Lucknow', 'Uttar Pradesh'], ['Jaipur', 'Rajasthan'], ['Patna', 'Bihar'], ['Bhopal', 'Madhya Pradesh'], ['Nagpur', 'Maharashtra'], ['Varanasi', 'Uttar Pradesh'], ['Raipur', 'Chhattisgarh']];

// tiny deterministic random
let seedState = 42;
const rand = () => ((seedState = (seedState * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];

// 1×1 PNG used as a placeholder KYC image
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
function placeholderFile(name: string) {
  const dir = path.resolve(env.UPLOAD_DIR, 'kyc');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), PNG);
  return `kyc/${name}`;
}

async function setDates(memberId: string, orderId: string | null, at: Date) {
  await prisma.member.update({ where: { id: memberId }, data: { createdAt: at, activatedAt: orderId ? at : undefined } });
  if (orderId) await prisma.order.update({ where: { id: orderId }, data: { createdAt: at, paidAt: at } });
}

let mobileNo = 9810000000;
async function join(sponsorCode: string, side: 'LEFT' | 'RIGHT', name: string, tier: 'FULL' | 'BASIC' | null, at: Date, gender = 'MALE') {
  const [city, state] = pick(CITIES);
  const m = await registerMember({
    fullName: name, mobile: String(mobileNo++), email: null, password: 'Demo@123', sponsorCode, side, gender,
    address: { city, state, pincode: String(400000 + Math.floor(rand() * 99999)) }, acceptAgreement: true,
  });
  let orderId: string | null = null;
  if (tier) {
    const o = await createOrder({ memberId: m.id, type: 'JOINING', packageCode: tier === 'FULL' ? 'FULL_100' : 'BASIC_40' });
    await markOrderPaid(o.id, 'DEMO', `SEED-${o.id}`);
    orderId = o.id;
  }
  await setDates(m.id, orderId, at);
  return m;
}

async function closeDay(daysAgo: number, adminId: string, financeId: string) {
  const start = istMidnight(daysAgo);
  const c = await runClosing(start, new Date(start.getTime() + DAY), adminId);
  await approveClosing(c.id, financeId);
  await postClosing(c.id);
  await prisma.closing.update({ where: { id: c.id }, data: { createdAt: new Date(start.getTime() + DAY - 60_000), postedAt: new Date(start.getTime() + DAY - 30_000) } });
  return c;
}

async function main() {
  if (await prisma.member.findFirst()) {
    console.log('ℹ️  Database already has data. To start fresh run:  npm run db:reset');
    return;
  }
  console.log('🌱 Seeding master data…');
  for (const [id, name, nameHi, thresholdBv, bonusAmount, reward, confirmed] of RANKS) {
    await prisma.rank.upsert({ where: { id }, create: { id, name, nameHi, thresholdBv, bonusAmount, reward, confirmed }, update: {} });
  }
  const priceFrom = new Date(Date.now() - 60 * DAY);
  for (const [sku, name, category, mrp, dp, bv] of PRODUCTS) {
    await prisma.product.upsert({
      where: { sku },
      create: { sku, name, category, gstRate: 18, stock: 500, description: `${name} — Navarth Wellness herbal range.`, prices: { create: { mrp, dp, bv, effectiveFrom: priceFrom } } },
      update: {},
    });
  }
  const bySku = Object.fromEntries((await prisma.product.findMany()).map((p) => [p.sku, p.id]));
  const pkgs: [string, string, number, number, 'BASIC' | 'FULL', boolean, [string, number][]][] = [
    ['BASIC_40', 'Joining Package – 40 BV', 2000, 40, 'BASIC', false, [['NW-001', 1], ['NW-013', 1], ['NW-012', 1]]],
    ['FULL_100', 'Joining Package – 100 BV', 5000, 100, 'FULL', false, [['NW-007', 1], ['NW-014', 1], ['NW-008', 1], ['NW-013', 1]]],
    ['UPGRADE_60', 'Upgrade 40 BV → 100 BV', 3000, 60, 'FULL', true, [['NW-014', 1], ['NW-008', 1], ['NW-011', 1]]],
  ];
  for (const [code, name, price, bv, tier, isUpgrade, items] of pkgs) {
    await prisma.package.upsert({
      where: { code },
      create: { code, name, price, bv, tier, isUpgrade, items: { create: items.map(([sku, qty]) => ({ productId: bySku[sku], qty })) } },
      update: {},
    });
  }
  await prisma.planSetting.upsert({
    where: { version: 1 },
    create: {
      version: 1, effectiveFrom: new Date(Date.now() - 60 * DAY), createdBy: 'seed',
      values: { ...DEFAULT_SETTINGS, _note: 'DEMO values. tdsPercent: confirm with your CA. Autopool / direct-return features stay OFF until legal review.' } as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });

  console.log('👤 Staff logins…');
  const staff: [string, string, string, 'ADMIN_SUPER' | 'ADMIN_FINANCE' | 'ADMIN_OPS' | 'SUPPORT' | 'COMPLIANCE'][] = [
    ['admin@navarth.demo', '9000000001', 'Admin@123', 'ADMIN_SUPER'],
    ['finance@navarth.demo', '9000000002', 'Finance@123', 'ADMIN_FINANCE'],
    ['ops@navarth.demo', '9000000003', 'Ops@123', 'ADMIN_OPS'],
    ['support@navarth.demo', '9000000004', 'Support@123', 'SUPPORT'],
    ['compliance@navarth.demo', '9000000005', 'Compliance@123', 'COMPLIANCE'],
  ];
  const ids: Record<string, string> = {};
  for (const [email, mobile, pw, role] of staff) {
    const u = await prisma.user.create({ data: { email, mobile, role, passwordHash: await bcrypt.hash(pw, 10) } });
    ids[role] = u.id;
  }

  console.log('🌳 Company root ID and demo team…');
  const rootUser = await prisma.user.create({ data: { mobile: '9000000000', email: 'company@navarth.demo', passwordHash: await bcrypt.hash('Demo@123', 10) } });
  const root = await prisma.member.create({
    data: { distributorCode: 'NW100000', userId: rootUser.id, fullName: 'Navarth Wellness (Company ID)', status: 'ACTIVE', packageTier: 'FULL', activatedAt: new Date(Date.now() - 30 * DAY), kycStatus: 'APPROVED', agreementVersion: 'v1', agreementAcceptedAt: new Date(), createdAt: new Date(Date.now() - 30 * DAY) },
  });
  await prisma.nodeVolume.createMany({ data: [{ memberId: root.id }], skipDuplicates: true });
  await prisma.wallet.createMany({ data: [{ memberId: root.id }], skipDuplicates: true });

  // Demo distributor
  const ramesh = await join('NW100000', 'LEFT', 'Ramesh Kumar', 'FULL', istMidnight(12), 'MALE');
  await prisma.user.update({ where: { id: ramesh.userId }, data: { email: 'ramesh@navarth.demo', mobile: '9876543210' } });

  // Grow the team over 10 days, closing each day
  const members: { code: string; side: 'LEFT' | 'RIGHT' }[] = [];
  let n = 0;
  for (let d = 10; d >= 1; d--) {
    const today = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < today && n < NAMES.length - 4; k++) {
      const side: 'LEFT' | 'RIGHT' = n % 2 === 0 ? 'LEFT' : 'RIGHT';
      // Ramesh sponsors most people; some are sponsored by his team (spill-over)
      const sameSide = members.filter((x) => x.side === side);
      const sponsor = sameSide.length > 3 && rand() < 0.35 ? pick(sameSide).code : ramesh.distributorCode;
      const name = NAMES[n];
      const tier = rand() < 0.75 ? 'FULL' : 'BASIC';
      const at = new Date(istMidnight(d).getTime() + 9 * 3600_000 + Math.floor(rand() * 8 * 3600_000));
      const m = await join(sponsor, side, name, tier, at, /a$|i$/.test(name.split(' ')[0]) ? 'FEMALE' : 'MALE');
      members.push({ code: m.distributorCode, side });
      n++;
    }
    await closeDay(d, ids.ADMIN_SUPER, ids.ADMIN_FINANCE);
  }

  // Today: a few joinings (unmatched carry is visible on the dashboard) + one ID not yet activated
  for (let k = 0; k < 3; k++) {
    const side: 'LEFT' | 'RIGHT' = k % 2 === 0 ? 'LEFT' : 'RIGHT';
    const m = await join(ramesh.distributorCode, side, NAMES[n++], 'FULL', new Date(Date.now() - (3 - k) * 3600_000));
    members.push({ code: m.distributorCode, side });
  }
  const fresh = await join(ramesh.distributorCode, 'RIGHT', 'Demo New Member', null, new Date());
  await prisma.user.update({ where: { id: fresh.userId }, data: { mobile: '9123456789' } });

  console.log('🧾 KYC, bank, orders, withdrawals, tickets…');
  await prisma.bankAccount.create({ data: { memberId: ramesh.id, holderName: 'Ramesh Kumar', accountNoEnc: encrypt('123456789012'), accountLast4: '9012', ifsc: 'SBIN0001234', bankName: 'State Bank of India', verified: true } });
  await prisma.nominee.create({ data: { memberId: ramesh.id, name: 'Sunita Kumari', relation: 'Wife' } });
  for (const [type, num] of [['PAN', 'ABCDE1234F'], ['AADHAAR', '••••••••4321'], ['BANK_PROOF', null]] as const) {
    await prisma.kycDocument.create({ data: { memberId: ramesh.id, type, numberEnc: num ? encrypt(num) : null, fileKey: placeholderFile(`demo-ramesh-${type.toLowerCase()}.png`), status: 'APPROVED', reviewedBy: ids.ADMIN_OPS, reviewedAt: new Date() } });
  }
  await prisma.member.update({ where: { id: ramesh.id }, data: { kycStatus: 'APPROVED', address: { line1: '12, MG Road', city: 'Indore', state: 'Madhya Pradesh', pincode: '452001' }, dob: new Date('1988-05-14') } });

  // pending KYC for two team members
  const pendingKyc = await prisma.member.findMany({ where: { distributorCode: { in: members.slice(0, 2).map((m) => m.code) } } });
  for (const pm of pendingKyc) {
    for (const [type, num] of [['PAN', 'PQRSX6789K'], ['AADHAAR', '••••••••8765'], ['BANK_PROOF', null]] as const) {
      await prisma.kycDocument.create({ data: { memberId: pm.id, type, numberEnc: num ? encrypt(num) : null, fileKey: placeholderFile(`demo-${pm.distributorCode}-${type.toLowerCase()}.png`) } });
    }
    await prisma.member.update({ where: { id: pm.id }, data: { kycStatus: 'PENDING' } });
  }

  // repurchase orders
  for (const code of [ramesh.distributorCode, ...members.slice(2, 6).map((m) => m.code)]) {
    const mem = await prisma.member.findUniqueOrThrow({ where: { distributorCode: code } });
    const o = await createOrder({ memberId: mem.id, type: 'REPURCHASE', items: [{ productId: bySku['NW-013'], qty: 1 }, { productId: bySku['NW-024'], qty: 2 }] });
    await markOrderPaid(o.id, 'DEMO', `SEED-${o.id}`);
  }
  const shipped = await prisma.order.findFirst({ where: { member: { distributorCode: ramesh.distributorCode }, type: 'REPURCHASE' } });
  if (shipped) await prisma.order.update({ where: { id: shipped.id }, data: { status: 'DELIVERED' } });
  // an unpaid cart for Ramesh
  await createOrder({ memberId: ramesh.id, type: 'REPURCHASE', items: [{ productId: bySku['NW-007'], qty: 1 }] });
  // a return request from a team member
  const retOrder = await prisma.order.findFirst({ where: { type: 'REPURCHASE', member: { distributorCode: members[3].code } } });
  if (retOrder) await prisma.returnRequest.create({ data: { orderId: retOrder.id, reason: 'Received a damaged bottle of Herbal Tea' } });

  // withdrawals for Ramesh: one paid, one waiting for approval
  const w = await prisma.wallet.findUniqueOrThrow({ where: { memberId: ramesh.id } });
  const { debitWallet } = await import('../src/services/wallet');
  for (const [amount, status] of [[2000, 'PAID'], [1500, 'REQUESTED']] as const) {
    if (w.balance.lt(amount * 2)) break;
    const wd = await prisma.withdrawal.create({ data: { memberId: ramesh.id, gross: amount, tds: 0, adminCharge: 0, net: amount, status, utr: status === 'PAID' ? 'UTR' + (Date.now() % 1e9) : null, paidAt: status === 'PAID' ? new Date() : null, approvedBy: status === 'PAID' ? ids.ADMIN_FINANCE : null } });
    await debitWallet(prisma, ramesh.id, amount, 'WITHDRAWAL', wd.id, `Withdrawal (net ₹${amount})`);
  }

  // support tickets
  await prisma.ticket.create({ data: { memberId: ramesh.id, category: 'INCOME', subject: 'Pair income not shown for yesterday', status: 'RESOLVED', slaDueAt: new Date(Date.now() + DAY), messages: [
    { by: 'MEMBER', name: 'Ramesh Kumar', text: 'My pair income for yesterday is not showing in the wallet.', at: new Date(Date.now() - 2 * DAY).toISOString() },
    { by: 'STAFF', name: 'Support Team', text: 'The closing runs at 11:59 PM. It is now credited — please check your wallet.', at: new Date(Date.now() - DAY).toISOString() },
  ] } });
  await prisma.ticket.create({ data: { memberId: ramesh.id, category: 'ORDER', subject: 'When will my repurchase order be delivered?', slaDueAt: new Date(Date.now() + 2 * DAY), messages: [
    { by: 'MEMBER', name: 'Ramesh Kumar', text: 'I placed an order yesterday. Please share the courier tracking number.', at: new Date().toISOString() },
  ] } });

  const r = await prisma.member.findUniqueOrThrow({ where: { id: ramesh.id }, include: { wallet: true, volume: true, currentRank: true } });
  console.log('\n✅ Seed complete');
  console.log(`   Members: ${await prisma.member.count()}   Closings: ${await prisma.closing.count()}`);
  console.log(`   Demo distributor ${r.distributorCode}: wallet ₹${r.wallet?.balance}, left BV ${r.volume?.totalLeftBv}, right BV ${r.volume?.totalRightBv}, rank ${r.currentRank?.name ?? '-'}`);
  console.log(`   Not-yet-activated ID: ${fresh.distributorCode} / Demo@123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
