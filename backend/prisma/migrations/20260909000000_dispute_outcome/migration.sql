-- Adds dispute resolution outcome tracking so a dispute can be resolved
-- (UPHELD or DISMISSED) instead of staying OPEN forever, and so the trust
-- score penalty only applies once a dispute is actually decided against the
-- respondent, not the moment it's filed.

CREATE TYPE "DisputeOutcome" AS ENUM ('UPHELD', 'DISMISSED');

ALTER TABLE "disputes" ADD COLUMN "outcome" "DisputeOutcome";
ALTER TABLE "disputes" ADD COLUMN "resolvedById" TEXT;
