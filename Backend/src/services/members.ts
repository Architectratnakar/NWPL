import bcrypt from 'bcryptjs';
import { Prisma, type Side } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma';
import { badRequest, notFound } from '../lib/http';
import { nextDistributorCode } from '../lib/counters';

export const AGREEMENT_VERSION = 'v1.0-2026-10';

/** Bottom-most free slot on the outer edge of the sponsor's chosen side (extreme-left / extreme-right). */
export async function findPlacement(db: Tx, sponsorId: string, side: Side) {
  let cursor = sponsorId;
  for (;;) {
    const child = await db.member.findUnique({ where: { parentId_side: { parentId: cursor, side } }, select: { id: true } });
    if (!child) break;
    cursor = child.id;
  }
  // lock the parent row so two registrations cannot race for the same slot
  await db.$queryRaw`SELECT "id" FROM "Member" WHERE "id" = ${cursor} FOR UPDATE`;
  const parent = await db.member.findUniqueOrThrow({ where: { id: cursor }, select: { level: true } });
  return { parentId: cursor, side, level: parent.level + 1 };
}

export interface RegisterInput {
  fullName: string;
  mobile: string;
  email?: string | null;
  password: string;
  sponsorCode: string;
  side: Side;
  gender?: string | null;
  dob?: Date | null;
  address?: Record<string, string> | null;
  acceptAgreement: boolean;
  ip?: string | null;
}

export async function registerMember(input: RegisterInput) {
  if (!input.acceptAgreement) throw badRequest('Please accept the distributor agreement');
  const sponsor = await prisma.member.findUnique({ where: { distributorCode: input.sponsorCode.toUpperCase() } });
  if (!sponsor) throw badRequest('Sponsor ID not found');
  if (sponsor.status === 'BLOCKED' || sponsor.status === 'TERMINATED') throw badRequest('Sponsor ID is not active');

  const passwordHash = await bcrypt.hash(input.password, 10);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const place = await findPlacement(tx, sponsor.id, input.side);
        const user = await tx.user.create({
          data: { mobile: input.mobile, email: input.email || null, passwordHash, role: 'MEMBER' },
        });
        const member = await tx.member.create({
          data: {
            distributorCode: await nextDistributorCode(tx),
            userId: user.id,
            fullName: input.fullName,
            gender: input.gender ?? null,
            dob: input.dob ?? null,
            address: input.address ?? undefined,
            sponsorId: sponsor.id,
            parentId: place.parentId,
            side: place.side,
            level: place.level,
            agreementVersion: AGREEMENT_VERSION,
            agreementAcceptedAt: new Date(),
          },
        });
        // created here AND (optionally) by the DB trigger in extras.sql — skipDuplicates keeps both working
        await tx.nodeVolume.createMany({ data: [{ memberId: member.id }], skipDuplicates: true });
        await tx.wallet.createMany({ data: [{ memberId: member.id }], skipDuplicates: true });
        await tx.auditLog.create({
          data: { actorId: user.id, action: 'MEMBER.REGISTER', entity: 'Member', entityId: member.id, ip: input.ip ?? null, after: { code: member.distributorCode, sponsor: sponsor.distributorCode, side: input.side } },
        });
        return member;
      });
    } catch (e) {
      // two people raced for the same slot -> try again
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && String(e.meta?.target).includes('parentId')) continue;
      throw e;
    }
  }
  throw badRequest('Could not place the member, please try again');
}

/** true if `memberId` is `rootId` or somewhere below it */
export async function isInDownline(rootId: string, memberId: string) {
  if (rootId === memberId) return true;
  const rows = await prisma.$queryRaw<{ found: boolean }[]>`
    WITH RECURSIVE up AS (
      SELECT "parentId" FROM "Member" WHERE "id" = ${memberId}
      UNION ALL
      SELECT m."parentId" FROM "Member" m JOIN up ON m."id" = up."parentId"
    )
    SELECT EXISTS (SELECT 1 FROM up WHERE "parentId" = ${rootId}) AS found`;
  return rows[0]?.found ?? false;
}

export interface TreeNode {
  id: string;
  code: string;
  name: string;
  tier: string;
  status: string;
  rank: string | null;
  joinedAt: Date;
  leftBv: string;
  rightBv: string;
  leftCount: number;
  rightCount: number;
  left: TreeNode | null;
  right: TreeNode | null;
}

/** Binary tree from a root, `depth` levels deep */
export async function getTree(rootId: string, depth: number): Promise<TreeNode> {
  const rows = await prisma.$queryRaw<{ id: string; parentId: string | null; side: string | null; d: number }[]>`
    WITH RECURSIVE down AS (
      SELECT "id", "parentId", "side"::text AS side, 0 AS d FROM "Member" WHERE "id" = ${rootId}
      UNION ALL
      SELECT m."id", m."parentId", m."side"::text, down.d + 1
      FROM "Member" m JOIN down ON m."parentId" = down."id" WHERE down.d < ${depth}
    ) SELECT * FROM down`;
  const members = await prisma.member.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    include: { volume: true, currentRank: true },
  });
  const byId = new Map(members.map((m) => [m.id, m]));
  const build = (id: string): TreeNode => {
    const m = byId.get(id);
    if (!m) throw notFound('Member');
    const kids = rows.filter((r) => r.parentId === id);
    const l = kids.find((k) => k.side === 'LEFT');
    const r = kids.find((k) => k.side === 'RIGHT');
    return {
      id: m.id,
      code: m.distributorCode,
      name: m.fullName,
      tier: m.packageTier,
      status: m.status,
      rank: m.currentRank?.name ?? null,
      joinedAt: m.createdAt,
      leftBv: m.volume?.totalLeftBv.toString() ?? '0',
      rightBv: m.volume?.totalRightBv.toString() ?? '0',
      leftCount: m.volume?.totalLeftCount ?? 0,
      rightCount: m.volume?.totalRightCount ?? 0,
      left: l ? build(l.id) : null,
      right: r ? build(r.id) : null,
    };
  };
  return build(rootId);
}

/** Whole downline of one leg (paged) */
export async function getTeam(rootId: string, side: Side | null, page: number, pageSize: number) {
  const offset = (page - 1) * pageSize;
  const sideFilter = side ? Prisma.sql`AND "side"::text = ${side}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ id: string; leg: string; depth: number; total: bigint }[]>`
    WITH RECURSIVE down AS (
      SELECT "id", "side"::text AS leg, 1 AS depth FROM "Member" WHERE "parentId" = ${rootId} ${sideFilter}
      UNION ALL
      SELECT m."id", down.leg, down.depth + 1 FROM "Member" m JOIN down ON m."parentId" = down."id"
    )
    SELECT "id", leg, depth, COUNT(*) OVER () AS total FROM down ORDER BY depth, "id" LIMIT ${pageSize} OFFSET ${offset}`;
  const members = await prisma.member.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    include: { sponsor: { select: { distributorCode: true } }, currentRank: { select: { name: true } } },
  });
  const byId = new Map(members.map((m) => [m.id, m]));
  return {
    items: rows.map((r) => {
      const m = byId.get(r.id)!;
      return {
        id: m.id, code: m.distributorCode, name: m.fullName, leg: r.leg, level: r.depth, tier: m.packageTier, status: m.status,
        rank: m.currentRank?.name ?? null, sponsorCode: m.sponsor?.distributorCode ?? null, joinedAt: m.createdAt, activatedAt: m.activatedAt,
      };
    }),
    total: Number(rows[0]?.total ?? 0),
    page,
    pageSize,
  };
}
