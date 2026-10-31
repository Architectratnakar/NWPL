# Backend — MLM Portal REST API

Node.js + TypeScript · Express 5 · Prisma 6 · PostgreSQL · Swagger (OpenAPI 3)

## Run

```bash
cp .env.example .env              # Windows: copy .env.example .env  → then set DATABASE_URL
npm install                       # also runs `prisma generate` automatically
npx prisma migrate dev --name init   # creates the 29 tables
npm run db:extras                 # optional: DB safety rules, triggers, views
npm run db:seed                   # demo data and demo logins
npm run dev                       # http://localhost:4000
```

- Swagger UI: <http://localhost:4000/api/docs>
- Health: <http://localhost:4000/api/v1/health>
- Without Prisma Migrate: `psql -d mlm -f prisma/sql/schema.sql` and `psql -d mlm -f prisma/sql/extras.sql`, then `npx prisma generate` and `npm run db:seed`.

## Folder layout

```
Backend/
├── .env.example          settings (database, secrets, CORS, cookies)
├── prisma/
│   ├── schema.prisma     data model (29 tables)
│   ├── seed.ts           demo data
│   └── sql/              schema.sql (plain SQL tables) · extras.sql (triggers, checks, views)
├── uploads/              KYC files (use a private S3 bucket in production)
└── src/
    ├── server.ts         starts the HTTP server + BV worker
    ├── app.ts            middleware, routes, Swagger
    ├── config/env.ts     validated environment variables
    ├── lib/              auth (JWT, roles) · openapi (route + Swagger helper) · http errors · crypto · audit · settings · counters
    ├── engine/           pair.ts (+ tests) · bv.ts (BV propagation) · closing.ts (run / approve / post)
    ├── services/         members (registration, placement, tree) · orders · wallet · invoice
    └── modules/          REST endpoints
        ├── auth.ts  public.ts  me.ts  genealogy.ts  kyc.ts  catalog.ts  orders.ts  finance.ts  tickets.ts
        └── admin/   core.ts (dashboard, users, members, kyc, audit) · commerce.ts (products, packages, ranks, orders, returns) · money.ts (closings, withdrawals, settings, reports, tickets)
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start with auto-reload |
| `npm test` | Pair-matching unit tests |
| `npm run db:seed` | Demo data (empty database only) |
| `npm run db:reset` | **Delete everything**, recreate, reseed |
| `npx prisma studio` | Browse data |
| `npm run build` → `npm start` | Production |
