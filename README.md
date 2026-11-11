# Navarth Wellness — Distributor Portal

A full-stack direct-selling (binary MLM) portal, organised in **two folders**:

```
MLM-Portal/
├── Backend/    Node.js REST API · Prisma · PostgreSQL · Swagger
└── Frontend/   React web app
```

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS v4, TanStack Query, React Router, Recharts |
| Backend | Node.js + TypeScript, Express 5, REST API documented with **Swagger / OpenAPI 3** |
| Data access | **Prisma 6** ORM (`@prisma/adapter-pg` driver) |
| Database | **PostgreSQL 15+** |

The architecture, data model and business rules are explained in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## 1. What you need

- **Node.js 20 or 22** (LTS) — check with `node -v`
- **PostgreSQL 15 or newer**, running locally (no Docker needed)
- A terminal (PowerShell, Terminal, or bash)

## 2. Create the database

Use pgAdmin (*Databases → Create → Database… → name `mlm`*) or the command line:

```bash
createdb -U postgres mlm
```

## 3. Set up and start the Backend

```bash
cd Backend
cp .env.example .env          # Windows: copy .env.example .env
```

Open `Backend/.env` and set **`DATABASE_URL`** to your PostgreSQL user/password, for example:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/mlm?schema=public
```

Then:

```bash
npm install                    # also builds the typed Prisma client (prisma generate)
npx prisma migrate dev              # creates all tables (applies every migration in prisma/migrations)
npm run db:extras              # optional but recommended: DB safety rules, triggers, views
npm run db:seed                # demo data (products, packages, ranks, logins, a 40-member team)
npm run dev                    # Backend API on http://localhost:4000
```

- **Swagger docs:** <http://localhost:4000/api/docs>. Log in with `POST /auth/login`, copy `accessToken`, click **Authorize**.
- Health check: <http://localhost:4000/api/v1/health>

> **No Prisma Migrate?** You can create the tables with plain SQL instead:
> `psql -U postgres -d mlm -f prisma/sql/schema.sql` then `psql -U postgres -d mlm -f prisma/sql/extras.sql`, then `npx prisma generate` and `npm run db:seed`.

## 4. Start the Frontend

In a **second** terminal, from the main folder:

```bash
cd Frontend
npm install
npm run dev                    # http://localhost:5173
```

Open **<http://localhost:5173>**. The Frontend dev server forwards `/api` calls to the Backend on port 4000.

### Database connection problems

Run **`npm run db:check`** in `Backend`. It tests the password in `.env` against PostgreSQL and tells you exactly what is wrong.

**How to set a new PostgreSQL password**
- *With pgAdmin* (it usually remembers the password): open your server → **Login/Group Roles** → right-click **postgres** → **Properties** → **Definition** → enter a new password → **Save**. Then put that password in `Backend/.env` → `DATABASE_URL`.
- *Without pgAdmin:* in `C:\Program Files\PostgreSQL\<version>\data\pg_hba.conf` (edit as Administrator) change `scram-sha-256` to `trust`. Restart the **postgresql-x64-<version>** service. Run `psql -U postgres -h localhost` and then `ALTER USER postgres WITH PASSWORD 'NewPass123';`. Change `trust` back and restart the service again.
- Special characters in `DATABASE_URL` must be encoded: `@` → `%40`, `#` → `%23`, `%` → `%25`.

## 5. Demo logins

The login page has these as one-click buttons.

| Who | User ID | Password | What to try |
|---|---|---|---|
| **Distributor** (Ramesh Kumar) | `NW100001` | `Demo@123` | Dashboard, genealogy tree, income, wallet & withdraw, shop, KYC |
| **New member** (not activated) | `9123456789` (mobile) | `Demo@123` | Activate with a 40 BV / 100 BV package (demo payment) |
| **Super Admin** | `admin@navarth.demo` | `Admin@123` + **OTP** | Everything, incl. staff users, plan settings and **Autopool**. The OTP goes by SMS to `SUPER_ADMIN_OTP_MOBILE`; in development (`SMS_PROVIDER=console`) it is shown on screen and in the Backend terminal |
| **Franchise** (Sunita Devi, FR0001) | `NW100002` | `Demo@123` | Franchise panel: new sale at the counter, stock, sales, commission — plus her own distributor area |
| **Finance** | `finance@navarth.demo` | `Finance@123` | Approve & post closings, process withdrawals |
| **Operations** | `ops@navarth.demo` | `Ops@123` | Distributors, KYC, orders, returns |
| **Support** | `support@navarth.demo` | `Support@123` | Support tickets |
| **Compliance** | `compliance@navarth.demo` | `Compliance@123` | KYC, reports, audit log |
| Company root ID | `NW100000` | `Demo@123` | Top of the binary tree |

Distributors can log in with their **Distributor ID, mobile number or email**.

### A 5-minute demo script

