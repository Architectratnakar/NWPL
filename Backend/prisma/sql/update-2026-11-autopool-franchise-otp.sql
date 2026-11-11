-- Run once on an EXISTING database if you do not use Prisma Migrate
-- (with Prisma Migrate run instead:  npx prisma migrate deploy)
BEGIN;
-- Autopool (4 x 4 matrix), Franchise module, Super Admin login OTP

-- CreateEnum
CREATE TYPE "FranchiseStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FranchiseStockTxnType" AS ENUM ('ALLOT', 'TAKE_BACK', 'SALE', 'RETURN', 'ADJUST');

-- CreateEnum
CREATE TYPE "FranchiseCommissionStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "OtpCode" ADD COLUMN "userId" TEXT;

-- CreateTable
CREATE TABLE "AutopoolEntry" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "memberId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ACTIVATION',
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutopoolEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutopoolPayout" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "closingLineId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutopoolPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Franchise" (
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

-- CreateTable
CREATE TABLE "FranchiseStock" (
    "franchiseId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FranchiseStock_pkey" PRIMARY KEY ("franchiseId","productId")
);

-- CreateTable
CREATE TABLE "FranchiseStockTxn" (
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

-- CreateTable
CREATE TABLE "FranchiseCommission" (
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

-- CreateIndex
CREATE INDEX "OtpCode_userId_createdAt_idx" ON "OtpCode"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_franchiseId_createdAt_idx" ON "Order"("franchiseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutopoolEntry_position_key" ON "AutopoolEntry"("position");

-- CreateIndex
CREATE UNIQUE INDEX "AutopoolEntry_memberId_key" ON "AutopoolEntry"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "AutopoolPayout_closingLineId_key" ON "AutopoolPayout"("closingLineId");

-- CreateIndex
CREATE INDEX "AutopoolPayout_memberId_idx" ON "AutopoolPayout"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "AutopoolPayout_entryId_level_key" ON "AutopoolPayout"("entryId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "Franchise_code_key" ON "Franchise"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Franchise_userId_key" ON "Franchise"("userId");

-- CreateIndex
CREATE INDEX "Franchise_status_idx" ON "Franchise"("status");

-- CreateIndex
CREATE INDEX "FranchiseStockTxn_franchiseId_createdAt_idx" ON "FranchiseStockTxn"("franchiseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FranchiseCommission_orderId_key" ON "FranchiseCommission"("orderId");

-- CreateIndex
CREATE INDEX "FranchiseCommission_franchiseId_status_idx" ON "FranchiseCommission"("franchiseId", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutopoolEntry" ADD CONSTRAINT "AutopoolEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutopoolPayout" ADD CONSTRAINT "AutopoolPayout_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AutopoolEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Franchise" ADD CONSTRAINT "Franchise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Franchise" ADD CONSTRAINT "Franchise_ownerMemberId_fkey" FOREIGN KEY ("ownerMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseStock" ADD CONSTRAINT "FranchiseStock_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseStock" ADD CONSTRAINT "FranchiseStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseStockTxn" ADD CONSTRAINT "FranchiseStockTxn_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseStockTxn" ADD CONSTRAINT "FranchiseStockTxn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseCommission" ADD CONSTRAINT "FranchiseCommission_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseCommission" ADD CONSTRAINT "FranchiseCommission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
