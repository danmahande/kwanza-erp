CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "currencyName" TEXT NOT NULL,
  "taxRegime" TEXT NOT NULL,
  "standardTaxRate" DOUBLE PRECISION NOT NULL,
  "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
  "accountingFramework" TEXT NOT NULL DEFAULT 'IFRS',
  "inventoryCostingMethod" TEXT NOT NULL DEFAULT 'fifo',
  "revenueRecognitionPolicy" TEXT NOT NULL DEFAULT 'delivery',
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "policyStatus" TEXT NOT NULL DEFAULT 'review_required',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE INDEX "Tenant_countryCode_idx" ON "Tenant"("countryCode");

CREATE TABLE "TenantTaxRate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rate" DOUBLE PRECISION NOT NULL,
  "inclusive" BOOLEAN NOT NULL DEFAULT false,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "sourceUrl" TEXT,
  "sourceCheckedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'review_required',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantTaxRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantTaxRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TenantTaxRate_tenantId_code_effectiveFrom_key" ON "TenantTaxRate"("tenantId", "code", "effectiveFrom");
CREATE INDEX "TenantTaxRate_tenantId_status_idx" ON "TenantTaxRate"("tenantId", "status");