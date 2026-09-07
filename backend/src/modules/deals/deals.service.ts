import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/apiError.js";
import { getPaginationMeta } from "../../types/index.js";
import { CreateDealInput, UpdateDealInput, ListDealsQuery } from "./deals.validation.js";

const dealInclude = {
  creator: { select: { id: true, name: true, avatarUrl: true, trustScore: true } },
  brand: { select: { id: true, name: true, avatarUrl: true, trustScore: true } },
  milestones: { orderBy: { orderIndex: "asc" as const } },
  contract: { include: { analysis: true } },
  _count: { select: { payments: true, reviews: true, disputes: true } },
};

export async function createDeal(brandId: string, data: CreateDealInput) {
  // Verify creator exists
  const creator = await prisma.user.findUnique({
    where: { id: data.creatorId },
  });

  if (!creator || creator.role !== "CREATOR") {
    throw ApiError.badRequest("Invalid creator ID");
  }

  const deal = await prisma.deal.create({
    data: {
      brandId,
      creatorId: data.creatorId,
      title: data.title,
      description: data.description,
      amount: data.amount,
      currency: data.currency,
      deliverables: data.deliverables as any,
      deadline: new Date(data.deadline),
    },
    include: dealInclude,
  });

  return deal;
}

export async function listDeals(userId: string, query: ListDealsQuery) {
  const { page, limit, status, role } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.DealWhereInput = {
    ...(status && { status }),
    ...(role === "as_creator" && { creatorId: userId }),
    ...(role === "as_brand" && { brandId: userId }),
    ...(!role && {
      OR: [{ creatorId: userId }, { brandId: userId }],
    }),
  };

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: dealInclude,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.deal.count({ where }),
  ]);

  return {
    items: deals,
    meta: getPaginationMeta(page, limit, total),
  };
}

export async function getDealById(dealId: string, userId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      ...dealInclude,
      payments: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!deal) {
    throw ApiError.notFound("Deal");
  }

  if (deal.creatorId !== userId && deal.brandId !== userId) {
    throw ApiError.forbidden("You are not a party to this deal");
  }

  return deal;
}

export async function updateDeal(
  dealId: string,
  userId: string,
  data: UpdateDealInput
) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });

  if (!deal) {
    throw ApiError.notFound("Deal");
  }

  if (deal.brandId !== userId) {
    throw ApiError.forbidden("Only the brand can update this deal");
  }

  if (deal.status !== "DRAFT" && deal.status !== "NEGOTIATING") {
    throw ApiError.badRequest("Can only update deals in DRAFT or NEGOTIATING status");
  }

  const updated = await prisma.deal.update({
    where: { id: dealId },
    data: {
      ...(data.title && { title: data.title }),
      ...(data.description && { description: data.description }),
      ...(data.amount && { amount: data.amount }),
      ...(data.currency && { currency: data.currency }),
      ...(data.deliverables && { deliverables: data.deliverables as any }),
      ...(data.deadline && { deadline: new Date(data.deadline) }),
    },
    include: dealInclude,
  });

  return updated;
}

export async function proposeDeal(dealId: string, userId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });

  if (!deal) throw ApiError.notFound("Deal");
  if (deal.brandId !== userId) throw ApiError.forbidden("Only the brand can propose this deal");
  if (deal.status !== "DRAFT") throw ApiError.badRequest("Only DRAFT deals can be proposed");

  return prisma.deal.update({
    where: { id: dealId },
    data: { status: "PROPOSED" },
    include: dealInclude,
  });
}

export async function acceptDeal(dealId: string, userId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });

  if (!deal) throw ApiError.notFound("Deal");
  if (deal.creatorId !== userId) throw ApiError.forbidden("Only the assigned creator can accept");
  if (deal.status !== "PROPOSED") throw ApiError.badRequest("Only PROPOSED deals can be accepted");

  return prisma.deal.update({
    where: { id: dealId },
    data: { status: "ACTIVE" },
    include: dealInclude,
  });
}

export async function declineDeal(dealId: string, userId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });

  if (!deal) throw ApiError.notFound("Deal");
  if (deal.creatorId !== userId) throw ApiError.forbidden("Only the assigned creator can decline");
  if (deal.status !== "PROPOSED") throw ApiError.badRequest("Only PROPOSED deals can be declined");

  return prisma.deal.update({
    where: { id: dealId },
    data: { status: "CANCELLED" },
    include: dealInclude,
  });
}

export async function completeDeal(dealId: string, userId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { milestones: true },
  });

  if (!deal) throw ApiError.notFound("Deal");
  if (deal.brandId !== userId) throw ApiError.forbidden("Only the brand can complete this deal");
  if (deal.status !== "ACTIVE") throw ApiError.badRequest("Only ACTIVE deals can be completed");

  const unpaid = deal.milestones.filter((m) => m.status !== "PAID");
  if (unpaid.length > 0) {
    throw ApiError.badRequest("All milestones must be paid before completing the deal");
  }

  // Update completed deal counts
  await Promise.all([
    prisma.creatorProfile.updateMany({
      where: { userId: deal.creatorId },
      data: { completedDeals: { increment: 1 } },
    }),
    prisma.brandProfile.updateMany({
      where: { userId: deal.brandId },
      data: { completedDeals: { increment: 1 } },
    }),
  ]);

  return prisma.deal.update({
    where: { id: dealId },
    data: { status: "COMPLETED" },
    include: dealInclude,
  });
}

export async function cancelDeal(dealId: string, userId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { milestones: true },
  });

  if (!deal) throw ApiError.notFound("Deal");

  if (deal.creatorId !== userId && deal.brandId !== userId) {
    throw ApiError.forbidden("You are not a party to this deal");
  }

  const cancellable = ["DRAFT", "PROPOSED", "NEGOTIATING", "ACTIVE"];
  if (!cancellable.includes(deal.status)) {
    throw ApiError.badRequest("This deal cannot be cancelled");
  }

  if (deal.status === "ACTIVE") {
    const paidMilestones = deal.milestones.filter((m) => m.status === "PAID");
    if (paidMilestones.length > 0) {
      throw ApiError.badRequest("Cannot cancel a deal with paid milestones");
    }
  }

  return prisma.deal.update({
    where: { id: dealId },
    data: { status: "CANCELLED" },
    include: dealInclude,
  });
}

export async function deleteDeal(dealId: string, userId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });

  if (!deal) throw ApiError.notFound("Deal");
  if (deal.brandId !== userId) throw ApiError.forbidden("Only the brand can delete this deal");
  if (deal.status !== "DRAFT") throw ApiError.badRequest("Only DRAFT deals can be deleted");

  await prisma.deal.delete({ where: { id: dealId } });
}
