import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createModule, PageQuery } from '../../lib/openapi';
import { ROLES } from '../../lib/auth';
import { getSettings } from '../../lib/settings';
import { badRequest, forbidden } from '../../lib/http';
import {
  ADJ_ACTION, MAX_ADJUSTMENT, approveAdjustment, describe, rejectAdjustment, renderAdjustmentNote, requestAdjustment,
} from '../../services/walletAdjust';

/* ======================= WALLET ADJUSTMENTS (manual credit / debit, maker-checker) ======================= */
export const walletAdjust = createModule('/admin', 'Admin · Wallet adjustments');

const Amount = z
  .number({ invalid_type_error: 'Enter the amount in ₹' })
  .positive('Amount must be more than ₹0')
  .max(MAX_ADJUSTMENT, `Amount can be at most ₹${MAX_ADJUSTMENT.toLocaleString('en-IN')}`)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Amount can have at most 2 decimals (paise)');

walletAdjust.post('/members/:id/wallet-adjustments', {
  summary: 'Raise a wallet credit / debit request for a distributor (a different admin must approve it)',
  access: ROLES.FINANCE,
  body: z.object({
    type: z.enum(['CREDIT', 'DEBIT']),
    amount: Amount.openapi({ description: '₹, more than 0, at most 2 decimals, max 5,00,000' }),
    reason: z.string().trim().min(10, 'Reason must be at least 10 characters').max(300),
    approveNow: z.boolean().optional().openapi({ description: 'Super Admin only, and only when maker-checker is OFF: approve in the same click ("Credit now")' }),
  }),
  handler: async ({ params, body, user, req }) => {
    const { values } = await getSettings();
    const selfApprove = !values.makerChecker && user.role === 'ADMIN_SUPER';
    if (body.approveNow && !selfApprove) {
      throw forbidden(values.makerChecker
        ? 'Maker-checker is ON: a second admin (Finance admin or another Super Admin) must approve. Raise the request without "Credit now", or switch maker-checker off in Plan settings.'
        : 'Only the Super Admin can credit / debit immediately');
    }
    const { request, payload } = await requestAdjustment(params.id, body, user.id, req);
    if (body.approveNow) {
      // same rules and same single transaction as the Approve button; if it fails the request stays PENDING
      try {
        const r = await approveAdjustment(request.id, user, req);
        return { id: request.id, status: 'APPROVED', ...r.payload, selfApprove };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Approval failed';
        throw badRequest(`The request was saved as PENDING, but could not be approved: ${msg}`);
      }
    }
    return { id: request.id, status: request.status, ...payload, selfApprove };
  },
});

const Status = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

walletAdjust.get('/wallet-adjustments/rules', {
  summary: 'Who can approve wallet adjustments right now (for the "Adjust wallet" popup)',
  access: ROLES.FINANCE,
  handler: async ({ user }) => {
    const { values } = await getSettings();
    const approvers = await prisma.user.count({ where: { role: { in: ['ADMIN_SUPER', 'ADMIN_FINANCE'] }, isActive: true, NOT: { id: user.id } } });
    return { makerChecker: values.makerChecker, canApproveOwn: !values.makerChecker && user.role === 'ADMIN_SUPER', otherApprovers: approvers };
  },
});

