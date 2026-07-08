-- AddColumn: approval workflow fields to MerchantStatement
ALTER TABLE "MerchantStatement" ADD COLUMN "submittedBy" TEXT;
ALTER TABLE "MerchantStatement" ADD COLUMN "submittedAt" DATETIME;
ALTER TABLE "MerchantStatement" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "MerchantStatement" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "MerchantStatement" ADD COLUMN "rejectedBy" TEXT;
ALTER TABLE "MerchantStatement" ADD COLUMN "rejectedAt" DATETIME;
ALTER TABLE "MerchantStatement" ADD COLUMN "rejectionReason" TEXT;
CREATE INDEX "MerchantStatement_status_idx" ON "MerchantStatement"("status");

-- CreateTable: Charge
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chargeId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "chargeType" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceId" TEXT,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "rejectedBy" TEXT,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    "statementId" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Charge_chargeId_key" ON "Charge"("chargeId");
CREATE INDEX "Charge_merchantId_idx" ON "Charge"("merchantId");
CREATE INDEX "Charge_period_idx" ON "Charge"("period");
CREATE INDEX "Charge_status_idx" ON "Charge"("status");
CREATE INDEX "Charge_chargeType_idx" ON "Charge"("chargeType");

-- CreateTable: StatementDispute
CREATE TABLE "StatementDispute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "lineItemReference" TEXT,
    "disputeType" TEXT NOT NULL DEFAULT 'overcharge',
    "reason" TEXT NOT NULL,
    "creditAmountRequested" REAL NOT NULL,
    "creditAmountApproved" REAL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedBy" TEXT,
    "resolvedAt" DATETIME,
    "resolutionNotes" TEXT,
    "paymentId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "StatementDispute_disputeId_key" ON "StatementDispute"("disputeId");
CREATE INDEX "StatementDispute_merchantId_idx" ON "StatementDispute"("merchantId");
CREATE INDEX "StatementDispute_statementId_idx" ON "StatementDispute"("statementId");
CREATE INDEX "StatementDispute_status_idx" ON "StatementDispute"("status");
