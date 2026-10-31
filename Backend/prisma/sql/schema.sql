-- =====================================================================
--  MLM PORTAL — PostgreSQL DATABASE SCHEMA
--  Full table script (same as `prisma migrate dev` would create)
--  Target      : PostgreSQL 15+
--  Matches     : prisma/schema.prisma (same table, column, enum and
--                constraint names Prisma would generate)
--
--  How to run:
--    createdb mlm
--    psql -d mlm -f 01_schema.sql
--    psql -d mlm -f 02_functions.sql
--    psql -d mlm -f 03_seed.sql
--
--  If you use Prisma Migrate instead, skip this file:
--    npx prisma migrate dev --name init     (creates the same tables)
--    psql -d mlm -f 02_functions.sql
--    psql -d mlm -f 03_seed.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
CREATE TYPE "Role"             AS ENUM ('MEMBER', 'FRANCHISE', 'ADMIN_SUPER', 'ADMIN_OPS', 'ADMIN_FINANCE', 'COMPLIANCE', 'SUPPORT');
CREATE TYPE "Side"             AS ENUM ('LEFT', 'RIGHT');
CREATE TYPE "MemberStatus"     AS ENUM ('REGISTERED', 'ACTIVE', 'BLOCKED', 'TERMINATED');
CREATE TYPE "PackageTier"      AS ENUM ('NONE', 'BASIC', 'FULL');          -- NONE = inactive, BASIC = 40 BV, FULL = 100 BV
CREATE TYPE "KycStatus"        AS ENUM ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "KycDocType"       AS ENUM ('PAN', 'AADHAAR', 'PHOTO', 'BANK_PROOF', 'DISABILITY_CERT', 'OTHER');
CREATE TYPE "OrderType"        AS ENUM ('JOINING', 'UPGRADE', 'REPURCHASE', 'RETAIL');
CREATE TYPE "OrderStatus"      AS ENUM ('PENDING_PAYMENT', 'PAID', 'INVOICED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED');
CREATE TYPE "PaymentStatus"    AS ENUM ('CREATED', 'SUCCESS', 'FAILED', 'REFUNDED');
CREATE TYPE "ClosingStatus"    AS ENUM ('DRAFT', 'PREVIEWED', 'APPROVED', 'POSTED', 'FAILED');
CREATE TYPE "IncomeType"       AS ENUM ('PAIR_MATCHING', 'RANK_BONUS', 'SPECIAL_BONUS', 'RETAIL_PROFIT', 'LEADERSHIP', 'ROYALTY', 'LEVEL_REWARD', 'AUTOPOOL', 'ADJUSTMENT');
CREATE TYPE "WalletTxnType"    AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED');
CREATE TYPE "TicketStatus"     AS ENUM ('OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED');
CREATE TYPE "ReturnStatus"     AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED');
CREATE TYPE "PendingActionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- ---------------------------------------------------------------------
-- USERS & AUTH
-- ---------------------------------------------------------------------
CREATE TABLE "User" (
    "id"           TEXT         NOT NULL,
    "mobile"       TEXT         NOT NULL,
    "email"        TEXT,
    "passwordHash" TEXT         NOT NULL,
    "role"         "Role"       NOT NULL DEFAULT 'MEMBER',
    "isActive"     BOOLEAN      NOT NULL DEFAULT true,
    "totpSecretEnc" TEXT,                                   -- 2FA for admins (encrypted)
    "lastLoginAt"  TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_mobile_key" ON "User"("mobile");
CREATE UNIQUE INDEX "User_email_key"  ON "User"("email");

CREATE TABLE "RefreshToken" (
    "id"        TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "tokenHash" TEXT         NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

CREATE TABLE "OtpCode" (
    "id"        TEXT         NOT NULL,
    "mobile"    TEXT         NOT NULL,
    "purpose"   TEXT         NOT NULL,                       -- REGISTER | LOGIN | RESET | BANK_CHANGE | WITHDRAWAL
    "codeHash"  TEXT         NOT NULL,
    "attempts"  INTEGER      NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OtpCode_mobile_purpose_idx" ON "OtpCode"("mobile", "purpose");

-- ---------------------------------------------------------------------
-- MEMBERS & BINARY TREE
-- ---------------------------------------------------------------------
CREATE TABLE "Rank" (
    "id"          INTEGER       NOT NULL,                    -- 1..17
    "name"        TEXT          NOT NULL,
    "nameHi"      TEXT,
    "thresholdBv" DECIMAL(16,2) NOT NULL,                    -- required on EACH leg
    "bonusAmount" DECIMAL(16,2) NOT NULL,
    "reward"      TEXT,
    "confirmed"   BOOLEAN       NOT NULL DEFAULT false,      -- false = placeholder value, awaiting company sign-off
    CONSTRAINT "Rank_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Rank_name_key" ON "Rank"("name");

CREATE TABLE "Member" (
    "id"                   TEXT           NOT NULL,
    "distributorCode"      TEXT           NOT NULL,          -- NW100001
    "userId"               TEXT           NOT NULL,
    "fullName"             TEXT           NOT NULL,
    "gender"               TEXT,
    "dob"                  TIMESTAMP(3),
    "address"              JSONB,
    "sponsorId"            TEXT,                              -- who referred (direct)
    "parentId"             TEXT,                              -- placement parent in binary tree
    "side"                 "Side",                            -- LEFT / RIGHT under parent
    "level"                INTEGER        NOT NULL DEFAULT 0,
    "status"               "MemberStatus" NOT NULL DEFAULT 'REGISTERED',
    "packageTier"          "PackageTier"  NOT NULL DEFAULT 'NONE',
    "activatedAt"          TIMESTAMP(3),
    "upgradedAt"           TIMESTAMP(3),
    "kycStatus"            "KycStatus"    NOT NULL DEFAULT 'NOT_SUBMITTED',
    "specialBonusVerified" BOOLEAN        NOT NULL DEFAULT false,   -- women / divyang, verified by admin
    "currentRankId"        INTEGER,
    "agreementVersion"     TEXT,
    "agreementAcceptedAt"  TIMESTAMP(3),
    "createdAt"            TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3)   NOT NULL,
    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Member_distributorCode_key" ON "Member"("distributorCode");
CREATE UNIQUE INDEX "Member_userId_key"          ON "Member"("userId");
CREATE UNIQUE INDEX "Member_parentId_side_key"   ON "Member"("parentId", "side");   -- one member per slot
CREATE INDEX "Member_sponsorId_idx"              ON "Member"("sponsorId");

CREATE TABLE "NodeVolume" (
    "memberId"        TEXT          NOT NULL,
    "totalLeftBv"     DECIMAL(14,2) NOT NULL DEFAULT 0,      -- lifetime BV (ranks)
    "totalRightBv"    DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalLeftCount"  INTEGER       NOT NULL DEFAULT 0,      -- activated IDs in leg
    "totalRightCount" INTEGER       NOT NULL DEFAULT 0,
    "carryLeftFull"   INTEGER       NOT NULL DEFAULT 0,      -- unmatched pair units by tier
    "carryLeftBasic"  INTEGER       NOT NULL DEFAULT 0,
    "carryRightFull"  INTEGER       NOT NULL DEFAULT 0,
    "carryRightBasic" INTEGER       NOT NULL DEFAULT 0,
    "pairsToday"      INTEGER       NOT NULL DEFAULT 0,      -- cap counters
    "pairsThisWeek"   INTEGER       NOT NULL DEFAULT 0,
    "pairsThisMonth"  INTEGER       NOT NULL DEFAULT 0,
    "capDay"          TIMESTAMP(3),
    "updatedAt"       TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "NodeVolume_pkey" PRIMARY KEY ("memberId")
);

CREATE TABLE "BankAccount" (
    "memberId"     TEXT         NOT NULL,
    "holderName"   TEXT         NOT NULL,
    "accountNoEnc" TEXT         NOT NULL,                    -- AES-256-GCM, encrypted by the API
    "accountLast4" TEXT         NOT NULL,
    "ifsc"         TEXT         NOT NULL,
    "bankName"     TEXT,
    "verified"     BOOLEAN      NOT NULL DEFAULT false,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("memberId")
);

CREATE TABLE "Nominee" (
    "memberId" TEXT NOT NULL,
    "name"     TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "dob"      TIMESTAMP(3),
    CONSTRAINT "Nominee_pkey" PRIMARY KEY ("memberId")
);

CREATE TABLE "KycDocument" (
    "id"         TEXT         NOT NULL,
    "memberId"   TEXT         NOT NULL,
    "type"       "KycDocType" NOT NULL,
    "numberEnc"  TEXT,
    "fileKey"    TEXT         NOT NULL,                      -- S3 object key (private bucket)
    "status"     "KycStatus"  NOT NULL DEFAULT 'PENDING',
    "remarks"    TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KycDocument_memberId_idx" ON "KycDocument"("memberId");
CREATE INDEX "KycDocument_status_idx"   ON "KycDocument"("status");

-- ---------------------------------------------------------------------
-- CATALOGUE
-- ---------------------------------------------------------------------
CREATE TABLE "Product" (
    "id"          SERIAL       NOT NULL,
    "sku"         TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "category"    TEXT,
    "hsnCode"     TEXT,
    "gstRate"     DECIMAL(5,2) NOT NULL DEFAULT 18,
    "description" TEXT,
    "imageUrl"    TEXT,
    "isActive"    BOOLEAN      NOT NULL DEFAULT true,
    "stock"       INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

CREATE TABLE "ProductPrice" (                                -- versioned prices
    "id"            SERIAL        NOT NULL,
    "productId"     INTEGER       NOT NULL,
    "mrp"           DECIMAL(12,2) NOT NULL,
    "dp"            DECIMAL(12,2) NOT NULL,
    "bv"            DECIMAL(12,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo"   TIMESTAMP(3),
    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductPrice_productId_effectiveFrom_idx" ON "ProductPrice"("productId", "effectiveFrom");

CREATE TABLE "Package" (
    "id"        SERIAL        NOT NULL,
    "code"      TEXT          NOT NULL,                      -- BASIC_40, FULL_100, UPGRADE_60
    "name"      TEXT          NOT NULL,
    "price"     DECIMAL(12,2) NOT NULL,
    "bv"        DECIMAL(12,2) NOT NULL,
    "tier"      "PackageTier" NOT NULL,
    "isUpgrade" BOOLEAN       NOT NULL DEFAULT false,
    "isActive"  BOOLEAN       NOT NULL DEFAULT true,
    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Package_code_key" ON "Package"("code");

CREATE TABLE "PackageItem" (
    "id"        SERIAL  NOT NULL,
    "packageId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "qty"       INTEGER NOT NULL,
    CONSTRAINT "PackageItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PackageItem_packageId_productId_key" ON "PackageItem"("packageId", "productId");

-- ---------------------------------------------------------------------
-- ORDERS & PAYMENTS
-- ---------------------------------------------------------------------
CREATE TABLE "Order" (
    "id"          TEXT          NOT NULL,
    "orderNo"     TEXT          NOT NULL,
    "memberId"    TEXT,
    "type"        "OrderType"   NOT NULL,
    "packageId"   INTEGER,
    "status"      "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subTotal"    DECIMAL(12,2) NOT NULL,
    "gstTotal"    DECIMAL(12,2) NOT NULL,
    "grandTotal"  DECIMAL(12,2) NOT NULL,
    "bvTotal"     DECIMAL(12,2) NOT NULL,
    "shipping"    JSONB,
    "franchiseId" TEXT,
    "invoiceNo"   TEXT,
    "invoiceUrl"  TEXT,
    "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt"      TIMESTAMP(3),
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Order_orderNo_key"   ON "Order"("orderNo");
CREATE UNIQUE INDEX "Order_invoiceNo_key" ON "Order"("invoiceNo");
CREATE INDEX "Order_memberId_createdAt_idx" ON "Order"("memberId", "createdAt");
CREATE INDEX "Order_status_paidAt_idx"      ON "Order"("status", "paidAt");

CREATE TABLE "OrderItem" (
    "id"        SERIAL        NOT NULL,
    "orderId"   TEXT          NOT NULL,
    "productId" INTEGER       NOT NULL,
    "qty"       INTEGER       NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,                      -- copied at order time
    "unitBv"    DECIMAL(12,2) NOT NULL,                      -- copied at order time
    "gstRate"   DECIMAL(5,2)  NOT NULL,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

CREATE TABLE "Payment" (
    "id"         TEXT            NOT NULL,
    "orderId"    TEXT            NOT NULL,
    "gateway"    TEXT            NOT NULL,
    "gatewayRef" TEXT,
    "amount"     DECIMAL(12,2)   NOT NULL,
    "status"     "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "raw"        JSONB,
    "createdAt"  TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_gatewayRef_key" ON "Payment"("gatewayRef");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- ---------------------------------------------------------------------
-- COMMISSION ENGINE
-- ---------------------------------------------------------------------
CREATE TABLE "BvPosting" (                                   -- one row per order or reversal (append-only)
    "id"         TEXT          NOT NULL,
    "memberId"   TEXT          NOT NULL,                     -- buyer
    "orderId"    TEXT          NOT NULL,
    "bv"         DECIMAL(12,2) NOT NULL,                     -- negative for a reversal
    "pairUnits"  INTEGER       NOT NULL DEFAULT 0,           -- 1 for a joining, -1 for its reversal
    "tier"       "PackageTier" NOT NULL,
    "postedAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "propagated" BOOLEAN       NOT NULL DEFAULT false,
    "reversalOf" TEXT,
    CONSTRAINT "BvPosting_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BvPosting_propagated_idx" ON "BvPosting"("propagated");
CREATE INDEX "BvPosting_memberId_idx"   ON "BvPosting"("memberId");
CREATE INDEX "BvPosting_orderId_idx"    ON "BvPosting"("orderId");

CREATE TABLE "Closing" (
    "id"          TEXT            NOT NULL,
    "periodStart" TIMESTAMP(3)    NOT NULL,
    "periodEnd"   TIMESTAMP(3)    NOT NULL,
    "status"      "ClosingStatus" NOT NULL DEFAULT 'DRAFT',
    "settingsVer" INTEGER         NOT NULL,
    "totalPayout" DECIMAL(16,2)   NOT NULL DEFAULT 0,
    "turnover"    DECIMAL(16,2)   NOT NULL DEFAULT 0,
    "runBy"       TEXT,
    "approvedBy"  TEXT,
    "createdAt"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt"    TIMESTAMP(3),
    CONSTRAINT "Closing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Closing_periodStart_periodEnd_key" ON "Closing"("periodStart", "periodEnd");

CREATE TABLE "ClosingLine" (
    "id"         TEXT          NOT NULL,
    "closingId"  TEXT          NOT NULL,
    "memberId"   TEXT          NOT NULL,
    "incomeType" "IncomeType"  NOT NULL,
    "pairs"      INTEGER       NOT NULL DEFAULT 0,
    "rate"       DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount"     DECIMAL(14,2) NOT NULL,
    "flushed"    INTEGER       NOT NULL DEFAULT 0,
    "detail"     JSONB         NOT NULL,                     -- full calculation breakdown
    CONSTRAINT "ClosingLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClosingLine_memberId_idx"  ON "ClosingLine"("memberId");
CREATE INDEX "ClosingLine_closingId_idx" ON "ClosingLine"("closingId");

CREATE TABLE "MemberRank" (
    "id"           TEXT         NOT NULL,
    "memberId"     TEXT         NOT NULL,
    "rankId"       INTEGER      NOT NULL,
    "achievedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bonusPaid"    BOOLEAN      NOT NULL DEFAULT false,
    "rewardStatus" TEXT         NOT NULL DEFAULT 'PENDING',  -- PENDING | CONFIRMED | COMPLETED | CASH_OPTION
    CONSTRAINT "MemberRank_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MemberRank_memberId_rankId_key" ON "MemberRank"("memberId", "rankId");

-- ---------------------------------------------------------------------
-- WALLET & PAYOUTS
-- ---------------------------------------------------------------------
CREATE TABLE "Wallet" (
    "memberId" TEXT          NOT NULL,
    "balance"  DECIMAL(16,2) NOT NULL DEFAULT 0,
    "onHold"   BOOLEAN       NOT NULL DEFAULT false,
    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("memberId")
);

CREATE TABLE "WalletTxn" (                                   -- append-only ledger
    "id"           TEXT            NOT NULL,
    "memberId"     TEXT            NOT NULL,
    "type"         "WalletTxnType" NOT NULL,
    "incomeType"   "IncomeType",
    "amount"       DECIMAL(14,2)   NOT NULL,
    "balanceAfter" DECIMAL(16,2)   NOT NULL,
    "refType"      TEXT            NOT NULL,                 -- CLOSING_LINE | WITHDRAWAL | WITHDRAWAL_REVERSAL | ADJUSTMENT | REVERSAL
    "refId"        TEXT            NOT NULL,
    "note"         TEXT,
    "createdAt"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletTxn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WalletTxn_refType_refId_type_key" ON "WalletTxn"("refType", "refId", "type");  -- no double credit
CREATE INDEX "WalletTxn_memberId_createdAt_idx" ON "WalletTxn"("memberId", "createdAt");

CREATE TABLE "Withdrawal" (
    "id"          TEXT               NOT NULL,
    "memberId"    TEXT               NOT NULL,
    "gross"       DECIMAL(14,2)      NOT NULL,
    "tds"         DECIMAL(14,2)      NOT NULL,
    "adminCharge" DECIMAL(14,2)      NOT NULL,
    "net"         DECIMAL(14,2)      NOT NULL,
    "status"      "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "utr"         TEXT,
    "approvedBy"  TEXT,
    "createdAt"   TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt"      TIMESTAMP(3),
    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Withdrawal_memberId_idx" ON "Withdrawal"("memberId");
CREATE INDEX "Withdrawal_status_idx"   ON "Withdrawal"("status");

-- ---------------------------------------------------------------------
-- SETTINGS, SUPPORT, AUDIT
-- ---------------------------------------------------------------------
CREATE TABLE "PlanSetting" (
    "id"            SERIAL       NOT NULL,
    "version"       INTEGER      NOT NULL,
    "values"        JSONB        NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdBy"     TEXT         NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlanSetting_version_key" ON "PlanSetting"("version");

CREATE TABLE "Ticket" (
    "id"        TEXT           NOT NULL,
    "memberId"  TEXT           NOT NULL,
    "category"  TEXT           NOT NULL,
    "subject"   TEXT           NOT NULL,
    "status"    "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "slaDueAt"  TIMESTAMP(3),
    "messages"  JSONB          NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3)   NOT NULL,
    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Ticket_memberId_idx" ON "Ticket"("memberId");
CREATE INDEX "Ticket_status_idx"   ON "Ticket"("status");

CREATE TABLE "ReturnRequest" (
    "id"        TEXT           NOT NULL,
    "orderId"   TEXT           NOT NULL,
    "reason"    TEXT           NOT NULL,
    "status"    "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");

CREATE TABLE "PendingAction" (                               -- maker-checker queue
    "id"          TEXT                  NOT NULL,
    "action"      TEXT                  NOT NULL,           -- e.g. MEMBER.UPDATE, WALLET.ADJUST
    "entity"      TEXT                  NOT NULL,
    "entityId"    TEXT                  NOT NULL,
    "payload"     JSONB                 NOT NULL,
    "requestedBy" TEXT                  NOT NULL,
    "decidedBy"   TEXT,
    "status"      "PendingActionStatus" NOT NULL DEFAULT 'PENDING',
    "reason"      TEXT,
    "createdAt"   TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt"   TIMESTAMP(3),
    CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PendingAction_status_idx" ON "PendingAction"("status");

CREATE TABLE "Counter" (
    "key"   TEXT    NOT NULL,
    "value" INTEGER NOT NULL,
    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "AuditLog" (                                    -- append-only
    "id"        BIGSERIAL    NOT NULL,
    "actorId"   TEXT,
    "action"    TEXT         NOT NULL,
    "entity"    TEXT         NOT NULL,
    "entityId"  TEXT         NOT NULL,
    "before"    JSONB,
    "after"     JSONB,
    "ip"        TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX "AuditLog_createdAt_idx"       ON "AuditLog"("createdAt");

-- ---------------------------------------------------------------------
-- FOREIGN KEYS
-- ---------------------------------------------------------------------
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey"       FOREIGN KEY ("userId")        REFERENCES "User"("id")     ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Member"       ADD CONSTRAINT "Member_userId_fkey"             FOREIGN KEY ("userId")        REFERENCES "User"("id")     ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Member"       ADD CONSTRAINT "Member_sponsorId_fkey"          FOREIGN KEY ("sponsorId")     REFERENCES "Member"("id")   ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Member"       ADD CONSTRAINT "Member_parentId_fkey"           FOREIGN KEY ("parentId")      REFERENCES "Member"("id")   ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Member"       ADD CONSTRAINT "Member_currentRankId_fkey"      FOREIGN KEY ("currentRankId") REFERENCES "Rank"("id")     ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NodeVolume"   ADD CONSTRAINT "NodeVolume_memberId_fkey"       FOREIGN KEY ("memberId")      REFERENCES "Member"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankAccount"  ADD CONSTRAINT "BankAccount_memberId_fkey"      FOREIGN KEY ("memberId")      REFERENCES "Member"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Nominee"      ADD CONSTRAINT "Nominee_memberId_fkey"          FOREIGN KEY ("memberId")      REFERENCES "Member"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KycDocument"  ADD CONSTRAINT "KycDocument_memberId_fkey"      FOREIGN KEY ("memberId")      REFERENCES "Member"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productId_fkey"    FOREIGN KEY ("productId")     REFERENCES "Product"("id")  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackageItem"  ADD CONSTRAINT "PackageItem_packageId_fkey"     FOREIGN KEY ("packageId")     REFERENCES "Package"("id")  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackageItem"  ADD CONSTRAINT "PackageItem_productId_fkey"     FOREIGN KEY ("productId")     REFERENCES "Product"("id")  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order"        ADD CONSTRAINT "Order_memberId_fkey"            FOREIGN KEY ("memberId")      REFERENCES "Member"("id")   ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order"        ADD CONSTRAINT "Order_packageId_fkey"           FOREIGN KEY ("packageId")     REFERENCES "Package"("id")  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem"    ADD CONSTRAINT "OrderItem_orderId_fkey"         FOREIGN KEY ("orderId")       REFERENCES "Order"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem"    ADD CONSTRAINT "OrderItem_productId_fkey"       FOREIGN KEY ("productId")     REFERENCES "Product"("id")  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment"      ADD CONSTRAINT "Payment_orderId_fkey"           FOREIGN KEY ("orderId")       REFERENCES "Order"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BvPosting"    ADD CONSTRAINT "BvPosting_memberId_fkey"        FOREIGN KEY ("memberId")      REFERENCES "Member"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BvPosting"    ADD CONSTRAINT "BvPosting_orderId_fkey"         FOREIGN KEY ("orderId")       REFERENCES "Order"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClosingLine"  ADD CONSTRAINT "ClosingLine_closingId_fkey"     FOREIGN KEY ("closingId")     REFERENCES "Closing"("id")  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClosingLine"  ADD CONSTRAINT "ClosingLine_memberId_fkey"      FOREIGN KEY ("memberId")      REFERENCES "Member"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberRank"   ADD CONSTRAINT "MemberRank_memberId_fkey"       FOREIGN KEY ("memberId")      REFERENCES "Member"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberRank"   ADD CONSTRAINT "MemberRank_rankId_fkey"         FOREIGN KEY ("rankId")        REFERENCES "Rank"("id")     ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Wallet"       ADD CONSTRAINT "Wallet_memberId_fkey"           FOREIGN KEY ("memberId")      REFERENCES "Member"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletTxn"    ADD CONSTRAINT "WalletTxn_memberId_fkey"        FOREIGN KEY ("memberId")      REFERENCES "Wallet"("memberId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Withdrawal"   ADD CONSTRAINT "Withdrawal_memberId_fkey"       FOREIGN KEY ("memberId")      REFERENCES "Wallet"("memberId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket"       ADD CONSTRAINT "Ticket_memberId_fkey"           FOREIGN KEY ("memberId")      REFERENCES "Member"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey"    FOREIGN KEY ("orderId")       REFERENCES "Order"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
