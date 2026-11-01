import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { explainDbError } from './dbcheck';

export class AppError extends Error {
  constructor(public status: number, public code: string, message?: string, public details?: unknown) {
    super(message ?? code);
  }
}
export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', msg, details);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do this') => new AppError(403, 'FORBIDDEN', msg);
export const conflict = (msg: string) => new AppError(409, 'CONFLICT', msg);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input',
        details: err.flatten(),
      },
    });
  }
  // Database not set up / not reachable → say exactly what is wrong and how to fix it
  const db = explainDbError(err);
  if (db) {
    console.error(`\n❌ ${db.message}\n   Fix: ${db.fix}\n`);
    return res.status(503).json({ error: { code: db.code, message: db.message, details: { fix: db.fix } } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      return res.status(409).json({ error: { code: 'DUPLICATE', message: `Already exists: ${target}` } });
    }
    if (err.code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
  }
  const message = err instanceof Error ? err.message : 'Unexpected error';
  // Database rule violations (from prisma/sql/extras.sql) come back as plain errors
  if (/violates check constraint|cannot be changed|append-only/.test(message)) {
    return res.status(400).json({ error: { code: 'DB_RULE', message } });
  }
  console.error('\n❌ Unexpected server error:', err);
  // In development show the real reason (never in production — it could reveal internals)
  if (process.env.NODE_ENV !== 'production') {
    const stack = err instanceof Error ? (err.stack ?? '').split('\n').slice(0, 4).map((l) => l.trim()) : [];
    return res.status(500).json({ error: { code: 'INTERNAL', message: `Server error: ${message}`, details: { stack } } });
  }
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
}

export interface Page {
  page: number;
  pageSize: number;
}
export const paged = <T>(items: T[], total: number, p: Page) => ({ items, total, page: p.page, pageSize: p.pageSize });
export const skipTake = (p: Page) => ({ skip: (p.page - 1) * p.pageSize, take: p.pageSize });
