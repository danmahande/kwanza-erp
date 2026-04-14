-- AlterTable
ALTER TABLE "OutboundRecord" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAttemptDate" TIMESTAMP(3),
ADD COLUMN     "lastAttemptReason" TEXT,
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "nextAttemptDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "inboundId" TEXT,
    "outboundId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_WAREHOUSE',
    "condition" TEXT NOT NULL DEFAULT 'good',
    "trackingLevel" TEXT NOT NULL DEFAULT 'unit',
    "boxQty" INTEGER,
    "parentItemId" TEXT,
    "storageLocation" TEXT,
    "expiryDate" TIMESTAMP(3),
    "assignedRider" TEXT,
    "runsheetId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptDate" TIMESTAMP(3),
    "finalOutcome" TEXT,
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "description" TEXT,
    "performedBy" TEXT,
    "runsheetId" TEXT,
    "outboundId" TEXT,
    "inboundId" TEXT,
    "reason" TEXT,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_itemId_key" ON "InventoryItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemEvent_eventId_key" ON "ItemEvent"("eventId");
