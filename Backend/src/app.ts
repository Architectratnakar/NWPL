import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { authenticate } from './lib/auth';
import { buildOpenApiDoc } from './lib/openapi';
import { errorHandler } from './lib/http';
import { checkDatabase } from './lib/dbcheck';

import auth from './modules/auth';
import publicApi from './modules/public';
import me from './modules/me';
import genealogy from './modules/genealogy';
import kyc from './modules/kyc';
import catalog from './modules/catalog';
import orders from './modules/orders';
import finance from './modules/finance';
import tickets from './modules/tickets';
import * as adminCore from './modules/admin/core';
import * as adminCommerce from './modules/admin/commerce';
import * as adminMoney from './modules/admin/money';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: env.WEB_ORIGIN.split(',').map((o) => o.trim()), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

  const api = express.Router();
  api.use(authenticate);
  api.use('/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 50, standardHeaders: true, legacyHeaders: false }));
  api.get('/health', async (_req, res) => {
    const db = await checkDatabase();
    res.status(db.ok ? 200 : 503).json({ data: { ok: db.ok, database: db.status, fix: db.fix ?? null, time: new Date().toISOString() } });
  });

  const modules = [
    auth, publicApi, me, genealogy, kyc, catalog, orders, finance, tickets,
    adminCore.dashboard, adminCore.users, adminCore.members, adminCore.kyc, adminCore.auditLog,
    adminCommerce.products, adminCommerce.packages, adminCommerce.ranks, adminCommerce.orders, adminCommerce.returns,
    adminMoney.closings, adminMoney.withdrawals, adminMoney.settings, adminMoney.reports, adminMoney.tickets,
  ];
  for (const m of modules) api.use(m.base, m.router);
  api.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found' } }));

  app.use('/api/v1', api);
  app.get('/api/openapi.json', (_req, res) => res.json(buildOpenApiDoc()));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(undefined, { swaggerOptions: { url: '/api/openapi.json', persistAuthorization: true }, customSiteTitle: 'MLM Portal API' }));

  // Production (optional): serve the built Frontend from the same server (MLM-Portal/Frontend/dist)
  const web = path.resolve(__dirname, '../../Frontend/dist');
  if (fs.existsSync(web)) {
    app.use(express.static(web));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(web, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
