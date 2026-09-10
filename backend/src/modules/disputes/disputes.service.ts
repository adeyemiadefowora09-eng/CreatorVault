import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/apiError.js";
import { applyTrustScoreEvent } from "../trust-score/trustScore.instance.js";
import { createNotification } from "../notifications/notifications.service.js";
import { ResolveDisputeInput } from "./disputes.validation.js";

export async function createDispute(userId: string, data: any) {
  const deal = await prisma.deal.findUnique({ where: { id: data.dealId } });
  if (!deal) throw ApiError.notFound("Deal");
  if (deal.creatorId !== userId && deal.brandId !== userId) {
    throw ApiError.forbidden("Not a party to this deal");
  }

  const dispute = await prisma.dispute.create({
    data: {
      dealId: data.dealId,
      raisedById: userId,
      reason: data.reason,
      status: "OPEN",
    }
  });

  await prisma.deal.update({ where: { id: data.dealId }, data: { status: "DISPUTED" }});

  // NOTE: the trust score penalty no longer applies here. Filing a dispute is
  // an accusation, not a finding — docking the other party's score the
  // moment someone files would let anyone tank a counterparty's trust score
  // with no review. The penalty now only applies in resolveDispute(), and
  // only when the outcome is UPHELD against the respondent.

  const respondentId = deal.creatorId === userId ? deal.brandId : deal.creatorId;
  await createNotification({
    userId: respondentId,
    type: "DISPUTE_OPENED",
    title: "Dispute opened",
    message: `A dispute was opened on "${deal.title}".`,
    metadata: { dealId: deal.id, disputeId: dispute.id },
  });

  return dispute;
}

export async function listDisputes(userId: string) {
  return prisma.dispute.findMany({
    where: { OR: [{ deal: { creatorId: userId } }, { deal: { brandId: userId } }] },
    include: { deal: true }
  });
}

/**
 * Resolve an OPEN/UNDER_REVIEW dispute. Restricted to ADMIN via the route's
 * requireRole middleware — resolution is a platform decision, not something
 * either party to the deal should be able to do for themselves.
 *
 * - UPHELD: the dispute was valid. Docks the respondent's (non-raiser's)
 *   trust score and leaves the deal in DISPUTED status.
 * - DISMISSED: the dispute was not upheld. No trust score penalty, and the
 *   deal returns to ACTIVE so it can continue.
 */
export async function resolveDispute(
  disputeId: string,
  resolverId: string,
  data: ResolveDisputeInput
) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { deal: true },
  });

  if (!dispute) throw ApiError.notFound("Dispute");

  if (dispute.status === "RESOLVED") {
    throw ApiError.badRequest("This dispute has already been resolved");
  }

  const updated = await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status: "RESOLVED",
      outcome: data.outcome,
      resolution: data.resolution,
      resolvedById: resolverId,
      resolvedAt: new Date(),
    },
  });

  if (data.outcome === "UPHELD") {
    const respondentId =
      dispute.deal.creatorId === dispute.raisedById
        ? dispute.deal.brandId
        : dispute.deal.creatorId;

    await applyTrustScoreEvent({
      type: "DISPUTE_OPENED_OR_LOST",
      userId: respondentId,
      sourceId: dispute.id,
    });
    // Deal stays DISPUTED — brand/creator should cancel or otherwise wind it
    // down; we don't auto-cancel here since paid milestones may need manual
    // handling.
  } else {
    // DISMISSED — nothing was wrong, let the deal continue.
    await prisma.deal.update({
      where: { id: dispute.dealId },
      data: { status: "ACTIVE" },
    });
  }

  await Promise.all([
    createNotification({
      userId: dispute.raisedById,
      type: "DISPUTE_RESOLVED",
      title: "Dispute resolved",
      message: `Your dispute on "${dispute.deal.title}" was resolved: ${data.outcome}.`,
      metadata: { dealId: dispute.dealId, disputeId: dispute.id },
    }),
    createNotification({
      userId:
        dispute.deal.creatorId === dispute.raisedById
          ? dispute.deal.brandId
          : dispute.deal.creatorId,
      type: "DISPUTE_RESOLVED",
      title: "Dispute resolved",
      message: `The dispute on "${dispute.deal.title}" was resolved: ${data.outcome}.`,
      metadata: { dealId: dispute.dealId, disputeId: dispute.id },
    }),
  ]);

  return updated;
}
