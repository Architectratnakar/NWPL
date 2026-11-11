import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createModule } from '../lib/openapi';
import { AppError, badRequest } from '../lib/http';
import { signAccessToken, type AuthUser } from '../lib/auth';
import { randomToken, sha256 } from '../lib/crypto';
import { env } from '../config/env';
import { audit } from '../lib/audit';
import { maskMobile, sendOtpSms } from '../lib/sms';

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

/* ---------------- Super Admin login OTP ---------------- */
const OTP_PURPOSE = 'ADMIN_LOGIN';
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 30;
const OTP_MAX_PER_15_MIN = 6;
const otpHash = (challengeId: string, code: string) => crypto.createHmac('sha256', env.ENCRYPTION_SECRET).update(`${challengeId}:${code}`).digest('hex');
const needsOtp = (u: Pick<User, 'role'>) => env.SUPER_ADMIN_OTP && u.role === 'ADMIN_SUPER';

/** Create a fresh OTP for this login, send it by SMS, and return the challenge the browser must answer. */
async function startOtpChallenge(user: User) {
  const since = new Date(Date.now() - 15 * 60_000);
  const recent = await prisma.otpCode.count({ where: { userId: user.id, purpose: OTP_PURPOSE, createdAt: { gte: since } } });
  if (recent >= OTP_MAX_PER_15_MIN) throw new AppError(429, 'OTP_TOO_MANY', 'Too many OTP requests. Please try again after 15 minutes.');

  const to = env.SUPER_ADMIN_OTP_MOBILE || user.mobile;
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const challengeId = randomToken();
  // only one live OTP per login: older ones stop working
  await prisma.otpCode.updateMany({ where: { userId: user.id, purpose: OTP_PURPOSE, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.otpCode.create({
    data: { id: challengeId, userId: user.id, mobile: to, purpose: OTP_PURPOSE, codeHash: otpHash(challengeId, code), expiresAt: new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60_000) },
  });
  try {
    await sendOtpSms(to, code, 'Super Admin login');
  } catch (e) {
    await prisma.otpCode.update({ where: { id: challengeId }, data: { usedAt: new Date() } });
    throw e;
  }
  return {
    otpRequired: true as const,
    challengeId,
    sentTo: maskMobile(to),
    expiresInSeconds: env.OTP_EXPIRY_MINUTES * 60,
    resendInSeconds: OTP_RESEND_SECONDS,
    // development convenience only: with SMS_PROVIDER=console there is no SMS, so show the code on screen
    ...(env.NODE_ENV !== 'production' && env.SMS_PROVIDER === 'console' ? { devOtp: code } : {}),
  };
}

async function completeLogin(user: User, req: Parameters<typeof audit>[0], res: import('express').Response, via: 'PASSWORD' | 'PASSWORD+OTP') {
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  res.cookie(COOKIE, await issueRefresh(user.id), cookieOpts);
  if (req) req.user = { id: user.id, role: user.role, memberId: null, name: '' };
  await audit(req, 'AUTH.LOGIN', 'User', user.id, undefined, { via });
  return sessionFor(user.id);
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
    if (needsOtp(user)) {
      // Super Admin: the password alone is not enough — an OTP is sent to the registered admin mobile
      const challenge = await startOtpChallenge(user);
      req.user = { id: user.id, role: user.role, memberId: null, name: '' };
      await audit(req, 'AUTH.OTP_SENT', 'User', user.id, undefined, { sentTo: challenge.sentTo });
      return challenge;
    }
    return completeLogin(user, req, res, 'PASSWORD');
  },
});

m.post('/login/verify-otp', {
  summary: 'Super Admin login, step 2: verify the OTP sent by SMS',
  access: 'public',
  body: z.object({
    challengeId: z.string().min(20),
    otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit OTP'),
  }),
  handler: async ({ body, req, res }) => {
    const row = await prisma.otpCode.findUnique({ where: { id: body.challengeId } });
    if (!row || row.purpose !== OTP_PURPOSE || !row.userId) throw new AppError(401, 'OTP_INVALID', 'This OTP request is not valid. Please sign in again.');
    if (row.usedAt) throw new AppError(401, 'OTP_USED', 'This OTP was already used or replaced by a newer one. Please sign in again.');
    if (row.expiresAt < new Date()) throw new AppError(401, 'OTP_EXPIRED', 'The OTP has expired. Tap "Resend OTP" or sign in again.');
    if (row.attempts >= OTP_MAX_ATTEMPTS) throw new AppError(429, 'OTP_LOCKED', 'Too many wrong attempts. Please sign in again.');

    const ok = crypto.timingSafeEqual(Buffer.from(otpHash(row.id, body.otp)), Buffer.from(row.codeHash));
    if (!ok) {
      const attempts = row.attempts + 1;
      await prisma.otpCode.update({ where: { id: row.id }, data: { attempts, ...(attempts >= OTP_MAX_ATTEMPTS ? { usedAt: new Date() } : {}) } });
      req.user = { id: row.userId, role: 'ADMIN_SUPER', memberId: null, name: '' };
      await audit(req, 'AUTH.OTP_FAILED', 'User', row.userId, undefined, { attempts });
      const left = OTP_MAX_ATTEMPTS - attempts;
      throw new AppError(401, left > 0 ? 'OTP_WRONG' : 'OTP_LOCKED', left > 0 ? `Wrong OTP. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Please sign in again.');
    }
    // single use, even if two requests arrive at the same moment
    const used = await prisma.otpCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count !== 1) throw new AppError(401, 'OTP_USED', 'This OTP was already used. Please sign in again.');

    const user = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!user || !user.isActive) throw new AppError(403, 'DISABLED', 'This login is disabled. Contact support.');
    return completeLogin(user, req, res, 'PASSWORD+OTP');
  },
});

m.post('/login/resend-otp', {
  summary: 'Super Admin login: send a new OTP for the same sign-in (after 30 seconds)',
  access: 'public',
  body: z.object({ challengeId: z.string().min(20) }),
  handler: async ({ body, req }) => {
    const row = await prisma.otpCode.findUnique({ where: { id: body.challengeId } });
    // the challenge proves the password was entered; it can be renewed for 15 minutes
    if (!row || row.purpose !== OTP_PURPOSE || !row.userId || row.createdAt < new Date(Date.now() - 15 * 60_000) || row.attempts >= OTP_MAX_ATTEMPTS) {
      throw new AppError(401, 'OTP_INVALID', 'Please sign in again to get a new OTP.');
    }
    const wait = Math.ceil((row.createdAt.getTime() + OTP_RESEND_SECONDS * 1000 - Date.now()) / 1000);
    if (wait > 0) throw new AppError(429, 'OTP_WAIT', `Please wait ${wait} seconds before asking for a new OTP.`);
    const user = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!user || !user.isActive || !needsOtp(user)) throw new AppError(401, 'OTP_INVALID', 'Please sign in again.');
    const challenge = await startOtpChallenge(user);
    req.user = { id: user.id, role: user.role, memberId: null, name: '' };
    await audit(req, 'AUTH.OTP_RESENT', 'User', user.id, undefined, { sentTo: challenge.sentTo });
    return challenge;
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
