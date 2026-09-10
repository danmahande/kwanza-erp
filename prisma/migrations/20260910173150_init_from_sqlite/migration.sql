-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "deliveryType" TEXT DEFAULT 'self-delivery',
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "taxId" TEXT,
    "address" TEXT,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "contactPerson" TEXT,
    "altPhone" TEXT,
    "paymentTerms" TEXT,
    "communicationChannels" TEXT,
    "deliveryAddresses" TEXT,
    "productCategories" TEXT,
    "contractStart" TIMESTAMP(3),
    "contractEnd" TIMESTAMP(3),
    "notes" TEXT,
    "totalInboundValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSalesValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalShrinkageValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReturnValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedPayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualPayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pendingPayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storageLiabilityBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isOnHold" BOOLEAN NOT NULL DEFAULT false,
    "holdReason" TEXT,
    "holdSetAt" TIMESTAMP(3),
    "holdSetBy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantCommunication" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'call',
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "subject" TEXT NOT NULL,
    "notes" TEXT,
    "recordedBy" TEXT NOT NULL,
    "followUpAt" TIMESTAMP(3),
    "isResolved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverCommunication" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'call',
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "subject" TEXT NOT NULL,
    "notes" TEXT,
    "outboundId" TEXT,
    "orderNumber" TEXT,
    "customerName" TEXT,
    "customerContact" TEXT,
    "recordedBy" TEXT NOT NULL,
    "followUpAt" TIMESTAMP(3),
    "isResolved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantRateCard" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "receivingFlatFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivingFlatHours" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "receivingHourlyAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inboundReceivingPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storagePerBinMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storagePerShelfMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storagePerPalletMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storagePerUnitPerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickFirstItemsIncluded" INTEGER NOT NULL DEFAULT 4,
    "pickPerAdditionalItem" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "packPerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fulfillmentFeePerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fulfillmentMinimumFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnProcessingPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnsPerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
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

-- CreateTable
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

