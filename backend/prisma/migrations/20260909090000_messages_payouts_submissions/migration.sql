-- Fills the core "actual app people can use" gaps:
--  1. Messaging: creators/brands previously had no way to contact each
--     other except copying a raw user ID from Discover. Adds a per-deal
--     Message thread.
--  2. Payouts: a COMPLETED Payment only ever meant money landed in the
--     platform's own Payaza account. Adds bank details on CreatorProfile
--     and a Payout model/status enum to actually move money out to creators.
--  3. Milestone submissions: submitMilestone() used to just flip a status
--     enum with no content — the brand had nothing to review before
--     approving/paying. Adds submissionNote/submissionUrl/submittedAt.

-- Payout status enum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- Bank details on CreatorProfile (nullable — not every creator has set these up yet)
ALTER TABLE "creator_profiles" ADD COLUMN "bankAccountName" TEXT;
ALTER TABLE "creator_profiles" ADD COLUMN "bankAccountNumber" TEXT;
ALTER TABLE "creator_profiles" ADD COLUMN "bankName" TEXT;
ALTER TABLE "creator_profiles" ADD COLUMN "bankCode" TEXT;

-- Submission content on Milestone
ALTER TABLE "milestones" ADD COLUMN "submissionNote" TEXT;
ALTER TABLE "milestones" ADD COLUMN "submissionUrl" TEXT;
ALTER TABLE "milestones" ADD COLUMN "submittedAt" TIMESTAMP(3);

-- Payouts
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "bankAccountNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payouts_userId_idx" ON "payouts"("userId");

ALTER TABLE "payouts" ADD CONSTRAINT "payouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Messages
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messages_dealId_createdAt_idx" ON "messages"("dealId", "createdAt");

ALTER TABLE "messages" ADD CONSTRAINT "messages_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
