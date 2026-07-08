-- CreateTable: MerchantCommunication
CREATE TABLE "MerchantCommunication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'call',
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "subject" TEXT NOT NULL,
    "notes" TEXT,
    "recordedBy" TEXT NOT NULL,
    "followUpAt" DATETIME,
    "isResolved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "MerchantCommunication_merchantId_idx" ON "MerchantCommunication"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantCommunication_followUpAt_idx" ON "MerchantCommunication"("followUpAt");

-- CreateIndex
CREATE INDEX "MerchantCommunication_createdAt_idx" ON "MerchantCommunication"("createdAt");

-- AddColumn: isOnHold + hold fields to Merchant
ALTER TABLE "Merchant" ADD COLUMN "isOnHold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Merchant" ADD COLUMN "holdReason" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "holdSetAt" DATETIME;
ALTER TABLE "Merchant" ADD COLUMN "holdSetBy" TEXT;
