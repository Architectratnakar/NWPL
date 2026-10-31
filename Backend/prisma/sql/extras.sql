-- =====================================================================
--  MLM PORTAL — PostgreSQL DATABASE
--  OPTIONAL extra safety rules, triggers, SQL functions and views.
--  Run after the tables exist:  npm run db:extras
--  Prisma ignores these objects, so they never cause migration drift.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. SEQUENCES & NUMBER GENERATORS
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS member_code_seq  START WITH 100001;   -- NW100001, NW100002 ...
CREATE SEQUENCE IF NOT EXISTS order_no_seq     START WITH 1;
CREATE SEQUENCE IF NOT EXISTS invoice_no_seq   START WITH 1;

-- Distributor code: NW100001
CREATE OR REPLACE FUNCTION fn_next_distributor_code() RETURNS TEXT
LANGUAGE sql AS $$ SELECT 'NW' || nextval('member_code_seq')::text $$;

-- Order number: ORD-20261019-000001
CREATE OR REPLACE FUNCTION fn_next_order_no() RETURNS TEXT
LANGUAGE sql AS $$
  SELECT 'ORD-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-' || lpad(nextval('order_no_seq')::text, 6, '0')
$$;

-- GST invoice number with Indian financial year: INV/2026-27/000001
CREATE OR REPLACE FUNCTION fn_next_invoice_no() RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  d  DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  fy INT  := CASE WHEN extract(month FROM d) >= 4 THEN extract(year FROM d)::int ELSE extract(year FROM d)::int - 1 END;
BEGIN
  RETURN 'INV/' || fy || '-' || lpad(((fy + 1) % 100)::text, 2, '0') || '/' || lpad(nextval('invoice_no_seq')::text, 6, '0');
END $$;

-- ---------------------------------------------------------------------
-- 2. CHECK CONSTRAINTS (the database refuses bad data)
-- ---------------------------------------------------------------------
ALTER TABLE "Wallet"       ADD CONSTRAINT wallet_balance_non_negative   CHECK ("balance" >= 0);
ALTER TABLE "Member"       ADD CONSTRAINT member_code_format            CHECK ("distributorCode" ~ '^NW[0-9]{6,}$');
ALTER TABLE "Member"       ADD CONSTRAINT member_parent_side_together   CHECK (("parentId" IS NULL) = ("side" IS NULL));
ALTER TABLE "Member"       ADD CONSTRAINT member_not_own_parent         CHECK ("parentId" IS DISTINCT FROM "id" AND "sponsorId" IS DISTINCT FROM "id");
ALTER TABLE "Member"       ADD CONSTRAINT member_level_non_negative     CHECK ("level" >= 0);
ALTER TABLE "NodeVolume"   ADD CONSTRAINT nodevolume_non_negative       CHECK ("carryLeftFull" >= 0 AND "carryLeftBasic" >= 0 AND "carryRightFull" >= 0 AND "carryRightBasic" >= 0
                                                                              AND "pairsToday" >= 0 AND "pairsThisWeek" >= 0 AND "pairsThisMonth" >= 0);
