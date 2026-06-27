-- AlterTable
ALTER TABLE "OutboundRecord" ADD COLUMN     "assignedBy" TEXT,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "orderNumber" TEXT,
ADD COLUMN     "saleAmount" DOUBLE PRECISION,
ADD COLUMN     "trackingNumber" TEXT,
ADD COLUMN     "unitSellingPrice" DOUBLE PRECISION,
ADD COLUMN     "userId" TEXT,
ADD COLUMN     "variant" TEXT,
ADD COLUMN     "vendorId" TEXT;
