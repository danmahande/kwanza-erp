-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MerchantPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "comment" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "productLabel" TEXT NOT NULL,
    "brand" TEXT,
    "variant" TEXT,
    "category" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "weight" TEXT,
    "minStock" INTEGER NOT NULL DEFAULT 10,
    "unitCost" REAL NOT NULL,
    "unitSellingPrice" REAL NOT NULL,
    "commissionPercent" REAL NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "createdBy" TEXT,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalOrderValue" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InboundRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inboundId" TEXT NOT NULL,
    "vendorId" TEXT,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "brand" TEXT,
    "variant" TEXT,
    "qtyIn" INTEGER NOT NULL,
    "unitPrice" REAL,
    "inboundValue" REAL,
    "expiryDate" DATETIME,
    "receivedBy" TEXT NOT NULL,
    "storedBy" TEXT,
    "storageLocation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "userComment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OutboundRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outboundId" TEXT NOT NULL,
    "orderNumber" TEXT,
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
    "unitSellingPrice" REAL,
    "saleAmount" REAL,
    "assignedBy" TEXT,
    "assignedDriver" TEXT,
    "vehicleNumber" TEXT,
    "runsheetId" TEXT,
    "stopSequence" INTEGER,
    "actualDeliveredQty" INTEGER,
    "codCollected" REAL,
    "deliveryNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dispatchedAt" DATETIME,
    "deliveredAt" DATETIME,
    "cancellationReason" TEXT,
    "cancelledAt" DATETIME,
    "cancelledBy" TEXT,
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptDate" DATETIME,
    "lastAttemptReason" TEXT,
    "lastAttemptDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReconciliationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "referenceId" TEXT,
    "expectedQty" REAL NOT NULL,
    "actualQty" REAL NOT NULL,
    "variance" REAL NOT NULL,
    "varianceReason" TEXT,
    "reconciledBy" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RTVRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rtvId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "processedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShrinkageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shrinkageId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "nationalId" TEXT,
    "licenseNumber" TEXT,
    "vehicleType" TEXT,
    "vehicleNumber" TEXT,
    "createdBy" TEXT,
    "profileImage" TEXT,
    "dateHired" DATETIME,
    "salaryAmount" REAL,
    "salaryPayDay" INTEGER NOT NULL DEFAULT 28,
    "status" TEXT NOT NULL DEFAULT 'active',
    "damages" REAL NOT NULL DEFAULT 0,
    "loss" REAL NOT NULL DEFAULT 0,
    "expectedBankings" REAL NOT NULL DEFAULT 0,
    "banked" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DriverTrip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "tripDate" DATETIME NOT NULL,
    "totalStops" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "codCollected" REAL NOT NULL DEFAULT 0,
    "saleAmount" REAL NOT NULL DEFAULT 0,
    "distanceKm" REAL,
    "geoTracked" BOOLEAN NOT NULL DEFAULT false,
    "lastGeoLocation" TEXT,
    "runsheetId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DriverTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("driverId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "brand" TEXT,
    "variant" TEXT,
    "unitPrice" REAL,
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
    "expiryDate" DATETIME,
    "assignedRider" TEXT,
    "runsheetId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptDate" DATETIME,
    "finalOutcome" TEXT,
    "cancellationReason" TEXT,
    "cancelledAt" DATETIME,
    "cancelledBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ItemEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem" ("itemId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_merchantId_key" ON "Merchant"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantPayment_paymentId_key" ON "MerchantPayment"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_productId_key" ON "Product"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerId_key" ON "Customer"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_contact_key" ON "Customer"("contact");

-- CreateIndex
CREATE UNIQUE INDEX "InboundRecord_inboundId_key" ON "InboundRecord"("inboundId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundRecord_outboundId_key" ON "OutboundRecord"("outboundId");

-- CreateIndex
CREATE UNIQUE INDEX "RTVRecord_rtvId_key" ON "RTVRecord"("rtvId");

-- CreateIndex
CREATE UNIQUE INDEX "ShrinkageRecord_shrinkageId_key" ON "ShrinkageRecord"("shrinkageId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_driverId_key" ON "Driver"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverTrip_tripId_key" ON "DriverTrip"("tripId");

-- CreateIndex
CREATE INDEX "DriverTrip_driverId_tripDate_idx" ON "DriverTrip"("driverId", "tripDate");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_itemId_key" ON "InventoryItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemEvent_eventId_key" ON "ItemEvent"("eventId");

-- CreateIndex
CREATE INDEX "ItemEvent_itemId_idx" ON "ItemEvent"("itemId");
