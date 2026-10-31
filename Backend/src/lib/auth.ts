import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from './http';

export interface AuthUser {
  id: string;
  role: Role;
  memberId: string | null;
  name: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const STAFF: Role[] = ['ADMIN_SUPER', 'ADMIN_OPS', 'ADMIN_FINANCE', 'COMPLIANCE', 'SUPPORT'];
export const ROLES = {
  SUPER: ['ADMIN_SUPER'] as Role[],
  OPS: ['ADMIN_SUPER', 'ADMIN_OPS'] as Role[],
  FINANCE: ['ADMIN_SUPER', 'ADMIN_FINANCE'] as Role[],
  KYC: ['ADMIN_SUPER', 'ADMIN_OPS', 'COMPLIANCE'] as Role[],
  SUPPORT: ['ADMIN_SUPER', 'ADMIN_OPS', 'SUPPORT', 'COMPLIANCE'] as Role[],
  REPORTS: ['ADMIN_SUPER', 'ADMIN_OPS', 'ADMIN_FINANCE', 'COMPLIANCE'] as Role[],
  AUDIT: ['ADMIN_SUPER', 'COMPLIANCE'] as Role[],
  STAFF,
  MEMBER: ['MEMBER', 'FRANCHISE'] as Role[],
};

export function signAccessToken(u: AuthUser) {
  return jwt.sign(u, env.JWT_ACCESS_SECRET, { expiresIn: `${env.ACCESS_TOKEN_MINUTES}m` });
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) {
    try {
      const p = jwt.verify(h.slice(7), env.JWT_ACCESS_SECRET) as AuthUser;
      req.user = { id: p.id, role: p.role, memberId: p.memberId, name: p.name };
    } catch {
      /* invalid / expired token -> treated as anonymous; protected routes return 401 */
    }
  }
  next();
}

export function requireRoles(roles: Role[] | 'any') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHORIZED', 'Please log in again'));
    if (roles !== 'any' && !roles.includes(req.user.role)) return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to do this'));
    next();
  };
}

export const isStaff = (u?: AuthUser) => !!u && STAFF.includes(u.role);
