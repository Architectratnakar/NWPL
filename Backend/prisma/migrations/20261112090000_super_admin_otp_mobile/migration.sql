-- Super Admin login OTP goes to 7250227201 (was the demo number 9000000001).
-- Changes only the demo Super Admin account that still has the old demo number,
-- and only when no other account already uses 7250227201 (mobile is unique). Safe to re-run.
UPDATE "User"
SET "mobile" = '7250227201'
WHERE "mobile" = '9000000001'
  AND "role" = 'ADMIN_SUPER'
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "mobile" = '7250227201');
