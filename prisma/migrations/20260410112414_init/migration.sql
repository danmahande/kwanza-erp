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
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
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
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productLabel" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "minStock" INTEGER NOT NULL DEFAULT 10,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "unitSellingPrice" DOUBLE PRECISION NOT NULL,
    "commissionPercent" DOUBLE PRECISION NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
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
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyIn" INTEGER NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "receivedBy" TEXT NOT NULL,
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
    "customerName" TEXT NOT NULL,
    "customerContact" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "assignedDriver" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
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
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShrinkageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "vehicleNumber" TEXT,
    "licenseNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
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
