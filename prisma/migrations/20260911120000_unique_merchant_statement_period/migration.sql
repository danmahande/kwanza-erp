-- Prevent concurrent or repeated generation of two statements for one merchant period.
CREATE UNIQUE INDEX "MerchantStatement_merchantId_period_key"
ON "MerchantStatement"("merchantId", "period");