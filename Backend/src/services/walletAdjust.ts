/**
 * Wallet adjustments — an admin credits (adds) or debits (takes) money from a distributor's wallet by hand.
 *
 *  Flow (maker-checker, like closings):
 *    1. Super Admin / Finance raises a request            → PendingAction (action WALLET_ADJUST, status PENDING)
 *    2. A DIFFERENT admin approves it, in ONE transaction  → request APPROVED + WalletTxn (refType ADJUSTMENT,
 *       refId = request id, so it can never post twice) + a numbered Credit Note / Debit Note (the bill)
 *       … or rejects it with a reason                      → request REJECTED, wallet untouched
 *
 *  No schema change: PendingAction.payload (JSON) holds the details, Counter gives the note numbers,
 *  the WalletTxn ledger stays append-only and the balance can never go below 0 (prisma/sql/extras.sql).
 */
import type { Request } from 'express';
import { Prisma, type PendingAction } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma';
import { badRequest, forbidden, notFound } from '../lib/http';
import { nextCounter, istParts } from '../lib/counters';
import { getSettings } from '../lib/settings';
import { audit } from '../lib/audit';
import { creditWallet } from './wallet';

export const ADJ_ACTION = 'WALLET_ADJUST';
export const ADJ_REF = 'ADJUSTMENT';
export const MAX_ADJUSTMENT = 500_000;

export type AdjType = 'CREDIT' | 'DEBIT';
export interface AdjPayload {
  type: AdjType;
  amount: string;               // ₹, 2 decimals, as text (exact)
  reason: string;
  memberCode: string;
  memberName: string;
  balanceAtRequest: string;
  // filled in on approval
  noteNo?: string;              // CN/2026-27/000001 or DN/2026-27/000001
  txnId?: string;
  balanceBefore?: string;
  balanceAfter?: string;
  // filled in on rejection
  rejectReason?: string;
}

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const payloadOf = (p: PendingAction) => p.payload as unknown as AdjPayload;

