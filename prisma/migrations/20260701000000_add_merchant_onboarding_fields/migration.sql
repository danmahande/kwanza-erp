-- Add merchant onboarding fields
ALTER TABLE "Merchant" ADD COLUMN "taxId" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "address" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "bankName" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "bankAccount" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "contactPerson" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "altPhone" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "contractStart" DATETIME;
ALTER TABLE "Merchant" ADD COLUMN "contractEnd" DATETIME;
ALTER TABLE "Merchant" ADD COLUMN "notes" TEXT;
