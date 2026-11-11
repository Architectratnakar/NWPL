-- Package price became optional (empty = buyer pays the current DP of the bundled products).
-- The schema already said so, but no migration existed, so `prisma migrate deploy` left the column NOT NULL.
-- AlterTable
ALTER TABLE "Package" ALTER COLUMN "price" DROP NOT NULL;
