import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { logger } from "../../utils/logger.js";

/** Append-only audit trail for every money-relevant action. Never throws (must not break a payment). */
export async function audit(
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>,
  actorId?: string | null,
  tx?: Prisma.TransactionClient
) {
  try {
    await (tx ?? prisma).auditLog.create({
      data: { action, entityType, entityId, actorId: actorId ?? null, metadata: (metadata ?? {}) as Prisma.InputJsonValue },
    });
  } catch (err) {
    logger.error(`audit write failed for ${action}: ${(err as Error).message}`);
  }
}
