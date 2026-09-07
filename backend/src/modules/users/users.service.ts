import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/apiError.js";
import { getPaginationMeta } from "../../types/index.js";
import { calculateTrustScore } from "../../utils/trustScore.js";
import {
  UpdateProfileInput,
  UpdateCreatorProfileInput,
  UpdateBrandProfileInput,
  ListUsersQuery,
} from "./users.validation.js";

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  bio: true,
  country: true,
  trustScore: true,
  createdAt: true,
  updatedAt: true,
  creatorProfile: true,
  brandProfile: true,
};

export async function listUsers(query: ListUsersQuery) {
  const { page, limit, role, search } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {
    ...(role && { role }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: users,
    meta: getPaginationMeta(page, limit, total),
  };
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: userSelect,
  });

  if (!user) {
    throw ApiError.notFound("User");
  }

  return user;
}

export async function updateProfile(userId: string, data: UpdateProfileInput) {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: userSelect,
  });

  return user;
}

export async function updateCreatorProfile(
  userId: string,
  data: UpdateCreatorProfileInput
) {
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    throw ApiError.forbidden("Only creators can update creator profile");
  }

  return prisma.creatorProfile.update({
    where: { userId },
    data,
  });
}

export async function updateBrandProfile(
  userId: string,
  data: UpdateBrandProfileInput
) {
  const profile = await prisma.brandProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    throw ApiError.forbidden("Only brands can update brand profile");
  }

  return prisma.brandProfile.update({
    where: { userId },
    data,
  });
}

export async function getUserTrustScore(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw ApiError.notFound("User");
  }

  const [completedDeals, totalDeals, disputeCount, reviews] = await Promise.all([
    prisma.deal.count({
      where: {
        OR: [{ creatorId: userId }, { brandId: userId }],
        status: "COMPLETED",
      },
    }),
    prisma.deal.count({
      where: {
        OR: [{ creatorId: userId }, { brandId: userId }],
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
    }),
    prisma.dispute.count({
      where: { raisedById: userId },
    }),
    prisma.review.findMany({
      where: { revieweeId: userId },
      select: { rating: true },
    }),
  ]);

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  const accountAgeDays = Math.floor(
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const score = calculateTrustScore({
    completedDeals,
    totalDeals,
    onTimeRate: totalDeals > 0 ? completedDeals / totalDeals : 0.5,
    avgRating,
    disputeCount,
    accountAgeDays,
  });

  // Persist updated score
  await prisma.user.update({
    where: { id: userId },
    data: { trustScore: score },
  });

  return {
    score,
    breakdown: {
      completedDeals,
      totalDeals,
      avgRating: Math.round(avgRating * 100) / 100,
      disputeCount,
      accountAgeDays,
      reviewCount: reviews.length,
    },
  };
}

export async function getUserReviews(
  userId: string,
  page: number,
  limit: number
) {
  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { revieweeId: userId },
      include: {
        reviewer: { select: { id: true, name: true, avatarUrl: true } },
        deal: { select: { id: true, title: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.review.count({ where: { revieweeId: userId } }),
  ]);

  return {
    items: reviews,
    meta: getPaginationMeta(page, limit, total),
  };
}
