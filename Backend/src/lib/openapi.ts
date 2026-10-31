import { Router, type Request, type Response, type RequestHandler } from 'express';
import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z, type ZodTypeAny } from 'zod';
import type { Role } from '@prisma/client';
import { requireRoles, type AuthUser } from './auth';
import { AppError } from './http';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();
registry.registerComponent('securitySchemes', 'bearerAuth', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });

const Envelope = z.object({ data: z.any() }).openapi('Envelope');
const ErrorBody = z
  .object({ error: z.object({ code: z.string(), message: z.string(), details: z.any().optional() }) })
  .openapi('Error');

export function buildOpenApiDoc() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'MLM Portal API',
      version: '1.0.0',
      description:
        'REST API for the direct-selling portal. Log in with **POST /auth/login**, copy `accessToken`, click **Authorize** and paste it.\n\nAll successful responses are wrapped as `{ "data": ... }`. Errors are `{ "error": { code, message } }`.',
    },
    servers: [{ url: '/api/v1' }],
  });
}

export interface Ctx<B, Q> {
  req: Request;
  res: Response;
  user: AuthUser;
  body: B;
  query: Q;
  params: Record<string, string>;
}

type Access = 'public' | 'any' | Role[];

interface RouteDef<B extends ZodTypeAny, Q extends ZodTypeAny> {
  summary: string;
  access?: Access;
  body?: B;
  query?: Q;
  /** extra middleware (e.g. multer for uploads) */
  use?: RequestHandler[];
  multipart?: Record<string, ZodTypeAny>;
  raw?: boolean; // handler writes the response itself (CSV / HTML / files)
  handler: (ctx: Ctx<z.infer<B>, z.infer<Q>>) => Promise<unknown> | unknown;
}

/**
 * A module = one Express router + automatic Swagger docs.
 * Every route is validated with zod and documented from the same schema.
 */
export function createModule(base: string, tag: string) {
  const router = Router();
  const add =
    (method: 'get' | 'post' | 'put' | 'patch' | 'delete') =>
    <B extends ZodTypeAny = z.ZodUndefined, Q extends ZodTypeAny = z.ZodUndefined>(path: string, def: RouteDef<B, Q>) => {
      const access = def.access ?? 'any';
      const fullPath = (base + path).replace(/\/$/, '') || '/';
      const paramNames = [...fullPath.matchAll(/:(\w+)/g)].map((m) => m[1]);

      registry.registerPath({
        method,
        path: fullPath.replace(/:(\w+)/g, '{$1}'),
        tags: [tag],
        summary: def.summary,
        security: access === 'public' ? [] : [{ bearerAuth: [] }],
        description: access === 'public' ? 'Public' : access === 'any' ? 'Any logged-in user' : `Roles: ${access.join(', ')}`,
        request: {
          params: paramNames.length ? z.object(Object.fromEntries(paramNames.map((n) => [n, z.string()]))) : undefined,
          query: def.query instanceof z.ZodObject ? def.query : undefined,
          body: def.body
            ? { content: { 'application/json': { schema: def.body } } }
            : def.multipart
              ? { content: { 'multipart/form-data': { schema: z.object(def.multipart) } } }
              : undefined,
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: Envelope } } },
          400: { description: 'Validation error', content: { 'application/json': { schema: ErrorBody } } },
          ...(access === 'public' ? {} : { 401: { description: 'Not logged in' }, 403: { description: 'Not allowed' } }),
        },
      });

      const guards: RequestHandler[] = access === 'public' ? [] : [requireRoles(access)];
      router[method](path, ...guards, ...(def.use ?? []), async (req: Request, res: Response) => {
        const body = def.body ? def.body.parse(req.body ?? {}) : req.body;
        const query = def.query ? def.query.parse(req.query) : req.query;
        const result = await def.handler({
          req,
          res,
          user: req.user as AuthUser,
          body,
          query,
          params: req.params as Record<string, string>,
        });
        if (def.raw || res.headersSent) return;
        res.json({ data: result ?? null });
      });
    };
  return { base, router, get: add('get'), post: add('post'), put: add('put'), patch: add('patch'), delete: add('delete') };
}

// Common query schemas
export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});
export const memberOnly = (u: AuthUser) => {
  if (!u.memberId) throw new AppError(403, 'FORBIDDEN', 'This feature is for distributors only');
  return u.memberId;
};