-- CreateTable
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

    CONSTRAINT "DriverBanking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "lineItems" TEXT,
    "generatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "chargeType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceId" TEXT,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "statementId" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementDispute" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "lineItemReference" TEXT,
    "disputeType" TEXT NOT NULL DEFAULT 'overcharge',
    "reason" TEXT NOT NULL,
    "creditAmountRequested" DOUBLE PRECISION NOT NULL,
    "creditAmountApproved" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "paymentId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "PaymentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantPayment" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "comment" TEXT,
    "deductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recordedBy" TEXT NOT NULL,
    "statementId" TEXT,
    "batchId" TEXT,
    "year" INTEGER NOT NULL DEFAULT 0,
    "month" INTEGER NOT NULL DEFAULT 0,
    "day" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productLabel" TEXT NOT NULL,
    "description" TEXT DEFAULT '',
    "brand" TEXT,
    "variant" TEXT,
    "category" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "weight" TEXT,
    "minStock" INTEGER NOT NULL DEFAULT 10,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "unitSellingPrice" DOUBLE PRECISION NOT NULL,
    "commissionPercent" DOUBLE PRECISION NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "costingMethod" TEXT NOT NULL DEFAULT 'fifo',
    "standardCost" DOUBLE PRECISION,
    "costToSell" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "holdingCostPerUnit" DOUBLE PRECISION,
    "orderingCost" DOUBLE PRECISION NOT NULL DEFAULT 50000,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 7,
    "safetyStock" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "createdBy" TEXT,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundRecord" (
    "id" TEXT NOT NULL,
    "inboundId" TEXT NOT NULL,
    "vendorId" TEXT,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "brand" TEXT,
    "variant" TEXT,
    "qtyIn" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION,
    "inboundValue" DOUBLE PRECISION,
    "expiryDate" TIMESTAMP(3),
    "receivedBy" TEXT NOT NULL,
    "storedBy" TEXT,
    "storageLocation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "userComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundRecord" (
    "id" TEXT NOT NULL,
    "outboundId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "originalOrderNumber" TEXT,
    "userId" TEXT,
    "trackingNumber" TEXT,
    "vendorId" TEXT,
    "businessName" TEXT,
    "customerName" TEXT NOT NULL,
    "customerContact" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerAddress" TEXT,
    "productName" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "brand" TEXT,
    "variant" TEXT,
    "qty" INTEGER NOT NULL,
    "unitSellingPrice" DOUBLE PRECISION,
    "saleAmount" DOUBLE PRECISION,
    "assignedBy" TEXT,
    "assignedDriver" TEXT,
    "vehicleNumber" TEXT,
    "runsheetId" TEXT,
    "stopSequence" INTEGER,
    "actualDeliveredQty" INTEGER,
    "codCollected" DOUBLE PRECISION,
    "deliveryNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptDate" TIMESTAMP(3),
    "lastAttemptReason" TEXT,
    "lastAttemptDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRecord" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "referenceId" TEXT,
    "expectedQty" DOUBLE PRECISION NOT NULL,
    "actualQty" DOUBLE PRECISION NOT NULL,
    "variance" DOUBLE PRECISION NOT NULL,
    "varianceReason" TEXT,
    "reconciledBy" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RTVRecord" (
    "id" TEXT NOT NULL,
    "rtvId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RTVRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShrinkageRecord" (
    "id" TEXT NOT NULL,
    "shrinkageId" TEXT NOT NULL,
    "rtvId" TEXT,
    "merchantId" TEXT,
    "merchantName" TEXT,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION,
    "totalValue" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "debitMerchant" BOOLEAN NOT NULL DEFAULT false,
    "settledOnStatementId" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShrinkageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "nationalId" TEXT,
    "licenseNumber" TEXT,
    "vehicleType" TEXT,
    "vehicleNumber" TEXT,
    "createdBy" TEXT,
    "profileImage" TEXT,
    "dateHired" TIMESTAMP(3),
    "salaryAmount" DOUBLE PRECISION,
    "salaryPayDay" INTEGER NOT NULL DEFAULT 28,
    "status" TEXT NOT NULL DEFAULT 'active',
    "damages" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedBankings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "banked" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shiftStart" TIMESTAMP(3),
    "shiftEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverShift" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "shiftStart" TIMESTAMP(3) NOT NULL,
    "shiftEnd" TIMESTAMP(3),
    "durationHours" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverTrip" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "tripDate" TIMESTAMP(3) NOT NULL,
    "totalStops" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "codCollected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saleAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "distanceKm" DOUBLE PRECISION,
    "geoTracked" BOOLEAN NOT NULL DEFAULT false,
    "lastGeoLocation" TEXT,
    "runsheetId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "brand" TEXT,
    "variant" TEXT,
    "unitPrice" DOUBLE PRECISION,
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
    "disposition" TEXT,
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

-- CreateTable
CREATE TABLE "AfterSalesRecord" (
    "id" TEXT NOT NULL,
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
    "approvedAt" TIMESTAMP(3),
    "refundAmount" DOUBLE PRECISION,
    "replacementProductId" TEXT,
    "replacementProductName" TEXT,
    "returnTrackingNumber" TEXT,
    "itemIds" TEXT,
    "dispositions" TEXT,
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AfterSalesRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderProcessing" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerInfo" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new_order',
    "trackingNumber" TEXT,
    "invoiceGenerated" BOOLEAN NOT NULL DEFAULT false,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderProcessing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientName" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "oldPrice" DOUBLE PRECISION NOT NULL,
    "newPrice" DOUBLE PRECISION NOT NULL,
    "oldCost" DOUBLE PRECISION,
    "newCost" DOUBLE PRECISION,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "brand" TEXT,
    "variant" TEXT,
    "qty" INTEGER NOT NULL,
    "unitSellingPrice" DOUBLE PRECISION NOT NULL,
    "lineTotal" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudBlocklist" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "reason" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FraudBlocklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskScore" (
    "id" TEXT NOT NULL,
    "outboundId" TEXT NOT NULL,
    "customerContact" TEXT NOT NULL,
    "customerAddress" TEXT,
    "score" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "paymentPath" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskOverride" (
    "id" TEXT NOT NULL,
    "outboundId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "managerName" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRiskProfile" (
    "customerContact" TEXT NOT NULL,
    "customerType" TEXT NOT NULL DEFAULT 'retail',
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "codRefusals90d" INTEGER NOT NULL DEFAULT 0,
    "codDelivered90d" INTEGER NOT NULL DEFAULT 0,
    "distinctAddressesUsed" INTEGER NOT NULL DEFAULT 0,
    "firstOrderDate" TIMESTAMP(3),
    "lastOrderDate" TIMESTAMP(3),
    "avgAOV" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isBlocklisted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRiskProfile_pkey" PRIMARY KEY ("customerContact")
);

-- CreateTable
CREATE TABLE "RiskSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "inputType" TEXT NOT NULL,
    "helpText" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefaultRateCard" (
    "id" TEXT NOT NULL,
    "receivingFlatFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivingFlatHours" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "receivingHourlyAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inboundReceivingPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storagePerBinMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storagePerShelfMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storagePerPalletMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storagePerUnitPerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickFirstItemsIncluded" INTEGER NOT NULL DEFAULT 4,
    "pickPerAdditionalItem" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "packPerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fulfillmentFeePerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fulfillmentMinimumFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnProcessingPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnsPerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "codRemittanceFeePerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "codShortfallPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DefaultRateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCardTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "receivingFlatFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivingFlatHours" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "receivingHourlyAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inboundReceivingPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storagePerBinMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storagePerShelfMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storagePerPalletMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storagePerUnitPerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickFirstItemsIncluded" INTEGER NOT NULL DEFAULT 4,
    "pickPerAdditionalItem" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "packPerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fulfillmentFeePerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fulfillmentMinimumFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnProcessingPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnsPerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "codRemittanceFeePerOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "codShortfallPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateCardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryValuationSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'default',
    "defaultCostingMethod" TEXT NOT NULL DEFAULT 'fifo',
    "capitalCostRate" DOUBLE PRECISION NOT NULL DEFAULT 0.12,
    "storageCostRate" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "riskCostRate" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
    "serviceCostRate" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "varianceMaterialityPct" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "defaultCostToSellPct" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "daysInYear" INTEGER NOT NULL DEFAULT 365,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryValuationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NrvWriteDown" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "merchantId" TEXT,
    "merchantName" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'write_down',
    "qty" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "nrvPerUnit" DOUBLE PRECISION NOT NULL,
    "amountPerUnit" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "reversesId" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NrvWriteDown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_merchantId_key" ON "Merchant"("merchantId");

-- CreateIndex
CREATE INDEX "Merchant_isActive_idx" ON "Merchant"("isActive");

-- CreateIndex
CREATE INDEX "Merchant_isOnHold_idx" ON "Merchant"("isOnHold");

-- CreateIndex
CREATE INDEX "MerchantCommunication_merchantId_idx" ON "MerchantCommunication"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantCommunication_followUpAt_idx" ON "MerchantCommunication"("followUpAt");

-- CreateIndex
CREATE INDEX "MerchantCommunication_createdAt_idx" ON "MerchantCommunication"("createdAt");

-- CreateIndex
CREATE INDEX "DriverCommunication_driverId_idx" ON "DriverCommunication"("driverId");

-- CreateIndex
CREATE INDEX "DriverCommunication_outboundId_idx" ON "DriverCommunication"("outboundId");

-- CreateIndex
CREATE INDEX "DriverCommunication_followUpAt_idx" ON "DriverCommunication"("followUpAt");

-- CreateIndex
CREATE INDEX "DriverCommunication_createdAt_idx" ON "DriverCommunication"("createdAt");

-- CreateIndex
CREATE INDEX "MerchantRateCard_merchantId_idx" ON "MerchantRateCard"("merchantId");

-- CreateIndex
CREATE INDEX "StorageLiability_merchantId_idx" ON "StorageLiability"("merchantId");

-- CreateIndex
CREATE INDEX "StorageLiability_inboundId_idx" ON "StorageLiability"("inboundId");

-- CreateIndex
CREATE INDEX "StorageLiability_status_idx" ON "StorageLiability"("status");

-- CreateIndex
CREATE INDEX "StorageLiability_productId_idx" ON "StorageLiability"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverBanking_bankingId_key" ON "DriverBanking"("bankingId");

-- CreateIndex
CREATE INDEX "DriverBanking_driverId_idx" ON "DriverBanking"("driverId");

-- CreateIndex
CREATE INDEX "DriverBanking_runsheetId_idx" ON "DriverBanking"("runsheetId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantStatement_statementId_key" ON "MerchantStatement"("statementId");

-- CreateIndex
CREATE INDEX "MerchantStatement_merchantId_idx" ON "MerchantStatement"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantStatement_period_idx" ON "MerchantStatement"("period");

-- CreateIndex
CREATE INDEX "MerchantStatement_status_idx" ON "MerchantStatement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_chargeId_key" ON "Charge"("chargeId");

-- CreateIndex
CREATE INDEX "Charge_merchantId_idx" ON "Charge"("merchantId");

-- CreateIndex
CREATE INDEX "Charge_period_idx" ON "Charge"("period");

-- CreateIndex
CREATE INDEX "Charge_status_idx" ON "Charge"("status");

-- CreateIndex
CREATE INDEX "Charge_chargeType_idx" ON "Charge"("chargeType");

-- CreateIndex
CREATE UNIQUE INDEX "StatementDispute_disputeId_key" ON "StatementDispute"("disputeId");

-- CreateIndex
CREATE INDEX "StatementDispute_merchantId_idx" ON "StatementDispute"("merchantId");

-- CreateIndex
CREATE INDEX "StatementDispute_statementId_idx" ON "StatementDispute"("statementId");

-- CreateIndex
CREATE INDEX "StatementDispute_status_idx" ON "StatementDispute"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBatch_batchId_key" ON "PaymentBatch"("batchId");

-- CreateIndex
CREATE INDEX "PaymentBatch_status_idx" ON "PaymentBatch"("status");

-- CreateIndex
CREATE INDEX "PaymentBatch_createdAt_idx" ON "PaymentBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantPayment_paymentId_key" ON "MerchantPayment"("paymentId");

-- CreateIndex
CREATE INDEX "MerchantPayment_merchantId_idx" ON "MerchantPayment"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantPayment_year_month_idx" ON "MerchantPayment"("year", "month");

-- CreateIndex
CREATE INDEX "MerchantPayment_batchId_idx" ON "MerchantPayment"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_productId_key" ON "Product"("productId");

-- CreateIndex
CREATE INDEX "Product_merchantId_idx" ON "Product"("merchantId");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerId_key" ON "Customer"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_contact_key" ON "Customer"("contact");

-- CreateIndex
CREATE UNIQUE INDEX "InboundRecord_inboundId_key" ON "InboundRecord"("inboundId");

-- CreateIndex
CREATE INDEX "InboundRecord_merchantId_idx" ON "InboundRecord"("merchantId");

-- CreateIndex
CREATE INDEX "InboundRecord_productId_idx" ON "InboundRecord"("productId");

-- CreateIndex
CREATE INDEX "InboundRecord_status_idx" ON "InboundRecord"("status");

-- CreateIndex
CREATE INDEX "InboundRecord_createdAt_idx" ON "InboundRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundRecord_outboundId_key" ON "OutboundRecord"("outboundId");

-- CreateIndex
CREATE INDEX "OutboundRecord_status_idx" ON "OutboundRecord"("status");

-- CreateIndex
CREATE INDEX "OutboundRecord_assignedDriver_idx" ON "OutboundRecord"("assignedDriver");

-- CreateIndex
CREATE INDEX "OutboundRecord_runsheetId_idx" ON "OutboundRecord"("runsheetId");

-- CreateIndex
CREATE INDEX "OutboundRecord_vendorId_idx" ON "OutboundRecord"("vendorId");

-- CreateIndex
CREATE INDEX "OutboundRecord_productId_idx" ON "OutboundRecord"("productId");

-- CreateIndex
CREATE INDEX "OutboundRecord_createdAt_idx" ON "OutboundRecord"("createdAt");

-- CreateIndex
CREATE INDEX "OutboundRecord_deliveredAt_idx" ON "OutboundRecord"("deliveredAt");

-- CreateIndex
CREATE INDEX "OutboundRecord_dispatchedAt_idx" ON "OutboundRecord"("dispatchedAt");

-- CreateIndex
CREATE INDEX "OutboundRecord_customerContact_idx" ON "OutboundRecord"("customerContact");

-- CreateIndex
CREATE INDEX "ReconciliationRecord_createdAt_idx" ON "ReconciliationRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RTVRecord_rtvId_key" ON "RTVRecord"("rtvId");

-- CreateIndex
CREATE INDEX "RTVRecord_merchantId_idx" ON "RTVRecord"("merchantId");

-- CreateIndex
CREATE INDEX "RTVRecord_productId_idx" ON "RTVRecord"("productId");

-- CreateIndex
CREATE INDEX "RTVRecord_status_idx" ON "RTVRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ShrinkageRecord_shrinkageId_key" ON "ShrinkageRecord"("shrinkageId");

-- CreateIndex
CREATE INDEX "ShrinkageRecord_merchantId_idx" ON "ShrinkageRecord"("merchantId");

-- CreateIndex
CREATE INDEX "ShrinkageRecord_rtvId_idx" ON "ShrinkageRecord"("rtvId");

-- CreateIndex
CREATE INDEX "ShrinkageRecord_productId_idx" ON "ShrinkageRecord"("productId");

-- CreateIndex
CREATE INDEX "ShrinkageRecord_status_idx" ON "ShrinkageRecord"("status");

-- CreateIndex
CREATE INDEX "ShrinkageRecord_createdAt_idx" ON "ShrinkageRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_driverId_key" ON "Driver"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_phone_key" ON "Driver"("phone");

-- CreateIndex
CREATE INDEX "DriverShift_driverId_idx" ON "DriverShift"("driverId");

-- CreateIndex
CREATE INDEX "DriverShift_shiftStart_idx" ON "DriverShift"("shiftStart");

-- CreateIndex
CREATE UNIQUE INDEX "DriverTrip_tripId_key" ON "DriverTrip"("tripId");

-- CreateIndex
CREATE INDEX "DriverTrip_driverId_tripDate_idx" ON "DriverTrip"("driverId", "tripDate");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_itemId_key" ON "InventoryItem"("itemId");

-- CreateIndex
CREATE INDEX "InventoryItem_productId_idx" ON "InventoryItem"("productId");

-- CreateIndex
CREATE INDEX "InventoryItem_merchantId_idx" ON "InventoryItem"("merchantId");

-- CreateIndex
CREATE INDEX "InventoryItem_inboundId_idx" ON "InventoryItem"("inboundId");

-- CreateIndex
CREATE INDEX "InventoryItem_outboundId_idx" ON "InventoryItem"("outboundId");

-- CreateIndex
CREATE INDEX "InventoryItem_status_idx" ON "InventoryItem"("status");

-- CreateIndex
CREATE INDEX "InventoryItem_runsheetId_idx" ON "InventoryItem"("runsheetId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemEvent_eventId_key" ON "ItemEvent"("eventId");

-- CreateIndex
CREATE INDEX "ItemEvent_itemId_idx" ON "ItemEvent"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "AfterSalesRecord_afterSalesId_key" ON "AfterSalesRecord"("afterSalesId");

-- CreateIndex
CREATE INDEX "AfterSalesRecord_originalOrderId_idx" ON "AfterSalesRecord"("originalOrderId");

-- CreateIndex
CREATE INDEX "AfterSalesRecord_returnStatus_idx" ON "AfterSalesRecord"("returnStatus");

-- CreateIndex
CREATE INDEX "AfterSalesRecord_createdAt_idx" ON "AfterSalesRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderProcessing_orderId_key" ON "OrderProcessing"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderProcessing_orderNumber_key" ON "OrderProcessing"("orderNumber");

-- CreateIndex
CREATE INDEX "OrderProcessing_customerId_idx" ON "OrderProcessing"("customerId");

-- CreateIndex
CREATE INDEX "OrderProcessing_status_idx" ON "OrderProcessing"("status");

-- CreateIndex
CREATE INDEX "OrderProcessing_orderDate_idx" ON "OrderProcessing"("orderDate");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_module_idx" ON "AuditLog"("module");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_productId_idx" ON "ProductPriceHistory"("productId");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_changedAt_idx" ON "ProductPriceHistory"("changedAt");

-- CreateIndex
CREATE INDEX "OrderLineItem_orderId_idx" ON "OrderLineItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderLineItem_orderNumber_idx" ON "OrderLineItem"("orderNumber");

-- CreateIndex
CREATE INDEX "OrderLineItem_productId_idx" ON "OrderLineItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "FraudBlocklist_phone_key" ON "FraudBlocklist"("phone");

-- CreateIndex
CREATE INDEX "FraudBlocklist_address_idx" ON "FraudBlocklist"("address");

-- CreateIndex
CREATE INDEX "FraudBlocklist_isActive_idx" ON "FraudBlocklist"("isActive");

-- CreateIndex
CREATE INDEX "RiskScore_outboundId_idx" ON "RiskScore"("outboundId");

-- CreateIndex
CREATE INDEX "RiskScore_customerContact_idx" ON "RiskScore"("customerContact");

-- CreateIndex
CREATE INDEX "RiskScore_decision_idx" ON "RiskScore"("decision");

-- CreateIndex
CREATE INDEX "RiskScore_scoredAt_idx" ON "RiskScore"("scoredAt");

-- CreateIndex
CREATE INDEX "RiskOverride_outboundId_idx" ON "RiskOverride"("outboundId");

-- CreateIndex
CREATE INDEX "RiskOverride_createdAt_idx" ON "RiskOverride"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiskSetting_key_key" ON "RiskSetting"("key");

-- CreateIndex
CREATE INDEX "RiskSetting_category_idx" ON "RiskSetting"("category");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryValuationSetting_key_key" ON "InventoryValuationSetting"("key");

-- CreateIndex
CREATE INDEX "NrvWriteDown_productId_idx" ON "NrvWriteDown"("productId");

-- CreateIndex
CREATE INDEX "NrvWriteDown_status_idx" ON "NrvWriteDown"("status");

-- CreateIndex
CREATE INDEX "NrvWriteDown_createdAt_idx" ON "NrvWriteDown"("createdAt");

-- AddForeignKey
ALTER TABLE "DriverShift" ADD CONSTRAINT "DriverShift_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("driverId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverTrip" ADD CONSTRAINT "DriverTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("driverId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemEvent" ADD CONSTRAINT "ItemEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("itemId") ON DELETE RESTRICT ON UPDATE CASCADE;
