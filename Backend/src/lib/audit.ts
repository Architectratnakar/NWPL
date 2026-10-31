import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma, type Tx } from './prisma';

export async function audit(
  req: Request | null,
  action: string,
  entity: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
  db: Tx = prisma,
) {
  const json = (v: unknown) => (v === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));
  await db.auditLog.create({
    data: {
      actorId: req?.user?.id ?? 'system',
      action,
      entity,
      entityId,
      before: json(before),
      after: json(after),
      ip: req?.ip ?? null,
    },
  });
}
