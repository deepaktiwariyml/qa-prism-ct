-- CreateTable
CREATE TABLE "LlmUsageDaily" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmUsageDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmUsageDaily_day_idx" ON "LlmUsageDaily"("day");

-- CreateIndex
CREATE UNIQUE INDEX "LlmUsageDaily_day_model_operation_key" ON "LlmUsageDaily"("day", "model", "operation");