ALTER TABLE "ProductPrice" ADD CONSTRAINT productprice_valid            CHECK ("mrp" > 0 AND "dp" > 0 AND "dp" <= "mrp" AND "bv" >= 0
                                                                              AND ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"));
ALTER TABLE "Product"      ADD CONSTRAINT product_gst_valid             CHECK ("gstRate" >= 0 AND "gstRate" <= 28);
ALTER TABLE "Package"      ADD CONSTRAINT package_valid                 CHECK ("price" > 0 AND "bv" > 0);
ALTER TABLE "PackageItem"  ADD CONSTRAINT packageitem_qty_positive      CHECK ("qty" > 0);
ALTER TABLE "OrderItem"    ADD CONSTRAINT orderitem_valid               CHECK ("qty" > 0 AND "unitPrice" >= 0 AND "unitBv" >= 0);
ALTER TABLE "Order"        ADD CONSTRAINT order_totals_valid            CHECK ("subTotal" >= 0 AND "gstTotal" >= 0 AND "grandTotal" >= 0 AND "bvTotal" >= 0);
ALTER TABLE "Payment"      ADD CONSTRAINT payment_amount_positive       CHECK ("amount" > 0);
ALTER TABLE "WalletTxn"    ADD CONSTRAINT wallettxn_amount_positive     CHECK ("amount" > 0);
ALTER TABLE "Withdrawal"   ADD CONSTRAINT withdrawal_math               CHECK ("gross" > 0 AND "tds" >= 0 AND "adminCharge" >= 0
                                                                              AND "net" = "gross" - "tds" - "adminCharge" AND "net" >= 0);
ALTER TABLE "Closing"      ADD CONSTRAINT closing_period_valid          CHECK ("periodEnd" > "periodStart");
ALTER TABLE "ClosingLine"  ADD CONSTRAINT closingline_counts            CHECK ("pairs" >= 0 AND "flushed" >= 0);
ALTER TABLE "Rank"         ADD CONSTRAINT rank_values_valid             CHECK ("thresholdBv" > 0 AND "bonusAmount" >= 0);

-- ---------------------------------------------------------------------
-- 3. TRIGGERS
-- ---------------------------------------------------------------------

-- 3a. Keep "updatedAt" correct even for raw-SQL writes (Prisma also sets it)
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW."updatedAt" := CURRENT_TIMESTAMP; RETURN NEW; END $$;

CREATE TRIGGER member_updated_at      BEFORE INSERT OR UPDATE ON "Member"      FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER nodevolume_updated_at  BEFORE INSERT OR UPDATE ON "NodeVolume"  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER bankaccount_updated_at BEFORE INSERT OR UPDATE ON "BankAccount" FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER ticket_updated_at      BEFORE INSERT OR UPDATE ON "Ticket"      FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- 3b. Every new member automatically gets a NodeVolume row and a Wallet.
--     (So the API must NOT create these itself.)
CREATE OR REPLACE FUNCTION trg_member_after_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "NodeVolume" ("memberId", "updatedAt") VALUES (NEW."id", CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
  INSERT INTO "Wallet"     ("memberId")              VALUES (NEW."id")                    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER member_after_insert AFTER INSERT ON "Member" FOR EACH ROW EXECUTE FUNCTION trg_member_after_insert();

-- 3c. A member's placement can never be changed once set (protects the tree & all BV history)
CREATE OR REPLACE FUNCTION trg_member_lock_placement() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."parentId" IS DISTINCT FROM NEW."parentId" OR OLD."side" IS DISTINCT FROM NEW."side"
     OR OLD."sponsorId" IS DISTINCT FROM NEW."sponsorId" OR OLD."level" IS DISTINCT FROM NEW."level" THEN
    RAISE EXCEPTION 'Placement / sponsor of member % cannot be changed', OLD."distributorCode";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER member_lock_placement BEFORE UPDATE ON "Member" FOR EACH ROW EXECUTE FUNCTION trg_member_lock_placement();

-- 3d. Append-only ledgers: WalletTxn and AuditLog can never be edited or deleted
CREATE OR REPLACE FUNCTION trg_block_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % not allowed. Post a reversing entry instead.', TG_TABLE_NAME, TG_OP;
END $$;
CREATE TRIGGER wallettxn_append_only BEFORE UPDATE OR DELETE ON "WalletTxn" FOR EACH ROW EXECUTE FUNCTION trg_block_change();
CREATE TRIGGER auditlog_append_only  BEFORE UPDATE OR DELETE ON "AuditLog"  FOR EACH ROW EXECUTE FUNCTION trg_block_change();

-- 3e. BvPosting: no deletes; the only allowed update is propagated false -> true
CREATE OR REPLACE FUNCTION trg_bvposting_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BvPosting is append-only: DELETE not allowed. Insert a reversal instead.';
  END IF;
  IF (OLD."memberId", OLD."orderId", OLD."bv", OLD."pairUnits", OLD."tier", OLD."postedAt", OLD."reversalOf")
     IS DISTINCT FROM (NEW."memberId", NEW."orderId", NEW."bv", NEW."pairUnits", NEW."tier", NEW."postedAt", NEW."reversalOf")
     OR (OLD."propagated" AND NOT NEW."propagated") THEN
    RAISE EXCEPTION 'BvPosting %: only propagated false -> true may be updated', OLD."id";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bvposting_guard BEFORE UPDATE OR DELETE ON "BvPosting" FOR EACH ROW EXECUTE FUNCTION trg_bvposting_guard();

-- 3f. Plan settings are versioned: old versions are never edited
CREATE TRIGGER plansetting_append_only BEFORE UPDATE OR DELETE ON "PlanSetting" FOR EACH ROW EXECUTE FUNCTION trg_block_change();

-- ---------------------------------------------------------------------
-- 4. TREE FUNCTIONS
-- ---------------------------------------------------------------------

-- All ancestors of a member, with the side of the ancestor the member sits on.
-- SELECT * FROM fn_upline('<memberId>');
CREATE OR REPLACE FUNCTION fn_upline(p_member_id TEXT)
RETURNS TABLE (ancestor_id TEXT, side "Side", depth INT)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE up AS (
    SELECT m."parentId" AS ancestor_id, m."side" AS side, 1 AS depth
    FROM "Member" m WHERE m."id" = p_member_id AND m."parentId" IS NOT NULL
    UNION ALL
    SELECT m."parentId", m."side", up.depth + 1
    FROM "Member" m JOIN up ON m."id" = up.ancestor_id
    WHERE m."parentId" IS NOT NULL
  )
  SELECT ancestor_id, side, depth FROM up;
$$;

-- Downline of a member up to p_max_depth levels (for genealogy screens).
-- SELECT * FROM fn_downline('<memberId>', 3);
CREATE OR REPLACE FUNCTION fn_downline(p_member_id TEXT, p_max_depth INT DEFAULT 3)
RETURNS TABLE (member_id TEXT, parent_id TEXT, side "Side", depth INT, leg "Side")
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE down AS (
    SELECT m."id" AS member_id, m."parentId" AS parent_id, m."side", 1 AS depth, m."side" AS leg
    FROM "Member" m WHERE m."parentId" = p_member_id
    UNION ALL
    SELECT m."id", m."parentId", m."side", d.depth + 1, d.leg
    FROM "Member" m JOIN down d ON m."parentId" = d.member_id
    WHERE d.depth < p_max_depth
  )
  SELECT member_id, parent_id, side, depth, leg FROM down;
$$;

-- Bottom-most free slot on the outer edge of the sponsor's chosen side
-- (extreme-left / extreme-right placement). Locks the parent row, so call it
-- inside the same transaction that inserts the new member.
-- SELECT * FROM fn_find_placement('<sponsorId>', 'LEFT');
CREATE OR REPLACE FUNCTION fn_find_placement(p_sponsor_id TEXT, p_side "Side")
RETURNS TABLE (parent_id TEXT, side "Side", level INT)
LANGUAGE plpgsql AS $$
DECLARE
  v_cursor TEXT := p_sponsor_id;
  v_next   TEXT;
  v_level  INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Member" WHERE "id" = p_sponsor_id) THEN
    RAISE EXCEPTION 'Sponsor % not found', p_sponsor_id;
  END IF;
  LOOP
    SELECT m."id" INTO v_next FROM "Member" m WHERE m."parentId" = v_cursor AND m."side" = p_side;
    EXIT WHEN v_next IS NULL;
    v_cursor := v_next;
    v_next := NULL;
  END LOOP;
  SELECT m."level" INTO v_level FROM "Member" m WHERE m."id" = v_cursor FOR UPDATE;
  RETURN QUERY SELECT v_cursor, p_side, v_level + 1;
END $$;

-- ---------------------------------------------------------------------
-- 5. BV PROPAGATION (Step 9.2 of the development plan)
-- ---------------------------------------------------------------------

-- Adds one BvPosting to the left/right totals of every ancestor.
-- Safe to call twice: an already-propagated posting is skipped.
-- Returns the number of ancestors updated.
CREATE OR REPLACE FUNCTION fn_propagate_bv(p_posting_id TEXT) RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
  p   "BvPosting"%ROWTYPE;
  n   INT;
BEGIN
  SELECT * INTO p FROM "BvPosting" WHERE "id" = p_posting_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BvPosting % not found', p_posting_id; END IF;
  IF p."propagated" THEN RETURN 0; END IF;

  UPDATE "NodeVolume" nv SET
    "totalLeftBv"     = nv."totalLeftBv"  + CASE WHEN up.side = 'LEFT'  THEN p."bv" ELSE 0 END,
    "totalRightBv"    = nv."totalRightBv" + CASE WHEN up.side = 'RIGHT' THEN p."bv" ELSE 0 END,
    "totalLeftCount"  = nv."totalLeftCount"  + CASE WHEN up.side = 'LEFT'  THEN p."pairUnits" ELSE 0 END,
    "totalRightCount" = nv."totalRightCount" + CASE WHEN up.side = 'RIGHT' THEN p."pairUnits" ELSE 0 END,
    -- carry never goes below 0; a reversal of an already-matched unit is recovered by an ADJUSTMENT line
    "carryLeftFull"   = GREATEST(0, nv."carryLeftFull"   + CASE WHEN up.side = 'LEFT'  AND p."tier" = 'FULL'  THEN p."pairUnits" ELSE 0 END),
    "carryLeftBasic"  = GREATEST(0, nv."carryLeftBasic"  + CASE WHEN up.side = 'LEFT'  AND p."tier" = 'BASIC' THEN p."pairUnits" ELSE 0 END),
    "carryRightFull"  = GREATEST(0, nv."carryRightFull"  + CASE WHEN up.side = 'RIGHT' AND p."tier" = 'FULL'  THEN p."pairUnits" ELSE 0 END),
    "carryRightBasic" = GREATEST(0, nv."carryRightBasic" + CASE WHEN up.side = 'RIGHT' AND p."tier" = 'BASIC' THEN p."pairUnits" ELSE 0 END)
  FROM fn_upline(p."memberId") up
  WHERE nv."memberId" = up.ancestor_id;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE "BvPosting" SET "propagated" = true WHERE "id" = p_posting_id;
  RETURN n;
END $$;

-- Processes up to p_limit pending postings, oldest first. Call from the job worker:
-- SELECT fn_propagate_pending(500);
CREATE OR REPLACE FUNCTION fn_propagate_pending(p_limit INT DEFAULT 500) RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  done INT := 0;
BEGIN
  FOR r IN SELECT "id" FROM "BvPosting" WHERE NOT "propagated" ORDER BY "postedAt", "id" LIMIT p_limit
  LOOP
    PERFORM fn_propagate_bv(r."id");
    done := done + 1;
  END LOOP;
  RETURN done;
END $$;

-- ---------------------------------------------------------------------
-- 6. RANKS
-- ---------------------------------------------------------------------

-- Ranks a member qualifies for but has not yet been awarded.
-- SELECT * FROM fn_pending_ranks('<memberId>');
CREATE OR REPLACE FUNCTION fn_pending_ranks(p_member_id TEXT)
RETURNS TABLE (rank_id INT, rank_name TEXT, bonus DECIMAL, reward TEXT)
LANGUAGE sql STABLE AS $$
  SELECT r."id", r."name", r."bonusAmount", r."reward"
  FROM "Rank" r
  JOIN "NodeVolume" nv ON nv."memberId" = p_member_id
  WHERE LEAST(nv."totalLeftBv", nv."totalRightBv") >= r."thresholdBv"
    AND NOT EXISTS (SELECT 1 FROM "MemberRank" mr WHERE mr."memberId" = p_member_id AND mr."rankId" = r."id")
  ORDER BY r."id";
$$;

-- ---------------------------------------------------------------------
-- 7. VIEWS (read-only helpers for APIs and reports)
-- ---------------------------------------------------------------------

-- Current price of each product, with retail margin
CREATE OR REPLACE VIEW v_product_current AS
SELECT p."id", p."sku", p."name", p."category", p."gstRate", p."isActive", p."stock",
       pp."mrp", pp."dp", pp."bv",
       round((pp."mrp" - pp."dp") / pp."mrp" * 100, 1) AS "marginPercent"
FROM "Product" p
JOIN LATERAL (
  SELECT x.* FROM "ProductPrice" x
  WHERE x."productId" = p."id" AND x."effectiveFrom" <= now()
    AND (x."effectiveTo" IS NULL OR x."effectiveTo" > now())
  ORDER BY x."effectiveFrom" DESC LIMIT 1
) pp ON true;

-- Plan settings in force right now
CREATE OR REPLACE VIEW v_plan_setting_current AS
SELECT * FROM "PlanSetting" WHERE "effectiveFrom" <= now() ORDER BY "version" DESC LIMIT 1;

-- One row per member for dashboards / admin lists
CREATE OR REPLACE VIEW v_member_summary AS
SELECT m."id", m."distributorCode", m."fullName", m."status", m."packageTier", m."kycStatus",
       m."activatedAt", s."distributorCode" AS "sponsorCode", par."distributorCode" AS "parentCode", m."side",
       r."name" AS "rankName",
       nv."totalLeftBv", nv."totalRightBv", nv."totalLeftCount", nv."totalRightCount",
       nv."carryLeftFull" + nv."carryLeftBasic"   AS "carryLeft",
       nv."carryRightFull" + nv."carryRightBasic" AS "carryRight",
       nv."pairsToday", w."balance" AS "walletBalance", w."onHold"
FROM "Member" m
LEFT JOIN "Member" s     ON s."id"   = m."sponsorId"
LEFT JOIN "Member" par   ON par."id" = m."parentId"
LEFT JOIN "Rank" r       ON r."id"   = m."currentRankId"
LEFT JOIN "NodeVolume" nv ON nv."memberId" = m."id"
LEFT JOIN "Wallet" w     ON w."memberId"  = m."id";

COMMIT;
