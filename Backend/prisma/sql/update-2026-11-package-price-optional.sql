-- Run once on an EXISTING database if you do not use Prisma Migrate
-- (with Prisma Migrate run instead:  npx prisma migrate dev --name package-price-optional)
ALTER TABLE "Package" ALTER COLUMN "price" DROP NOT NULL;
