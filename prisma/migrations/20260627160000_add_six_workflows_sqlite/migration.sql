-- Workflow 1: Storage Liability
CREATE TABLE "StorageLiability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "inboundId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unitsRemaining" INTEGER NOT NULL DEFAULT 0,
    "ratePerUnitPerDay" REAL NOT NULL DEFAULT 0,
    "accrualStart" DATETIME NOT NULL,
    "accrualThrough" DATETIME,
    "accruedAmount" REAL NOT NULL DEFAULT 0,
    "settledAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "StorageLiability_merchantId_idx" ON "StorageLiability"("merchantId");
CREATE INDEX "StorageLiability_inboundId_idx" ON "StorageLiability"("inboundId");

-- Per-merchant contracted rate card (UGX, no per-pallet, only per-unit-per-day storage)
CREATE TABLE "MerchantRateCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "inboundReceivingPerUnit" REAL NOT NULL DEFAULT 0,
    "storagePerUnitPerDay" REAL NOT NULL DEFAULT 0,
    "pickPerUnit" REAL NOT NULL DEFAULT 0,
    "packPerOrder" REAL NOT NULL DEFAULT 0,
    "returnProcessingPerUnit" REAL NOT NULL DEFAULT 0,
    "commissionPercent" REAL NOT NULL DEFAULT 0,
    "codRemittanceFeePerOrder" REAL NOT NULL DEFAULT 0,
    "codShortfallPenalty" REAL NOT NULL DEFAULT 0,
    "validFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "MerchantRateCard_merchantId_idx" ON "MerchantRateCard"("merchantId");

-- Workflow 2: Driver Banking
CREATE TABLE "DriverBanking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankingId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "bankName" TEXT,
    "bankReference" TEXT,
    "slipPhotoUrl" TEXT,
    "runsheetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedBy" TEXT,
    "verifiedAt" DATETIME,
    "shortfallAmount" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "bankedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "DriverBanking_driverId_idx" ON "DriverBanking"("driverId");
CREATE INDEX "DriverBanking_runsheetId_idx" ON "DriverBanking"("runsheetId");

-- Workflow 5: Merchant Statement
CREATE TABLE "MerchantStatement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "statementId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "openingBalance" REAL NOT NULL DEFAULT 0,
    "inboundFees" REAL NOT NULL DEFAULT 0,
    "storageFees" REAL NOT NULL DEFAULT 0,
    "outboundFees" REAL NOT NULL DEFAULT 0,
    "returnFees" REAL NOT NULL DEFAULT 0,
    "shrinkageDebits" REAL NOT NULL DEFAULT 0,
    "codCollected" REAL NOT NULL DEFAULT 0,
    "codFees" REAL NOT NULL DEFAULT 0,
    "commissions" REAL NOT NULL DEFAULT 0,
    "salesValue" REAL NOT NULL DEFAULT 0,
    "netPayable" REAL NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" DATETIME,
    "pdfUrl" TEXT,
    "excelUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lineItems" TEXT,
    "generatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "MerchantStatement_merchantId_idx" ON "MerchantStatement"("merchantId");
CREATE INDEX "MerchantStatement_period_idx" ON "MerchantStatement"("period");

-- Workflow 6: Payment Batch
CREATE TABLE "PaymentBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "merchantCount" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'bank_transfer',
    "bankReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "disbursedAt" DATETIME,
    "notes" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Workflow 3: After-Sales (RMA) — re-created after SQLite refactor
CREATE TABLE "AfterSalesRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "afterSalesId" TEXT NOT NULL,
    "originalOrderId" TEXT,
    "returnOrderNumber" TEXT,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "returnStatus" TEXT NOT NULL DEFAULT 'initiated',
    "agentId" TEXT,
    "agentName" TEXT,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "refundAmount" REAL,
    "replacementProductId" TEXT,
    "replacementProductName" TEXT,
    "returnTrackingNumber" TEXT,
    "itemIds" TEXT,
    "dispositions" TEXT,
    "resolutionNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Workflow 2: Order Processing — re-created after SQLite refactor
CREATE TABLE "OrderProcessing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "orderDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerInfo" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new_order',
    "trackingNumber" TEXT,
    "invoiceGenerated" BOOLEAN NOT NULL DEFAULT false,
    "invoiceNumber" TEXT,
    "invoiceDate" DATETIME,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Update Merchant: add deliveryType, currency, cumulative figures, storageLiabilityBalance
ALTER TABLE "Merchant" ADD COLUMN "deliveryType" TEXT DEFAULT 'self-delivery';
ALTER TABLE "Merchant" ADD COLUMN "currency" TEXT DEFAULT 'UGX';
ALTER TABLE "Merchant" ADD COLUMN "totalInboundValue" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Merchant" ADD COLUMN "totalSalesValue" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Merchant" ADD COLUMN "totalShrinkageValue" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Merchant" ADD COLUMN "totalReturnValue" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Merchant" ADD COLUMN "expectedPayment" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Merchant" ADD COLUMN "actualPayment" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Merchant" ADD COLUMN "pendingPayment" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Merchant" ADD COLUMN "storageLiabilityBalance" REAL NOT NULL DEFAULT 0;

-- Update MerchantPayment: add statementId, batchId, Y/M/D, status
ALTER TABLE "MerchantPayment" ADD COLUMN "deductions" REAL NOT NULL DEFAULT 0;
ALTER TABLE "MerchantPayment" ADD COLUMN "netAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "MerchantPayment" ADD COLUMN "statementId" TEXT;
ALTER TABLE "MerchantPayment" ADD COLUMN "batchId" TEXT;
ALTER TABLE "MerchantPayment" ADD COLUMN "year" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MerchantPayment" ADD COLUMN "month" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MerchantPayment" ADD COLUMN "day" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MerchantPayment" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
CREATE INDEX "MerchantPayment_merchantId_idx" ON "MerchantPayment"("merchantId");
CREATE INDEX "MerchantPayment_year_month_idx" ON "MerchantPayment"("year", "month");
CREATE INDEX "MerchantPayment_batchId_idx" ON "MerchantPayment"("batchId");

-- Workflow 3: add disposition column to ItemEvent
ALTER TABLE "ItemEvent" ADD COLUMN "disposition" TEXT;

-- Workflow 4: add merchant link + debit fields to ShrinkageRecord
ALTER TABLE "ShrinkageRecord" ADD COLUMN "rtvId" TEXT;
ALTER TABLE "ShrinkageRecord" ADD COLUMN "merchantId" TEXT;
ALTER TABLE "ShrinkageRecord" ADD COLUMN "merchantName" TEXT;
ALTER TABLE "ShrinkageRecord" ADD COLUMN "unitCost" REAL;
ALTER TABLE "ShrinkageRecord" ADD COLUMN "totalValue" REAL;
ALTER TABLE "ShrinkageRecord" ADD COLUMN "debitMerchant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShrinkageRecord" ADD COLUMN "settledOnStatementId" TEXT;
ALTER TABLE "ShrinkageRecord" ADD COLUMN "resolvedBy" TEXT;
ALTER TABLE "ShrinkageRecord" ADD COLUMN "resolvedAt" DATETIME;
CREATE INDEX "ShrinkageRecord_merchantId_idx" ON "ShrinkageRecord"("merchantId");
CREATE INDEX "ShrinkageRecord_rtvId_idx" ON "ShrinkageRecord"("rtvId");

-- Add processedBy/processedAt to RTVRecord for approval workflow
-- (Already exists in the original SQLite schema if migrated; add if missing)