1. Log in as the **new member** (mobile `9123456789`), go to **Activate / Upgrade**, buy the 100 BV package and click **Pay (demo)**. The ID becomes active and its BV flows up the tree.
2. Log in as **admin**, open **Closings** and click **Run today's closing**. You get a preview with the payout total and payout % of sales; nothing is paid yet.
3. Try **Approve** as admin. It is refused (maker-checker).
4. Log in as **finance**, open the closing, click **Approve**, then **Post & credit wallets**.
5. Log in as **NW100001**: the wallet is credited, the *Star* rank is awarded and **Income** shows the full calculation for each line.
6. As NW100001, request a **withdrawal**. As finance: **Approve → Bank file → Mark paid** with a UTR.

## Deploy on Render

**Option A: Blueprint (easiest).** Push the repo to GitHub. In Render, choose **New → Blueprint**, pick the repo, and Render reads `render.yaml`. It creates a PostgreSQL database and one web service that serves the API and the React app on the same URL, so login cookies work without extra settings.

**Option B: your existing Render web service.** In *Settings*, set:

| Setting | Value |
|---|---|
| Root Directory | *(empty — the repo root)* |
| Build Command | `cd Frontend && npm install --include=dev && npm run build && cd ../Backend && npm install --include=dev && npm run build` |
| Start Command | `cd Backend && npm run start:prod` |
| Health Check Path | `/api/v1/health` |

Environment variables: `NODE_VERSION=22`, `NODE_ENV=production`, `DATABASE_URL` (use the **Internal Database URL** of your Render PostgreSQL), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_SECRET` (long random strings), `WEB_ORIGIN=https://<your-service>.onrender.com`, and `SEED_DEMO_DATA=true` to load the demo logins on first start (set it to `false` afterwards).

Notes:
- `--include=dev` is required. Render sets `NODE_ENV=production`, which would otherwise skip TypeScript and the Prisma CLI that the build needs.
- `npm run start:prod` creates or updates the tables before the server starts. It uses `prisma migrate deploy` when `Backend/prisma/migrations` is committed, and `prisma db push` otherwise.
- Render's disk is temporary: uploaded KYC files are lost on every deploy. Attach a Render Disk mounted at `Backend/uploads`, or move uploads to S3, before real use.

## New in November 2026

### Autopool (Super Admin → Finance → **Autopool**)
- One company-wide **4 × 4 matrix**, levels 1–9, filled in joining order ("non-working": placement does not depend on the sponsor). Position *p* has its children at 4(p−1)+2 … 4(p−1)+5, so level progress is plain arithmetic — fast at any size (`Backend/src/engine/autopool.ts`).
- Plan from the "आटोपुल नॉनवर्किंग 1 से 9 तक" sheet: team 4, 16 … 2,62,144; income ₹400 … ₹2,62,14,400; repurchase condition 20 BV … 5,120 BV on the member's own ID. All numbers are editable in **Settings** (saved as a new plan-settings version).
- Repurchase rule: **CUMULATIVE** (default — every level needs its own repurchase, so level 3 needs 20+40+80 BV) or **THRESHOLD** (total repurchase BV ≥ the level figure).
- Income is paid **only through the normal closing** (run → approve by a second person → post) as an `AUTOPOOL` income line, so maker-checker, wallet ledger, income reports and TDS all apply. A level can never be paid twice (unique `(entryId, level)`).
- New activations take the next position automatically; **Add active IDs** places existing members (oldest activation first). Screens: level table, positions list, matrix view, position detail. Distributors see their own progress under **Earnings → Autopool**.
- The feature is **OFF** by default — see the legal note below.

### Franchise (Admin → Franchise → **Franchises**)
- Give a franchise to an **existing distributor** (their login gets a Franchise panel and keeps the member area) or to a **new partner** (a franchise-only login).
- **Allot** company stock to the franchise / **take it back**; every movement is in a stock ledger.
- The partner logs in and bills distributors at the counter (**New sale**: repurchase, joining package or upgrade; cash / UPI / card). Stock comes out of the franchise stock, the buyer gets the BV, a GST invoice is generated, and a joining sale activates the ID.
- **Commission** (% per franchise) on the taxable value of every sale; Finance marks it paid with a UTR. Returns put the stock back to the franchise and cancel unpaid commission.
- Suspend (no new sales) / close / re-activate a franchise. Roles: Super Admin & Operations manage; Finance pays commission.

### Super Admin login OTP
- After the correct password, a Super Admin must enter a **6-digit OTP sent by SMS** to `SUPER_ADMIN_OTP_MOBILE` (set to **+917250227201**). 5-minute expiry, 5 wrong tries per OTP, resend after 30 s, max 6 OTPs per 15 min, single use, every step in the audit log.
- SMS providers: `console` (development), `fast2sms`, `msg91`, `twilio` — see `Backend/.env.example`. Other staff roles and distributors log in as before.

