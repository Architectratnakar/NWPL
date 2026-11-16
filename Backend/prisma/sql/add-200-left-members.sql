-- =====================================================================
-- Add 200 members on the LEFT leg of the Company ID  (PostgreSQL)
--
-- Run in psql / pgAdmin / Render "Connect" shell:
--   psql "$DATABASE_URL" -f prisma/sql/add-200-left-members.sql
--
-- What it does (same result as registering 200 people on the website
-- with Sponsor = Company ID and Side = LEFT):
--   * finds the bottom of the extreme-left line under the Company ID
--   * each new member is placed LEFT under the previous one (sponsor = Company ID)
--   * distributor codes come from the same "Counter" row the app uses (member_code)
--   * creates User (role MEMBER), Member (REGISTERED, package NONE),
--     NodeVolume, Wallet and an AuditLog row for each one
--   * mobiles start at 7000000001; numbers already in use are skipped
--   * password for every new login: Demo@123
--   * all-or-nothing: if anything fails, nothing is saved
--
-- Members are NOT activated (no joining package / BV). To activate them,
-- use scripts/add-left-members.ts --activate FULL instead, or activate them
-- from the admin panel, so the BV engine updates the upline counts.
-- =====================================================================

DO $$
DECLARE
  v_company_code TEXT    := NULL;   -- e.g. 'NW100000'. NULL = the root member (no parent, no sponsor)
  v_count        INT     := 200;
  v_name_prefix  TEXT    := 'Left Member';
  v_mobile       BIGINT  := 7000000001;
  v_pw_hash      TEXT    := '$2b$10$q2LwOIpEgulWVQDmGiTep.Ja/MGWnt7djEE3o0lmZlGE.yTQ95Bwq'; -- bcrypt of Demo@123

  v_company      RECORD;
  v_parent_id    TEXT;
  v_parent_level INT;
  v_child        TEXT;
  v_user_id      TEXT;
  v_member_id    TEXT;
  v_code         TEXT;
  v_first_code   TEXT;
  v_counter      INT;
  i              INT;
BEGIN
  -- 1. Company ID
  IF v_company_code IS NULL THEN
    SELECT * INTO v_company FROM "Member"
     WHERE "parentId" IS NULL AND "sponsorId" IS NULL
     ORDER BY "createdAt" LIMIT 1;
  ELSE
    SELECT * INTO v_company FROM "Member" WHERE "distributorCode" = upper(v_company_code);
  END IF;
  IF v_company.id IS NULL THEN
    RAISE EXCEPTION 'Company ID not found';
  END IF;
  IF v_company.status IN ('BLOCKED', 'TERMINATED') THEN
    RAISE EXCEPTION 'Company ID % is %', v_company."distributorCode", v_company.status;
  END IF;

  -- 2. bottom of the extreme-left line
  v_parent_id := v_company.id;
  LOOP
    SELECT id INTO v_child FROM "Member" WHERE "parentId" = v_parent_id AND side = 'LEFT';
    EXIT WHEN v_child IS NULL;
    v_parent_id := v_child;
  END LOOP;
  -- lock it so a website registration cannot take the same slot meanwhile
  SELECT level INTO v_parent_level FROM "Member" WHERE id = v_parent_id FOR UPDATE;

  RAISE NOTICE 'Company ID %, first new member goes LEFT under % (level %)',
    v_company."distributorCode", (SELECT "distributorCode" FROM "Member" WHERE id = v_parent_id), v_parent_level;

  -- 3. create the members
  FOR i IN 1..v_count LOOP
    WHILE EXISTS (SELECT 1 FROM "User" WHERE mobile = v_mobile::text) LOOP
      v_mobile := v_mobile + 1;
    END LOOP;

    -- next distributor code (same logic as src/lib/counters.ts)
    INSERT INTO "Counter" (key, value) VALUES ('member_code', 100001)
    ON CONFLICT (key) DO UPDATE SET value = "Counter".value + 1
    RETURNING value INTO v_counter;
    v_code := 'NW' || v_counter;
    IF v_first_code IS NULL THEN v_first_code := v_code; END IF;

    v_user_id   := 'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);
    v_member_id := 'c' || substr(md5(random()::text || clock_timestamp()::text || i), 1, 24);

    INSERT INTO "User" (id, mobile, email, "passwordHash", role, "isActive", "createdAt")
    VALUES (v_user_id, v_mobile::text, NULL, v_pw_hash, 'MEMBER', true, now());

    INSERT INTO "Member" (id, "distributorCode", "userId", "fullName",
                          "sponsorId", "parentId", side, level,
                          status, "packageTier", "kycStatus",
                          "agreementVersion", "agreementAcceptedAt", "createdAt", "updatedAt")
    VALUES (v_member_id, v_code, v_user_id, v_name_prefix || ' ' || i,
            v_company.id, v_parent_id, 'LEFT', v_parent_level + 1,
            'REGISTERED', 'NONE', 'NOT_SUBMITTED',
            'v1.0-2026-10', now(), now(), now());

    -- extras.sql may already create these with a trigger, so ignore duplicates
    INSERT INTO "NodeVolume" ("memberId", "updatedAt") VALUES (v_member_id, now()) ON CONFLICT DO NOTHING;
    INSERT INTO "Wallet" ("memberId") VALUES (v_member_id) ON CONFLICT DO NOTHING;

    INSERT INTO "AuditLog" ("actorId", action, entity, "entityId", after, ip, "createdAt")
    VALUES (v_user_id, 'MEMBER.REGISTER', 'Member', v_member_id,
            jsonb_build_object('code', v_code, 'sponsor', v_company."distributorCode", 'side', 'LEFT', 'source', 'bulk-sql'),
            'bulk-sql', now());

    -- the next member goes under this one
    v_parent_id    := v_member_id;
    v_parent_level := v_parent_level + 1;
    v_mobile       := v_mobile + 1;
  END LOOP;

  RAISE NOTICE 'Created % members: % ... %', v_count, v_first_code, v_code;
END $$;

-- Check: size of the Company ID's left leg
WITH RECURSIVE root AS (
  SELECT id, "distributorCode" FROM "Member"
   WHERE "parentId" IS NULL AND "sponsorId" IS NULL ORDER BY "createdAt" LIMIT 1
), down AS (
  SELECT m.id FROM "Member" m JOIN root r ON m."parentId" = r.id AND m.side = 'LEFT'
  UNION ALL
  SELECT m.id FROM "Member" m JOIN down d ON m."parentId" = d.id
)
SELECT (SELECT "distributorCode" FROM root) AS company_id, COUNT(*) AS left_leg_members FROM down;