walletAdjust.get('/wallet-adjustments', {
  summary: 'Wallet adjustment requests (paged). Add ?format=csv to download.',
  access: ROLES.FINANCE,
  raw: true,
  query: PageQuery.extend({
    status: Status.optional(),
    memberId: z.string().optional(),
    q: z.string().trim().optional().openapi({ description: 'Distributor code or name' }),
    format: z.enum(['json', 'csv']).default('json'),
  }),
  handler: async ({ query, res, user }) => {
    const where: Prisma.PendingActionWhereInput = { action: ADJ_ACTION, status: query.status, entityId: query.memberId };
    if (query.q) {
      const ids = await prisma.member.findMany({
        where: { OR: [{ distributorCode: { contains: query.q, mode: 'insensitive' } }, { fullName: { contains: query.q, mode: 'insensitive' } }] },
        select: { id: true }, take: 500,
      });
      where.entityId = { in: ids.map((i) => i.id).filter((id) => !query.memberId || id === query.memberId) };
    }
    const csv = query.format === 'csv';
    const [items, total, counts] = await Promise.all([
      prisma.pendingAction.findMany({ where, orderBy: { createdAt: 'desc' }, skip: csv ? 0 : (query.page - 1) * query.pageSize, take: csv ? 50_000 : query.pageSize }),
      prisma.pendingAction.count({ where }),
      prisma.pendingAction.groupBy({ by: ['status'], where: { action: ADJ_ACTION, entityId: query.memberId }, _count: true }),
    ]);
    const rows = await describe(items);

    if (csv) {
      const ist = (d: Date | null) => (d ? new Date(d.getTime() + 330 * 60_000).toISOString().replace('T', ' ').slice(0, 16) : '');
      const cols: [string, (r: (typeof rows)[number]) => unknown][] = [
        ['Requested at (IST)', (r) => ist(r.createdAt)], ['Distributor ID', (r) => r.member.code], ['Name', (r) => r.member.name],
        ['Type', (r) => r.type], ['Amount', (r) => r.amount.toFixed(2)], ['Reason', (r) => r.reason], ['Status', (r) => r.status],
        ['Note no.', (r) => r.noteNo], ['Balance before', (r) => r.balanceBefore?.toFixed(2)], ['Balance after', (r) => r.balanceAfter?.toFixed(2)],
        ['Requested by', (r) => r.requestedByName], ['Decided by', (r) => r.decidedByName], ['Decided at (IST)', (r) => ist(r.decidedAt)], ['Reject reason', (r) => r.rejectReason],
      ];
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="wallet-adjustments-${(query.status ?? 'all').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send('﻿' + [cols.map((c) => c[0]).join(','), ...rows.map((r) => cols.map((c) => esc(c[1](r))).join(','))].join('\n'));
      return;
    }

    const { values } = await getSettings();
    // totals of approved credits / debits (for the cards)
    const approved = await prisma.walletTxn.groupBy({ by: ['type'], where: { refType: 'ADJUSTMENT', memberId: query.memberId }, _sum: { amount: true }, _count: true });
    res.json({
      data: {
        items: rows.map((r) => ({ ...r, mine: r.requestedBy === user.id })),
        total, page: query.page, pageSize: query.pageSize,
        counts: Object.fromEntries(Status.options.map((s) => [s, counts.find((c) => c.status === s)?._count ?? 0])),
        totals: Object.fromEntries(['CREDIT', 'DEBIT'].map((t) => [t, Number(approved.find((a) => a.type === t)?._sum.amount ?? 0)])),
        makerChecker: values.makerChecker,
        canApproveOwn: !values.makerChecker && user.role === 'ADMIN_SUPER',
      },
    });
  },
});

walletAdjust.post('/wallet-adjustments/:id/approve', {
  summary: 'Approve a request: credit / debit the wallet and issue the Credit / Debit Note (one transaction)',
  access: ROLES.FINANCE,
  handler: async ({ params, user, req }) => {
    const r = await approveAdjustment(params.id, user, req);
    return { id: r.id, status: 'APPROVED', noteNo: r.payload.noteNo, balanceAfter: r.payload.balanceAfter };
  },
});

walletAdjust.post('/wallet-adjustments/:id/reject', {
  summary: 'Reject a request (the wallet is not touched)',
  access: ROLES.FINANCE,
  body: z.object({ reason: z.string().trim().min(5, 'Write why it is rejected (at least 5 characters)').max(300) }),
  handler: async ({ params, body, user, req }) => {
    await rejectAdjustment(params.id, user, body.reason, req);
    return { id: params.id, status: 'REJECTED' };
  },
});

walletAdjust.get('/wallet-adjustments/:id/note', {
  summary: 'Printable Credit Note / Debit Note of an approved adjustment (HTML)',
  access: ROLES.FINANCE,
  raw: true,
  handler: async ({ params, res }) => {
    res.type('html').send(await renderAdjustmentNote(params.id));
  },
});
