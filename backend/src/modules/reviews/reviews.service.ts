import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/apiError.js";

export async function createReview(userId: string, data: any) {
  const deal = await prisma.deal.findUnique({ where: { id: data.dealId } });
  if (!deal) throw ApiError.notFound("Deal");
  if (deal.status !== "COMPLETED") throw ApiError.badRequest("Deal must be completed");

  const isCreator = deal.creatorId === userId;
  const isBrand = deal.brandId === userId;
  if (!isCreator && !isBrand) throw ApiError.forbidden("Not a party to this deal");

  const revieweeId = isCreator ? deal.brandId : deal.creatorId;

  return prisma.review.create({
    data: {
      dealId: data.dealId,
      reviewerId: userId,
      revieweeId,
      rating: data.rating,
      comment: data.comment,
    }
  });
}

export async function getReviewsForDeal(dealId: string) {
  return prisma.review.findMany({ where: { dealId } });
}