/** Credit Note / Debit Note number per Indian financial year: CN/2026-27/000001 */
async function nextNoteNo(db: Tx, type: AdjType) {
  const { y, m } = istParts();
  const fy = m >= 4 ? y : y - 1;
  const fyLabel = `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;
  const prefix = type === 'CREDIT' ? 'CN' : 'DN';
  const n = await nextCounter(db, `wallet_${prefix.toLowerCase()}_${fy}`, 1);
  return `${prefix}/${fyLabel}/${String(n).padStart(6, '0')}`;
}

const blockedStatus = (s: string) => s === 'BLOCKED' || s === 'TERMINATED';

/** Step 1 — raise a request (nothing moves yet). */
export async function requestAdjustment(memberId: string, input: { type: AdjType; amount: number; reason: string }, userId: string, req: Request) {
  const amount = D(input.amount).toDecimalPlaces(2);
  const member = await prisma.member.findUnique({ where: { id: memberId }, include: { wallet: true } });
  if (!member) throw notFound('Distributor');
  if (blockedStatus(member.status)) throw badRequest(`${member.distributorCode} is ${member.status.toLowerCase()}. Wallet adjustments are not allowed for blocked or terminated distributors.`);
  const balance = member.wallet?.balance ?? D(0);
  if (input.type === 'DEBIT' && balance.lt(amount)) {
    throw badRequest(`Cannot debit ₹${amount.toFixed(2)}: the wallet balance is only ₹${balance.toFixed(2)}.`);
  }
  const payload: AdjPayload = {
    type: input.type, amount: amount.toFixed(2), reason: input.reason.trim(),
    memberCode: member.distributorCode, memberName: member.fullName, balanceAtRequest: balance.toFixed(2),
  };
  const request = await prisma.$transaction(async (tx) => {
    const r = await tx.pendingAction.create({
      data: { action: ADJ_ACTION, entity: 'Member', entityId: member.id, payload: payload as unknown as Prisma.InputJsonValue, requestedBy: userId },
    });
    await audit(req, 'WALLET_ADJUST.REQUEST', 'Member', member.id, { walletBalance: payload.balanceAtRequest },
      { requestId: r.id, type: payload.type, amount: payload.amount, reason: payload.reason, walletBalance: payload.balanceAtRequest }, tx);
    return r;
  });
  return { request, payload };
}

/** Who may decide (approve / reject) a request. */
async function checkDecider(p: PendingAction, user: { id: string; role: string }) {
  if (p.status !== 'PENDING') throw badRequest(`This request is already ${p.status.toLowerCase()}`);
  if (p.requestedBy !== user.id) return;
  const { values } = await getSettings();
  // with maker-checker on, nobody approves their own request; with it off, only the Super Admin may
  if (values.makerChecker || user.role !== 'ADMIN_SUPER') {
    throw forbidden('A different admin (Super Admin or Finance) must approve or reject a request you raised');
  }
}

async function loadRequest(id: string) {
  const p = await prisma.pendingAction.findUnique({ where: { id } });
  if (!p || p.action !== ADJ_ACTION) throw notFound('Wallet adjustment request');
  return p;
}

/** Step 2a — approve: ONE transaction, can never post twice. */
export async function approveAdjustment(id: string, user: { id: string; role: string }, req: Request) {
  const p = await loadRequest(id);
  await checkDecider(p, user);
  const pl = payloadOf(p);
  const amount = D(pl.amount);

  return prisma.$transaction(
    async (tx) => {
      // claim the request: only one approver can move it out of PENDING
      const claimed = await tx.pendingAction.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', decidedBy: user.id, decidedAt: new Date() } });
      if (claimed.count !== 1) throw badRequest('This request was already decided by someone else');

      const member = await tx.member.findUniqueOrThrow({ where: { id: p.entityId }, include: { wallet: true } });
      if (blockedStatus(member.status)) throw badRequest(`${member.distributorCode} is now ${member.status.toLowerCase()}. Reject this request instead.`);
      const before = member.wallet?.balance ?? D(0);
      const noteNo = await nextNoteNo(tx, pl.type);
      const note = `${pl.type === 'CREDIT' ? 'Admin credit' : 'Admin debit'} · ${noteNo} · ${pl.reason}`.slice(0, 500);

      let txnId: string;
      if (pl.type === 'CREDIT') {
        // allowed even when the wallet is on hold (withdrawals stay blocked)
        const t = await creditWallet(tx, member.id, amount, ADJ_REF, id, 'ADJUSTMENT', note);
        txnId = t!.id;
      } else {
        const updated = await tx.wallet.updateMany({ where: { memberId: member.id, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
        if (updated.count !== 1) throw badRequest(`Cannot debit ₹${amount.toFixed(2)}: the wallet balance is only ₹${before.toFixed(2)}. Reject this request or raise a smaller one.`);
        const w = await tx.wallet.findUniqueOrThrow({ where: { memberId: member.id } });
        const t = await tx.walletTxn.create({ data: { memberId: member.id, type: 'DEBIT', amount, balanceAfter: w.balance, refType: ADJ_REF, refId: id, note } });
        txnId = t.id;
      }
      const after = (await tx.wallet.findUniqueOrThrow({ where: { memberId: member.id } })).balance;
      const done: AdjPayload = { ...pl, noteNo, txnId, balanceBefore: before.toFixed(2), balanceAfter: after.toFixed(2) };
      await tx.pendingAction.update({ where: { id }, data: { payload: done as unknown as Prisma.InputJsonValue } });
      await audit(req, 'WALLET_ADJUST.APPROVE', 'Member', member.id, { walletBalance: done.balanceBefore },
        { requestId: id, noteNo, type: pl.type, amount: pl.amount, reason: pl.reason, requestedBy: p.requestedBy, walletBalance: done.balanceAfter, txnId }, tx);
      return { id, payload: done };
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

/** Step 2b — reject: wallet untouched. */
export async function rejectAdjustment(id: string, user: { id: string; role: string }, reason: string, req: Request) {
  const p = await loadRequest(id);
  await checkDecider(p, user);
  const pl = payloadOf(p);
  const done: AdjPayload = { ...pl, rejectReason: reason.trim() };
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.pendingAction.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', decidedBy: user.id, decidedAt: new Date(), reason: reason.trim(), payload: done as unknown as Prisma.InputJsonValue },
    });
    if (claimed.count !== 1) throw badRequest('This request was already decided by someone else');
    const balance = (await tx.wallet.findUnique({ where: { memberId: p.entityId } }))?.balance ?? D(0);
    await audit(req, 'WALLET_ADJUST.REJECT', 'Member', p.entityId, { walletBalance: balance.toFixed(2) },
      { requestId: id, type: pl.type, amount: pl.amount, reason: pl.reason, rejectReason: done.rejectReason, requestedBy: p.requestedBy, walletBalance: balance.toFixed(2) }, tx);
  });
  return { id, payload: done };
}

/** Turn requests into rows with distributor and admin details (for lists and CSV). */
export async function describe(items: PendingAction[]) {
  const memberIds = [...new Set(items.map((i) => i.entityId))];
  const userIds = [...new Set(items.flatMap((i) => [i.requestedBy, i.decidedBy]).filter(Boolean))] as string[];
  const [members, users] = await Promise.all([
    prisma.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, distributorCode: true, fullName: true, status: true, wallet: { select: { balance: true, onHold: true } } } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, mobile: true, role: true } }),
  ]);
  const who = (id: string | null) => {
    if (!id) return null;
    const u = users.find((x) => x.id === id);
    return u ? `${u.email ?? u.mobile} (${u.role.replace('ADMIN_', '').toLowerCase()})` : id;
  };
  return items.map((i) => {
    const pl = payloadOf(i);
    const m = members.find((x) => x.id === i.entityId);
    return {
      id: i.id, status: i.status, type: pl.type, amount: Number(pl.amount), reason: pl.reason, rejectReason: i.reason ?? pl.rejectReason ?? null,
      noteNo: pl.noteNo ?? null, balanceAtRequest: Number(pl.balanceAtRequest), balanceBefore: pl.balanceBefore ? Number(pl.balanceBefore) : null, balanceAfter: pl.balanceAfter ? Number(pl.balanceAfter) : null,
      member: { id: i.entityId, code: m?.distributorCode ?? pl.memberCode, name: m?.fullName ?? pl.memberName, status: m?.status ?? 'DELETED', walletBalance: m?.wallet ? Number(m.wallet.balance) : null, walletOnHold: m?.wallet?.onHold ?? false },
      requestedBy: i.requestedBy, requestedByName: who(i.requestedBy), decidedBy: i.decidedBy, decidedByName: who(i.decidedBy),
      createdAt: i.createdAt, decidedAt: i.decidedAt,
    };
  });
}

/* ---------------- the bill: Credit Note / Debit Note ---------------- */
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const inr = (v: unknown) => '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function inWords(n: number): string {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number) => (x < 20 ? a[x] : `${b[Math.floor(x / 10)]}${x % 10 ? ' ' + a[x % 10] : ''}`);
  const three = (x: number) => (x >= 100 ? `${a[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x));
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7), lakh = Math.floor((rupees % 1e7) / 1e5), thousand = Math.floor((rupees % 1e5) / 1e3), rest = rupees % 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  return `Rupees ${parts.join(' ') || 'Zero'}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}

/** Printable Credit Note / Debit Note for an APPROVED adjustment. memberId limits it to that distributor's own notes. */
export async function renderAdjustmentNote(id: string, memberId?: string) {
  const p = await prisma.pendingAction.findUnique({ where: { id } });
  if (!p || p.action !== ADJ_ACTION || p.status !== 'APPROVED' || (memberId && p.entityId !== memberId)) throw notFound('Credit / debit note');
  const [row] = await describe([p]);
  const pl = payloadOf(p);
  const member = await prisma.member.findUnique({ where: { id: p.entityId }, include: { user: { select: { mobile: true } } } });
  const credit = pl.type === 'CREDIT';
  const title = credit ? 'CREDIT NOTE' : 'DEBIT NOTE';
  const d = p.decidedAt ?? p.createdAt;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} ${esc(pl.noteNo)}</title>
<style>body{font-family:Arial,sans-serif;color:#1f2937;margin:32px;font-size:13px}h1{color:#14532d;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border:1px solid #d1d5db;padding:8px;text-align:left}th{background:#ecfdf5}.muted{color:#6b7280;font-size:11px}.right{text-align:right}.top{display:flex;justify-content:space-between;gap:24px}
.amt{font-size:20px;font-weight:bold;color:${credit ? '#15803d' : '#b91c1c'}}.sign{margin-top:48px;display:flex;justify-content:space-between}.sign div{border-top:1px solid #9ca3af;padding-top:4px;width:200px;text-align:center}@media print{button{display:none}}</style></head>
<body><button onclick="window.print()" style="float:right;padding:8px 14px">Print / Save PDF</button>
<div class="top"><div><h1>Navarth Wellness Pvt. Ltd.</h1><div class="muted">Jiyo Zindagi Shaan Se · GSTIN: <b>TO-BE-FILLED</b> · Head office: Ramnagar, Bhiti, Tengara Mod, Bypass, Varanasi</div></div>
<div><h2 style="margin:0">${title}</h2><div>No: <b>${esc(pl.noteNo)}</b></div><div>Date: ${d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</div><div class="muted">Ref: ${esc(p.id)}</div></div></div>
<p><b>${credit ? 'Credited to' : 'Debited from'}:</b> ${esc(member?.fullName ?? pl.memberName)} (${esc(pl.memberCode)})${member?.user.mobile ? ` · ${esc(member.user.mobile)}` : ''}</p>
<table><thead><tr><th>#</th><th>Particulars</th><th class="right">Amount</th></tr></thead>
<tbody><tr><td>1</td><td>Wallet ${credit ? 'credit' : 'debit'} — ${esc(pl.reason)}</td><td class="right">${inr(pl.amount)}</td></tr></tbody></table>
<table style="width:360px;margin-left:auto"><tr><td>Wallet balance before</td><td class="right">${inr(pl.balanceBefore)}</td></tr>
<tr><td>${credit ? 'Added' : 'Deducted'}</td><td class="right amt">${credit ? '+' : '−'} ${inr(pl.amount)}</td></tr>
<tr><td><b>Wallet balance after</b></td><td class="right"><b>${inr(pl.balanceAfter)}</b></td></tr></table>
<p><b>Amount in words:</b> ${inWords(Number(pl.amount))}</p>
<p class="muted">Requested by ${esc(row.requestedByName)} on ${p.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · Approved by ${esc(row.decidedByName)} on ${d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
<p class="muted">This is a wallet ${credit ? 'credit' : 'debit'} note, not a tax invoice. TDS and admin charges, where applicable, are deducted when the distributor withdraws from the wallet. Computer-generated document.</p>
<div class="sign"><div>Prepared by</div><div>Authorised signatory</div></div>
</body></html>`;
}
