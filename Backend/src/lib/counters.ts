import type { Tx } from './prisma';

/** Atomic counter: safe under concurrency (single UPDATE ... RETURNING). */
export async function nextCounter(db: Tx, key: string, start: number): Promise<number> {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, ${start})
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return Number(rows[0].value);
}

/** Date parts in Indian Standard Time */
export function istParts(d = new Date()) {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + 1;
  const day = ist.getUTCDate();
  return { y, m, day, ymd: `${y}${String(m).padStart(2, '0')}${String(day).padStart(2, '0')}` };
}

export const nextDistributorCode = async (db: Tx) => `NW${await nextCounter(db, 'member_code', 100001)}`;

export async function nextOrderNo(db: Tx) {
  return `ORD-${istParts().ymd}-${String(await nextCounter(db, 'order_no', 1)).padStart(6, '0')}`;
}

/** GST invoice number per Indian financial year: INV/2026-27/000001 */
export async function nextInvoiceNo(db: Tx) {
  const { y, m } = istParts();
  const fy = m >= 4 ? y : y - 1;
  const label = `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;
  const n = await nextCounter(db, `invoice_${label}`, 1);
  return `INV/${label}/${String(n).padStart(6, '0')}`;
}
