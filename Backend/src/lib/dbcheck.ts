import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { env } from '../config/env';

/** Explain database setup problems in plain words, with the command that fixes them. */
export function explainDbError(err: unknown): { code: string; message: string; fix: string } | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError || err instanceof Prisma.PrismaClientInitializationError)) return null;
  const code = normalise(err);
  const where = safeUrl();
  switch (code) {
    case 'P1000':
      return { code: 'DB_LOGIN_FAILED', message: `PostgreSQL rejected the user name / password in DATABASE_URL (${where}).`, fix: 'Put the correct PostgreSQL password in Backend/.env → DATABASE_URL, then restart the Backend.' };
    case 'P1001':
      return { code: 'DB_NOT_REACHABLE', message: `Cannot reach PostgreSQL at ${where}.`, fix: 'Start the PostgreSQL service (Windows: services.msc → postgresql-x64-NN → Start) and check the port in DATABASE_URL (usually 5432).' };
    case 'P1003':
      return { code: 'DB_NOT_FOUND', message: `The database in DATABASE_URL does not exist (${where}).`, fix: 'Create it in pgAdmin (Databases → Create → Database) or run: createdb -U postgres mlm' };
    case 'P2021':
      return { code: 'DB_TABLES_MISSING', message: `The database tables have not been created yet (${(err as Prisma.PrismaClientKnownRequestError).meta?.modelName ?? 'table'} is missing).`, fix: 'In the Backend folder run: npx prisma migrate dev --name init   then   npm run db:seed' };
    case 'P2022':
      return { code: 'DB_SCHEMA_OUTDATED', message: 'The database tables are older than the code (a column is missing).', fix: 'In the Backend folder run: npx prisma migrate dev' };
    default:
      return null;
  }
}

/** Map driver-adapter kinds, Postgres SQLSTATEs and raw-query (P2010) messages onto one Prisma code. */
function normalise(err: unknown): string {
  const e = err as { code?: string; errorCode?: string; message?: string; meta?: { driverAdapterError?: { cause?: { kind?: string; originalCode?: string } } } };
  const kind = e.meta?.driverAdapterError?.cause?.kind;
  const byKind: Record<string, string> = { AuthenticationFailed: 'P1000', DatabaseNotReachable: 'P1001', DatabaseDoesNotExist: 'P1003', TableDoesNotExist: 'P2021', ColumnNotFound: 'P2022' };
  if (kind && byKind[kind]) return byKind[kind];
  const code = e.code ?? e.errorCode ?? '';
  if (code !== 'P2010' && code) return code;
  const m = e.message ?? '';
  if (/28P01|password authentication failed|Authentication failed/i.test(m)) return 'P1000';
  if (/Can't reach database|ECONNREFUSED|DatabaseNotReachable/i.test(m)) return 'P1001';
  if (/3D000|database .* does not exist/i.test(m)) return 'P1003';
  if (/42P01|relation .* does not exist|table .* does not exist/i.test(m)) return 'P2021';
  return code;
}

function safeUrl() {
  try {
    const u = new URL(env.DATABASE_URL);
    return `${u.username}@${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return 'DATABASE_URL';
  }
}

/** Run once at start-up and print a clear status in the terminal. */
export async function checkDatabase(): Promise<{ ok: boolean; status: string; fix?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    const x = explainDbError(e);
    return { ok: false, status: x?.message ?? `Database connection failed: ${(e as Error).message}`, fix: x?.fix };
  }
  try {
    const users = await prisma.user.count();
    if (users === 0) return { ok: true, status: `Connected to ${safeUrl()} — tables exist but there is no data yet.`, fix: 'Run: npm run db:seed   (creates the demo logins)' };
    return { ok: true, status: `Connected to ${safeUrl()} — ${users} logins found.` };
  } catch (e) {
    const x = explainDbError(e);
    return { ok: false, status: x?.message ?? (e as Error).message, fix: x?.fix };
  }
}
