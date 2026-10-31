import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { createModule } from '../lib/openapi';
import { AppError, badRequest } from '../lib/http';
import { signAccessToken, type AuthUser } from '../lib/auth';
import { randomToken, sha256 } from '../lib/crypto';
import { env } from '../config/env';
import { audit } from '../lib/audit';

const m = createModule('/auth', 'Auth');
const COOKIE = 'mlm_rt';
const cookieOpts = {
  httpOnly: true,
  sameSite: env.COOKIE_SAMESITE,
  secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
  path: '/api/v1/auth',
  maxAge: env.REFRESH_TOKEN_DAYS * 86_400_000,
};

async function sessionFor(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { member: { include: { currentRank: true } } } });
  const authUser: AuthUser = { id: user.id, role: user.role, memberId: user.member?.id ?? null, name: user.member?.fullName ?? user.email ?? user.mobile };
  return {
    accessToken: signAccessToken(authUser),
    user: {
      ...authUser,
      email: user.email,
      mobile: user.mobile,
      distributorCode: user.member?.distributorCode ?? null,
      packageTier: user.member?.packageTier ?? null,
      memberStatus: user.member?.status ?? null,
      rank: user.member?.currentRank?.name ?? null,
    },
  };
}

async function issueRefresh(userId: string) {
  const token = randomToken();
  await prisma.refreshToken.create({ data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + cookieOpts.maxAge) } });
  return token;
}

const LoginBody = z
  .object({
    login: z.string().min(3).openapi({ description: 'Distributor ID (NW100001), mobile number or email', example: 'NW100001' }),
    password: z.string().min(1).openapi({ example: 'Demo@123' }),
  })
  .openapi('LoginBody');

m.post('/login', {
  summary: 'Log in with distributor ID / mobile / email + password',
  access: 'public',
  body: LoginBody,
  handler: async ({ body, req, res }) => {
    const login = body.login.trim();
    const user = await prisma.user.findFirst({
      where: { OR: [{ mobile: login }, { email: login.toLowerCase() }, { member: { distributorCode: login.toUpperCase() } }] },
    });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) throw new AppError(401, 'INVALID_LOGIN', 'Wrong user ID or password');
    if (!user.isActive) throw new AppError(403, 'DISABLED', 'This login is disabled. Contact support.');
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    res.cookie(COOKIE, await issueRefresh(user.id), cookieOpts);
    req.user = { id: user.id, role: user.role, memberId: null, name: '' };
    await audit(req, 'AUTH.LOGIN', 'User', user.id);
    return sessionFor(user.id);
  },
});

m.post('/refresh', {
  summary: 'Get a new access token using the refresh cookie',
  access: 'public',
  handler: async ({ req, res }) => {
    const token = req.cookies?.[COOKIE] as string | undefined;
    if (!token) throw new AppError(401, 'NO_SESSION', 'Please log in');
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    // a token rotated in the last 30 s may be presented again (two tabs / parallel requests) — allow it once more
    const graceOk = !!row?.revokedAt && Date.now() - row.revokedAt.getTime() < 30_000;
    if (!row || (row.revokedAt && !graceOk) || row.expiresAt < new Date() || !row.user.isActive) {
      res.clearCookie(COOKIE, { path: cookieOpts.path });
      throw new AppError(401, 'SESSION_EXPIRED', 'Your session has expired. Please log in again.');
    }
    // rotate the refresh token
    if (!row.revokedAt) await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    res.cookie(COOKIE, await issueRefresh(row.userId), cookieOpts);
    return sessionFor(row.userId);
  },
});

m.post('/logout', {
  summary: 'Log out (revokes the refresh token)',
  access: 'public',
  handler: async ({ req, res }) => {
    const token = req.cookies?.[COOKIE] as string | undefined;
    if (token) await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
    res.clearCookie(COOKIE, { path: cookieOpts.path });
    return { ok: true };
  },
});

m.get('/me', { summary: 'Current session user', handler: ({ user }) => sessionFor(user.id) });

m.post('/change-password', {
  summary: 'Change own password',
  body: z.object({ currentPassword: z.string(), newPassword: z.string().min(8).regex(/[A-Z]/, 'needs a capital letter').regex(/[0-9]/, 'needs a number') }),
  handler: async ({ body, user, req }) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await bcrypt.compare(body.currentPassword, u.passwordHash))) throw badRequest('Current password is wrong');
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 10) } });
    await prisma.refreshToken.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(req, 'AUTH.CHANGE_PASSWORD', 'User', u.id);
    return { ok: true };
  },
});

m.post('/forgot-password', {
  summary: 'Request a password reset (demo: logs the request; connect an SMS/email provider in production)',
  access: 'public',
  body: z.object({ login: z.string().min(3) }),
  handler: async ({ body, req }) => {
    await audit(req, 'AUTH.FORGOT_PASSWORD', 'User', body.login);
    return { ok: true, message: 'If this ID exists, reset instructions will be sent to the registered mobile number.' };
  },
});

export default m;
