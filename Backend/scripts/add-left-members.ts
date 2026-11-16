/**
 * Bulk-add members on the LEFT leg of the Company ID.
 *
 *   npx tsx scripts/add-left-members.ts                       # 200 members, REGISTERED (not activated)
 *   npx tsx scripts/add-left-members.ts --activate FULL       # 200 members, each with a paid 100 BV joining package
 *   npx tsx scripts/add-left-members.ts --count 50 --dry-run  # only show what would happen
 *
 * Options
 *   --count <n>          how many members to create                (default 200)
 *   --company <code>     distributor code of the Company ID         (default: the root member — no parent, no sponsor)
 *   --activate <tier>    none | BASIC | FULL                        (default none)
 *   --password <pw>      login password for every new member        (default Demo@123)
 *   --mobile-start <no>  first mobile number to try; numbers that
 *                        already exist in the User table are skipped (default 7000000001)
 *   --name-prefix <txt>  member name = "<prefix> <n>"               (default "Left Member")
 *   --dry-run            print the plan, write nothing
 *
 * How placement works
 *   Every member is registered through the portal's own registerMember() with
 *   sponsor = Company ID and side = LEFT. That is exactly what the website's
 *   registration form does: the member goes to the bottom of the extreme-left
 *   line under the Company ID, gets the next NW code from the Counter table,
 *   and gets its Wallet, NodeVolume and AuditLog rows. Nothing is written by hand.
 *
 *   With --activate, a JOINING order is created and marked paid (gateway "BULK"),
 *   just like the demo seed. That sets the member ACTIVE, posts BV and updates
 *   the Company ID's left BV / left count. Note: this also creates orders,
 *   invoice numbers and reduces product stock.
 */
import { prisma } from '../src/lib/prisma';
import { registerMember } from '../src/services/members';
import { createOrder, markOrderPaid } from '../src/services/orders';

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) throw new Error(`--${name} needs a value`);
  return v;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const count = Number(arg('count', '200'));
  const activate = (arg('activate', 'none') as string).toUpperCase();
  const password = arg('password', 'Demo@123')!;
  const namePrefix = arg('name-prefix', 'Left Member')!;
  let mobile = Number(arg('mobile-start', '7000000001'));
  const dryRun = flag('dry-run');

  if (!Number.isInteger(count) || count < 1 || count > 5000) throw new Error('--count must be a whole number between 1 and 5000');
  if (!['NONE', 'BASIC', 'FULL'].includes(activate)) throw new Error('--activate must be none, BASIC or FULL');
  if (!/^\d{10}$/.test(String(mobile))) throw new Error('--mobile-start must be a 10-digit number');

  // ---- find the Company ID ----
  const companyCode = arg('company');
  const company = companyCode
    ? await prisma.member.findUnique({ where: { distributorCode: companyCode.toUpperCase() } })
    : await prisma.member.findFirst({ where: { parentId: null, sponsorId: null }, orderBy: { createdAt: 'asc' } });
  if (!company) throw new Error(companyCode ? `Member ${companyCode} not found` : 'No root member (Company ID) found');
  if (company.status === 'BLOCKED' || company.status === 'TERMINATED') throw new Error(`${company.distributorCode} is ${company.status}`);

  const pkgCode = activate === 'FULL' ? 'FULL_100' : activate === 'BASIC' ? 'BASIC_40' : null;
  if (pkgCode) {
    const pkg = await prisma.package.findUnique({ where: { code: pkgCode } });
    if (!pkg || !pkg.isActive) throw new Error(`Package ${pkgCode} not found or inactive`);
  }

  // current state of the left leg
  const [leg] = await prisma.$queryRaw<{ n: bigint }[]>`
    WITH RECURSIVE down AS (
      SELECT "id" FROM "Member" WHERE "parentId" = ${company.id} AND "side" = 'LEFT'
      UNION ALL
      SELECT m."id" FROM "Member" m JOIN down ON m."parentId" = down."id"
    ) SELECT COUNT(*) AS n FROM down`;

  console.log(`Company ID     : ${company.distributorCode} — ${company.fullName}`);
  console.log(`Left team now  : ${Number(leg.n)} member(s)`);
  console.log(`To create      : ${count} member(s), side LEFT, ${pkgCode ? `activated with ${pkgCode}` : 'not activated (REGISTERED)'}`);
  console.log(`Login password : ${password}`);
  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  const existing = new Set((await prisma.user.findMany({ select: { mobile: true } })).map((u) => u.mobile));
  const created: { code: string; mobile: string; name: string }[] = [];
  const started = Date.now();

  for (let i = 1; i <= count; i++) {
    while (existing.has(String(mobile))) mobile++;
    const m = String(mobile++);
    existing.add(m);
    const name = `${namePrefix} ${i}`;

    const member = await registerMember({
      fullName: name, mobile: m, email: null, password, sponsorCode: company.distributorCode, side: 'LEFT', acceptAgreement: true, ip: 'bulk-script',
    });
    if (pkgCode) {
      const o = await createOrder({ memberId: member.id, type: 'JOINING', packageCode: pkgCode });
      await markOrderPaid(o.id, 'BULK', `BULK-${o.id}`, 'bulk-script');
    }
    created.push({ code: member.distributorCode, mobile: m, name });
    if (i % 25 === 0 || i === count) console.log(`  ${i}/${count}  last: ${member.distributorCode} (${m})`);
  }

  const vol = await prisma.nodeVolume.findUnique({ where: { memberId: company.id } });
  console.log(`\n✅ Created ${created.length} members in ${Math.round((Date.now() - started) / 1000)}s`);
  console.log(`   Codes ${created[0].code} … ${created[created.length - 1].code}`);
  if (vol) console.log(`   ${company.distributorCode} lifetime: left count ${vol.totalLeftCount}, left BV ${vol.totalLeftBv}`);
  console.log('\ncode,mobile,name');
  for (const c of created) console.log(`${c.code},${c.mobile},${c.name}`);
}

main()
  .catch((e) => {
    console.error('\n❌', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
