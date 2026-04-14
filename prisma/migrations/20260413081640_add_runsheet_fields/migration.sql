-- AlterTable
ALTER TABLE "OutboundRecord" ADD COLUMN     "actualDeliveredQty" INTEGER,
ADD COLUMN     "codCollected" DOUBLE PRECISION,
ADD COLUMN     "customerAddress" TEXT,
ADD COLUMN     "deliveryNotes" TEXT,
ADD COLUMN     "runsheetId" TEXT,
ADD COLUMN     "stopSequence" INTEGER,
ADD COLUMN     "vehicleNumber" TEXT;
