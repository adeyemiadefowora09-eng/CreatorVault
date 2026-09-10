import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/apiError.js";
import { CreateMilestoneInput, SubmitMilestoneInput, UpdateMilestoneInput } from "./milestones.validation.js";
import { applyTrustScoreEvent } from "../trust-score/trustScore.instance.js";
import { createNotification } from "../notifications/notifications.service.js";

async function verifyDealParty(dealId: string, userId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });

  if (!deal) throw ApiError.notFound("Deal");

  const isBrand = deal.brandId === userId;
  const isCreator = deal.creatorId === userId;

  if (!isBrand && !isCreator) {
    throw ApiError.forbidden("You are not a party to this deal");
  }

  return { deal, isBrand, isCreator };
}

export async function addMilestone(
  dealId: string,
  userId: string,
  data: CreateMilestoneInput
) {
  const { deal } = await verifyDealParty(dealId, userId);

  if (deal.brandId !== userId) {
    throw ApiError.forbidden("Only the brand can add milestones");
  }

  if (deal.status !== "DRAFT" && deal.status !== "NEGOTIATING") {
    throw ApiError.badRequest("Can only add milestones to DRAFT or NEGOTIATING deals");
  }

  const milestone = await prisma.milestone.create({
    data: {
      dealId,
      title: data.title,
      description: data.description,
      amount: data.amount,
      dueDate: new Date(data.dueDate),
      orderIndex: data.orderIndex,
    },
  });

  await createNotification({
    userId: deal.creatorId,
    type: "MILESTONE_ADDED",
    title: "New milestone added",
    message: `"${milestone.title}" was added to a deal you're part of.`,
    metadata: { dealId, milestoneId: milestone.id },
  });

  return milestone;
}

export async function listMilestones(dealId: string, userId: string) {
  await verifyDealParty(dealId, userId);

  return prisma.milestone.findMany({
    where: { dealId },
    orderBy: { orderIndex: "asc" },
    include: {
      payment: { select: { id: true, status: true, amount: true, paidAt: true } },
    },
  });
}

export async function updateMilestone(
  milestoneId: string,
  userId: string,
  data: UpdateMilestoneInput
) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { deal: true },
  });

  if (!milestone) throw ApiError.notFound("Milestone");
  if (milestone.deal.brandId !== userId) throw ApiError.forbidden("Only the brand can update milestones");
  if (milestone.status !== "PENDING") throw ApiError.badRequest("Can only update PENDING milestones");

  return prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      ...(data.title && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.amount && { amount: data.amount }),
      ...(data.dueDate && { dueDate: new Date(data.dueDate) }),
      ...(data.orderIndex !== undefined && { orderIndex: data.orderIndex }),
    },
  });
}

/**
 * Previously this just flipped status to SUBMITTED with no content —
 * there was nothing for the brand to actually look at before approving
 * or paying. Now requires (and stores) a note and/or a link.
 */
export async function submitMilestone(
  milestoneId: string,
  userId: string,
  data: SubmitMilestoneInput
) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { deal: true },
  });

  if (!milestone) throw ApiError.notFound("Milestone");
  if (milestone.deal.creatorId !== userId) throw ApiError.forbidden("Only the creator can submit milestones");

  const submittable = ["PENDING", "IN_PROGRESS"];
  if (!submittable.includes(milestone.status)) {
    throw ApiError.badRequest("This milestone cannot be submitted");
  }

  const updated = await prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      status: "SUBMITTED",
      submissionNote: data.submissionNote ?? null,
      submissionUrl: data.submissionUrl ?? null,
      submittedAt: new Date(),
    },
  });

  await createNotification({
    userId: milestone.deal.brandId,
    type: "MILESTONE_SUBMITTED",
    title: "Milestone submitted for review",
    message: `"${milestone.title}" was submitted and is ready for your review.`,
    metadata: { dealId: milestone.dealId, milestoneId: milestone.id },
  });

  return updated;
}

export async function approveMilestone(milestoneId: string, userId: string) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { deal: true },
  });

  if (!milestone) throw ApiError.notFound("Milestone");
  if (milestone.deal.brandId !== userId) throw ApiError.forbidden("Only the brand can approve milestones");
  if (milestone.status !== "SUBMITTED") throw ApiError.badRequest("Only SUBMITTED milestones can be approved");

  const updated = await prisma.milestone.update({
    where: { id: milestoneId },
    data: { status: "APPROVED" },
  });

  if (new Date() <= milestone.dueDate) {
    await applyTrustScoreEvent({
      type: "TIMELY_MILESTONE_DELIVERY",
      userId: milestone.deal.creatorId,
      sourceId: milestone.id,
    });
  }

  await createNotification({
    userId: milestone.deal.creatorId,
    type: "MILESTONE_APPROVED",
    title: "Milestone approved",
    message: `"${milestone.title}" was approved. Payment can now be initiated.`,
    metadata: { dealId: milestone.dealId, milestoneId: milestone.id },
  });

  return updated;
}

export async function rejectMilestone(
  milestoneId: string,
  userId: string,
  reason: string
) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { deal: true },
  });

  if (!milestone) throw ApiError.notFound("Milestone");
  if (milestone.deal.brandId !== userId) throw ApiError.forbidden("Only the brand can reject milestones");
  if (milestone.status !== "SUBMITTED") throw ApiError.badRequest("Only SUBMITTED milestones can be rejected");

  const updated = await prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      status: "IN_PROGRESS",
      description: milestone.description
        ? `${milestone.description}\n\n[Rejected: ${reason}]`
        : `[Rejected: ${reason}]`,
    },
  });

  await createNotification({
    userId: milestone.deal.creatorId,
    type: "MILESTONE_REJECTED",
    title: "Milestone sent back",
    message: `"${milestone.title}" was rejected: ${reason}`,
    metadata: { dealId: milestone.dealId, milestoneId: milestone.id },
  });

  return updated;
}

export async function deleteMilestone(milestoneId: string, userId: string) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { deal: true },
  });

  if (!milestone) throw ApiError.notFound("Milestone");
  if (milestone.deal.brandId !== userId) throw ApiError.forbidden("Only the brand can delete milestones");
  if (milestone.status !== "PENDING") throw ApiError.badRequest("Can only delete PENDING milestones");
  if (milestone.deal.status !== "DRAFT") throw ApiError.badRequest("Can only delete milestones on DRAFT deals");

  await prisma.milestone.delete({ where: { id: milestoneId } });
}
