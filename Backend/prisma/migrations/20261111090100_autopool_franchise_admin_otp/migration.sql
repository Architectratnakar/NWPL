-- Autopool (4 x 4 matrix), Franchise module, Super Admin login OTP
--
-- Written to be SAFE TO RE-RUN: every statement checks first whether the object already
-- exists. Some databases already had part of these objects (created earlier by
-- `prisma db push`, by prisma/sql/update-2026-11-autopool-franchise-otp.sql, or by a
-- half-finished deploy), which made the plain CREATE statements fail with
-- "type FranchiseStatus already exists" (P3018).

-- ---------- Enums ----------
DO $$ BEGIN
  CREATE TYPE "FranchiseStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "FranchiseStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "FranchiseStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "FranchiseStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

DO $$ BEGIN
  CREATE TYPE "FranchiseStockTxnType" AS ENUM ('ALLOT', 'TAKE_BACK', 'SALE', 'RETURN', 'ADJUST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "FranchiseStockTxnType" ADD VALUE IF NOT EXISTS 'ALLOT';
ALTER TYPE "FranchiseStockTxnType" ADD VALUE IF NOT EXISTS 'TAKE_BACK';
ALTER TYPE "FranchiseStockTxnType" ADD VALUE IF NOT EXISTS 'SALE';
ALTER TYPE "FranchiseStockTxnType" ADD VALUE IF NOT EXISTS 'RETURN';
ALTER TYPE "FranchiseStockTxnType" ADD VALUE IF NOT EXISTS 'ADJUST';

DO $$ BEGIN
  CREATE TYPE "FranchiseCommissionStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "FranchiseCommissionStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "FranchiseCommissionStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "FranchiseCommissionStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ---------- Columns on existing tables ----------
ALTER TABLE "OtpCode" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "franchiseId" TEXT;

-- ---------- Tables ----------
CREATE TABLE IF NOT EXISTS "AutopoolEntry" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "memberId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ACTIVATION',
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutopoolEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutopoolPayout" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "closingLineId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutopoolPayout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Franchise" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MINI',
    "userId" TEXT NOT NULL,
    "ownerMemberId" TEXT,
    "ownerName" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "gstin" TEXT,
    "address" JSONB,
    "territory" TEXT,
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "securityDeposit" DECIMAL(12,2),
    "agreementStart" TIMESTAMP(3),
    "agreementEnd" TIMESTAMP(3),
    "status" "FranchiseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Franchise_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FranchiseStock" (
    "franchiseId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FranchiseStock_pkey" PRIMARY KEY ("franchiseId","productId")
);

CREATE TABLE IF NOT EXISTS "FranchiseStockTxn" (
    "id" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "type" "FranchiseStockTxnType" NOT NULL,
    "qty" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "refId" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FranchiseStockTxn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FranchiseCommission" (
    "id" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "saleAmount" DECIMAL(12,2) NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "FranchiseCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "utr" TEXT,
    "paidBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FranchiseCommission_pkey" PRIMARY KEY ("id")
);

-- ---------- Indexes ----------
CREATE INDEX IF NOT EXISTS "OtpCode_userId_createdAt_idx" ON "OtpCode"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_franchiseId_createdAt_idx" ON "Order"("franchiseId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AutopoolEntry_position_key" ON "AutopoolEntry"("position");
CREATE UNIQUE INDEX IF NOT EXISTS "AutopoolEntry_memberId_key" ON "AutopoolEntry"("memberId");
CREATE UNIQUE INDEX IF NOT EXISTS "AutopoolPayout_closingLineId_key" ON "AutopoolPayout"("closingLineId");
CREATE INDEX IF NOT EXISTS "AutopoolPayout_memberId_idx" ON "AutopoolPayout"("memberId");
CREATE UNIQUE INDEX IF NOT EXISTS "AutopoolPayout_entryId_level_key" ON "AutopoolPayout"("entryId", "level");
CREATE UNIQUE INDEX IF NOT EXISTS "Franchise_code_key" ON "Franchise"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Franchise_userId_key" ON "Franchise"("userId");
CREATE INDEX IF NOT EXISTS "Franchise_status_idx" ON "Franchise"("status");
CREATE INDEX IF NOT EXISTS "FranchiseStockTxn_franchiseId_createdAt_idx" ON "FranchiseStockTxn"("franchiseId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "FranchiseCommission_orderId_key" ON "FranchiseCommission"("orderId");
CREATE INDEX IF NOT EXISTS "FranchiseCommission_franchiseId_status_idx" ON "FranchiseCommission"("franchiseId", "status");

-- ---------- Foreign keys (skipped when a constraint with the same name exists) ----------
DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AutopoolEntry" ADD CONSTRAINT "AutopoolEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AutopoolPayout" ADD CONSTRAINT "AutopoolPayout_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AutopoolEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Franchise" ADD CONSTRAINT "Franchise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Franchise" ADD CONSTRAINT "Franchise_ownerMemberId_fkey" FOREIGN KEY ("ownerMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FranchiseStock" ADD CONSTRAINT "FranchiseStock_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FranchiseStock" ADD CONSTRAINT "FranchiseStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FranchiseStockTxn" ADD CONSTRAINT "FranchiseStockTxn_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FranchiseStockTxn" ADD CONSTRAINT "FranchiseStockTxn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FranchiseCommission" ADD CONSTRAINT "FranchiseCommission_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FranchiseCommission" ADD CONSTRAINT "FranchiseCommission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
