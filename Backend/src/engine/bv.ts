import { prisma, type Tx } from '../lib/prisma';

/**
 * Adds one BvPosting to the left/right totals of every ancestor in the binary tree.
 * Uses a recursive CTE on Member.parentId, so it works at any tree depth.
 * Idempotent: an already-propagated posting is skipped.
 */
export async function propagatePosting(db: Tx, postingId: string): Promise<number> {
  const p = await db.bvPosting.findUnique({ where: { id: postingId } });
  if (!p || p.propagated) return 0;
  const bv = p.bv.toString();
  const units = p.pairUnits;
  const tier = p.tier as string;

  const n = await db.$executeRaw`
    WITH RECURSIVE up AS (
      SELECT m."parentId" AS ancestor_id, m."side"::text AS side
      FROM "Member" m WHERE m."id" = ${p.memberId} AND m."parentId" IS NOT NULL
      UNION ALL
      SELECT m."parentId", m."side"::text
      FROM "Member" m JOIN up ON m."id" = up.ancestor_id
      WHERE m."parentId" IS NOT NULL
    )
    UPDATE "NodeVolume" nv SET
      "totalLeftBv"     = nv."totalLeftBv"  + CASE WHEN up.side = 'LEFT'  THEN ${bv}::numeric ELSE 0 END,
      "totalRightBv"    = nv."totalRightBv" + CASE WHEN up.side = 'RIGHT' THEN ${bv}::numeric ELSE 0 END,
      "totalLeftCount"  = nv."totalLeftCount"  + CASE WHEN up.side = 'LEFT'  THEN ${units}::int ELSE 0 END,
      "totalRightCount" = nv."totalRightCount" + CASE WHEN up.side = 'RIGHT' THEN ${units}::int ELSE 0 END,
      "carryLeftFull"   = GREATEST(0, nv."carryLeftFull"   + CASE WHEN up.side = 'LEFT'  AND ${tier}::text = 'FULL'  THEN ${units}::int ELSE 0 END),
      "carryLeftBasic"  = GREATEST(0, nv."carryLeftBasic"  + CASE WHEN up.side = 'LEFT'  AND ${tier}::text = 'BASIC' THEN ${units}::int ELSE 0 END),
      "carryRightFull"  = GREATEST(0, nv."carryRightFull"  + CASE WHEN up.side = 'RIGHT' AND ${tier}::text = 'FULL'  THEN ${units}::int ELSE 0 END),
      "carryRightBasic" = GREATEST(0, nv."carryRightBasic" + CASE WHEN up.side = 'RIGHT' AND ${tier}::text = 'BASIC' THEN ${units}::int ELSE 0 END),
      "updatedAt"       = now()
    FROM up WHERE nv."memberId" = up.ancestor_id`;

  await db.bvPosting.update({ where: { id: postingId }, data: { propagated: true } });
  return n;
}

/** Process every pending posting, oldest first (called by the worker and before each closing). */
export async function propagatePending(limit = 1000) {
  const pending = await prisma.bvPosting.findMany({ where: { propagated: false }, orderBy: [{ postedAt: 'asc' }, { id: 'asc' }], take: limit, select: { id: true } });
  for (const p of pending) {
    await prisma.$transaction((tx) => propagatePosting(tx, p.id));
  }
  return pending.length;
}
