-- CreateEnum
CREATE TYPE "TargetKind" AS ENUM ('url', 'repo');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "Pillar" AS ENUM ('automation', 'accessibility', 'security', 'performance');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('critical', 'high', 'medium', 'low', 'info');

-- CreateEnum
CREATE TYPE "TicketProvider" AS ENUM ('jira', 'linear');

-- CreateTable
CREATE TABLE "Target" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TargetKind" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "pillar" "Pillar" NOT NULL,
    "severity" "Severity" NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" JSONB NOT NULL,
    "remediation" TEXT NOT NULL,
    "tags" TEXT[],
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanScore" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "overall" DOUBLE PRECISION NOT NULL,
    "pillars" JSONB NOT NULL,
    "correlations" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpactReport" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "prUrl" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "areas" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpactReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "provider" "TicketProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Target_createdAt_idx" ON "Target"("createdAt");

-- CreateIndex
CREATE INDEX "Scan_targetId_createdAt_idx" ON "Scan"("targetId", "createdAt");

-- CreateIndex
CREATE INDEX "Finding_scanId_pillar_idx" ON "Finding"("scanId", "pillar");

-- CreateIndex
CREATE INDEX "Finding_code_idx" ON "Finding"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ScanScore_scanId_key" ON "ScanScore"("scanId");

-- CreateIndex
CREATE INDEX "ImpactReport_targetId_createdAt_idx" ON "ImpactReport"("targetId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_findingId_idx" ON "Ticket"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_findingId_provider_key" ON "Ticket"("findingId", "provider");

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanScore" ADD CONSTRAINT "ScanScore_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactReport" ADD CONSTRAINT "ImpactReport_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

