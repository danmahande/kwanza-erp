-- CreateTable: DriverCommunication
CREATE TABLE "DriverCommunication" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "followUpAt" DATETIME,
    "isResolved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DriverCommunication_driverId_idx" ON "DriverCommunication"("driverId");
CREATE INDEX "DriverCommunication_outboundId_idx" ON "DriverCommunication"("outboundId");
CREATE INDEX "DriverCommunication_followUpAt_idx" ON "DriverCommunication"("followUpAt");
CREATE INDEX "DriverCommunication_createdAt_idx" ON "DriverCommunication"("createdAt");