### Upgrading an existing database
- Prisma Migrate (Render does this automatically): `npx prisma migrate deploy`
- Plain SQL: `psql -d mlm -f prisma/sql/update-2026-11-autopool-franchise-otp.sql`

## 6. Screens included

**Public:** Login (logo + plan slides carousel, demo logins, Hindi/English) · Register (sponsor lookup, left/right placement) · Forgot password

**Distributor (13):** Dashboard · Activate/Upgrade · Shop & cart · My orders (+ GST invoice, return request) · Genealogy tree · My team (directs / left / right) · Income (with calculation) · Wallet & withdrawals · Ranks & rewards · KYC upload · Profile (details, bank, nominee, password) · Support tickets · Business plan

**Admin (19):** Dashboard · **Distributor Income** (Super Admin: income of every distributor, filters, calculation per line, CSV) · Distributors (+ detail, block, wallet hold, special-bonus verify, **reset / generate password** — Super Admin) · Genealogy viewer · KYC review · **Staff user management** · Orders & dispatch · Returns/buy-back · Products (+ versioned prices) · Packages (bundle editor; **price optional** — empty = total DP of the products) · Closings (run → preview → approve → post) · Withdrawals (+ bank CSV) · Ranks & rewards · Reports (CSV) · Plan settings (versioned) · Support tickets · Audit log

## 7. Useful commands

| Command (in `Backend`) | What it does |
|---|---|
| `npm run dev` | API with auto-reload |
| `npm test` | Unit tests for the pair-matching engine |
| `npm run db:seed` | Load demo data (only into an empty database) |
| `npm run db:reset` | **Deletes everything**, recreates the tables, reseeds |
| `npx prisma studio` | Browse the database in the browser |
| `npm run build && npm start` | Production build of the API |

**Production:** run `npm run build` in the main folder (builds Backend and Frontend). Then `npm start` serves the API **and** the built Frontend from one Node process on port 4000. To host the Frontend separately, see `Frontend/README.md`. Put it behind HTTPS (nginx / a cloud load balancer) and set `NODE_ENV=production` and strong secrets in `.env`.

## 8. Before going live: must-do list

- [ ] **Set up the SMS gateway for the Super Admin OTP** (`SMS_PROVIDER`, `SMS_API_KEY`, template id in `Backend/.env`). Until then the OTP only appears in the server log. Indian SMS needs a DLT-registered sender ID and template.
- [ ] Switch **Autopool** on (Admin → Autopool → Settings) only after the legal review below, and confirm the repurchase rule (each level separately vs. total BV).

- [ ] Replace the **demo payment button** with a real gateway (Razorpay / PayU / Cashfree) and its webhook → `markOrderPaid()` in `Backend/src/services/orders.ts`.
- [ ] Use the same SMS gateway for **password reset** (`/auth/forgot-password` currently only logs the request).
- [ ] Change every demo password, and set long random `JWT_*` and `ENCRYPTION_SECRET` values.
- [ ] Fill in the company **GSTIN, address, HSN codes and GST rates** (invoice template: `Backend/src/services/invoice.ts`).
- [ ] Confirm the open business rules with the company: rank 1–7 thresholds, TDS %, cooling-off days, and whether pairs over the cap are flushed or carried.
- [ ] Get a **legal review** of the plan under the Consumer Protection (Direct Selling) Rules, 2021. Autopool and "₹7,500 after 2 directs" are switched **off** in Plan Settings.
- [ ] Move KYC files to a private S3 bucket, take daily database backups, and run a security test (VAPT).

## 9. Project layout

```
MLM-Portal/
├── Backend/                      Node.js REST API  (see Backend/README.md)
│   ├── .env.example
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma         data model (29 tables)
│   │   ├── seed.ts               demo data
│   │   └── sql/                  schema.sql (plain SQL) · extras.sql (triggers, checks, views)
│   ├── uploads/                  KYC files
│   └── src/
│       ├── app.ts · server.ts
│       ├── config/  lib/         env, auth/roles, Swagger helper, errors, crypto, audit, settings
│       ├── engine/               pair rules (+ tests) · BV propagation · closing
│       ├── services/             members · orders · wallet · invoice
│       └── modules/              REST endpoints (member + admin)
│
├── Frontend/                     React web app  (see Frontend/README.md)
│   ├── .env.example
│   ├── package.json · vite.config.ts · index.html
│   ├── public/brand/             logo + plan slides + price list
│   └── src/
│       ├── api/ · auth/ · i18n/ · lib/
│       ├── components/           UI kit, layout, binary tree
│       └── pages/                auth/ · member/ · admin/
│
├── docs/
│   ├── ARCHITECTURE.md           solution architecture, data model, flows
│   └── screenshots/
├── package.json                  helper scripts for both folders
└── README.md                     this file
```

**Helper scripts (run in the main folder):** `npm run install:all` · `npm run db:setup` · `npm run dev:backend` · `npm run dev:frontend` · `npm run build` · `npm start`
