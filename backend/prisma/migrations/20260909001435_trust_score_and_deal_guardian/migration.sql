-- CreateTable
CREATE TABLE "trust_score_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "resultingScore" INTEGER NOT NULL,
    "sourceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_score_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_guardian_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dealTitle" TEXT NOT NULL,
    "counterpartyName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "safetyScore" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "flaggedClauses" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_guardian_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trust_score_events_userId_createdAt_idx" ON "trust_score_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "deal_guardian_reports_userId_analyzedAt_idx" ON "deal_guardian_reports"("userId", "analyzedAt");

-- AddForeignKey
ALTER TABLE "trust_score_events" ADD CONSTRAINT "trust_score_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_guardian_reports" ADD CONSTRAINT "deal_guardian_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
