import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/apiError.js";
import { getPaginationMeta } from "../../types/index.js";
import { trustScoreService } from "../trust-score/trustScore.instance.js";
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

/**
 * Returns the canonical, event-sourced trust score (see
 * modules/trust-score/). This used to run its own ad hoc weighted formula
 * (utils/trustScore.ts) on every call and silently overwrite User.trustScore
 * with a different number than the rule-based score the plan specifies and
 * the frontend's /trust-score/me route already returns — that formula is
 * retired in favor of one canonical implementation. utils/trustScore.ts is
 * left in place only as dead code for reference; nothing calls it anymore.
 */
export async function getUserTrustScore(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw ApiError.notFound("User");
  }

  const record = await trustScoreService.getOrCreateScore(userId);
  return {
    score: record.score,
    history: record.history,
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
