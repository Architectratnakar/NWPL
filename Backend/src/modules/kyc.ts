import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { createModule, memberOnly } from '../lib/openapi';
import { badRequest, forbidden, notFound } from '../lib/http';
import { isStaff } from '../lib/auth';
import { encrypt, mask } from '../lib/crypto';
import { env } from '../config/env';

const dir = path.resolve(env.UPLOAD_DIR, 'kyc');
fs.mkdirSync(dir, { recursive: true });

export const kycUpload = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)),
});

const m = createModule('/kyc', 'KYC');

m.get('/', {
  summary: 'My KYC documents',
  handler: async ({ user }) => {
    const memberId = memberOnly(user);
    const [docs, member] = await Promise.all([
      prisma.kycDocument.findMany({ where: { memberId }, orderBy: { createdAt: 'desc' } }),
      prisma.member.findUniqueOrThrow({ where: { id: memberId }, select: { kycStatus: true } }),
    ]);
    return { status: member.kycStatus, documents: docs.map(({ numberEnc, ...d }) => ({ ...d, hasNumber: !!numberEnc })) };
  },
});

m.post('/', {
  summary: 'Upload a KYC document (jpg / png / pdf, max 5 MB)',
  use: [kycUpload.single('file')],
  multipart: {
    type: z.enum(['PAN', 'AADHAAR', 'PHOTO', 'BANK_PROOF', 'DISABILITY_CERT', 'OTHER']),
    number: z.string().optional(),
    file: z.string().openapi({ type: 'string', format: 'binary' }),
  },
  handler: async ({ user, req }) => {
    const memberId = memberOnly(user);
    if (!req.file) throw badRequest('Attach a JPG, PNG or PDF file (max 5 MB)');
    const body = z.object({ type: z.enum(['PAN', 'AADHAAR', 'PHOTO', 'BANK_PROOF', 'DISABILITY_CERT', 'OTHER']), number: z.string().optional() }).parse(req.body);
    if (body.type === 'PAN' && body.number && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(body.number.toUpperCase())) throw badRequest('Enter a valid PAN (e.g. ABCDE1234F)');
    // Aadhaar: store only the masked number
    const num = body.number ? (body.type === 'AADHAAR' ? mask(body.number.replace(/\D/g, '')) : body.number.toUpperCase()) : null;
    const doc = await prisma.kycDocument.create({
      data: { memberId, type: body.type, numberEnc: num ? encrypt(num) : null, fileKey: `kyc/${req.file.filename}` },
    });
    await prisma.member.update({ where: { id: memberId }, data: { kycStatus: 'PENDING' } });
    const { numberEnc, ...safe } = doc;
    return { ...safe, hasNumber: !!numberEnc };
  },
});

m.get('/file/:id', {
  summary: 'Download a KYC file (owner or staff only)',
  raw: true,
  handler: async ({ user, params, res }) => {
    const doc = await prisma.kycDocument.findUnique({ where: { id: params.id } });
    if (!doc) throw notFound('Document');
    if (!isStaff(user) && doc.memberId !== user.memberId) throw forbidden();
    const file = path.resolve(env.UPLOAD_DIR, doc.fileKey);
    if (!file.startsWith(path.resolve(env.UPLOAD_DIR)) || !fs.existsSync(file)) throw notFound('File');
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(file);
  },
});

export default m;
