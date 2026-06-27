-- Workflow 1: Storage Liability
-- Merchant storage liability accrues daily per inbound unit
CREATE TABLE "StorageLiability" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "inboundId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unitsRemaining" INTEGER NOT NULL DEFAULT 0,
    "ratePerUnitPerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accrualStart" TIMESTAMP(3) NOT NULL,
    "accrualThrough" TIMESTAMP(3),
    "accruedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "settledAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageLiability_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StorageLiability_merchantId_idx" ON "StorageLiability"("merchantId");
CREATE INDEX "StorageLiability_inboundId_idx" ON "StorageLiability"("inboundId");

-- Per-merchant contracted rate card (UGX, no per-pallet, only per-unit-per-day storage)
CREATE TABLE "MerchantRateCard" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "inboundReceivingPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storagePerUnitPerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "packPerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnProcessingPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "codRemittanceFeePerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "codShortfallPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantRateCard_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MerchantRateCard_merchantId_idx" ON "MerchantRateCard"("merchantId");

-- Workflow 2: Driver Banking + COD reconciliation
CREATE TABLE "DriverBanking" (
    "id" TEXT NOT NULL,
    "bankingId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "bankName" TEXT,
    "bankReference" TEXT,
    "slipPhotoUrl" TEXT,
    "runsheetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "shortfallAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "bankedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverBanking_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DriverBanking_bankingId_key" UNIQUE ("bankingId")
);
CREATE INDEX "DriverBanking_driverId_idx" ON "DriverBanking"("driverId");
CREATE INDEX "DriverBanking_runsheetId_idx" ON "DriverBanking"("runsheetId");

-- Workflow 5: Monthly merchant statement
CREATE TABLE "MerchantStatement" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inboundFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storageFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outboundFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shrinkageDebits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "codCollected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "codFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPayable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "excelUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lineItems" JSONB,
    "generatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantStatement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MerchantStatement_statementId_key" UNIQUE ("statementId")
);
CREATE INDEX "MerchantStatement_merchantId_idx" ON "MerchantStatement"("merchantId");
CREATE INDEX "MerchantStatement_period_idx" ON "MerchantStatement"("period");

-- Workflow 6: Payment Batch
CREATE TABLE "PaymentBatch" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "merchantCount" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'bank_transfer',
    "bankReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "disbursedAt" TIMESTAMP(3),
    "notes" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentBatch_batchId_key" UNIQUE ("batchId")
);

-- Update Merchant: add currency + storageLiabilityBalance
ALTER TABLE "Merchant" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'UGX';
ALTER TABLE "Merchant" ADD COLUMN "storageLiabilityBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Update MerchantPayment: link to statement + batch, add Y/M/D for filtering
ALTER TABLE "MerchantPayment" ADD COLUMN "statementId" TEXT;
ALTER TABLE "MerchantPayment" ADD COLUMN "batchId" TEXT;
ALTER TABLE "MerchantPayment" ADD COLUMN "year" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MerchantPayment" ADD COLUMN "month" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MerchantPayment" ADD COLUMN "day" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "MerchantPayment_merchantId_idx" ON "MerchantPayment"("merchantId");
CREATE INDEX "MerchantPayment_year_month_idx" ON "MerchantPayment"("year", "month");
CREATE INDEX "MerchantPayment_batchId_idx" ON "MerchantPayment"("batchId");

-- Workflow 3: Returns disposition
-- Add disposition column to ItemEvent
ALTER TABLE "ItemEvent" ADD COLUMN "disposition" TEXT;
-- Add itemIds + dispositions JSON columns to AfterSalesRecord
ALTER TABLE "AfterSalesRecord" ADD COLUMN "itemIds" JSONB;
ALTER TABLE "AfterSalesRecord" ADD COLUMN "dispositions" JSONB;

-- Workflow 4: Shrinkage merchant debit
-- Add merchant link + debit fields to ShrinkageRecord
ALTER TABLE "ShrinkageRecord" ADD COLUMN "merchantId" TEXT;
ALTER TABLE "ShrinkageRecord" ADD COLUMN "merchantName" TEXT;
ALTER TABLE "ShrinkageRecord" ADD COLUMN "unitCost" DOUBLE PRECISION;
ALTER TABLE "ShrinkageRecord" ADD COLUMN "totalValue" DOUBLE PRECISION;
ALTER TABLE "ShrinkageRecord" ADD COLUMN "debitMerchant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShrinkageRecord" ADD COLUMN "settledOnStatementId" TEXT;
CREATE INDEX "ShrinkageRecord_merchantId_idx" ON "ShrinkageRecord"("merchantId");
CREATE INDEX "ShrinkageRecord_rtvId_idx" ON "ShrinkageRecord"("rtvId");
