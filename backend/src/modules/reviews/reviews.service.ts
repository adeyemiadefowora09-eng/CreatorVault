import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/apiError.js";
import { applyTrustScoreReview } from "../trust-score/trustScore.instance.js";
import { createNotification } from "../notifications/notifications.service.js";

export async function createReview(userId: string, data: any) {
  const deal = await prisma.deal.findUnique({ where: { id: data.dealId } });
  if (!deal) throw ApiError.notFound("Deal");
  if (deal.status !== "COMPLETED") throw ApiError.badRequest("Deal must be completed");

  const isCreator = deal.creatorId === userId;
  const isBrand = deal.brandId === userId;
  if (!isCreator && !isBrand) throw ApiError.forbidden("Not a party to this deal");

  const revieweeId = isCreator ? deal.brandId : deal.creatorId;

  const review = await prisma.review.create({
    data: {
      dealId: data.dealId,
      reviewerId: userId,
      revieweeId,
      rating: data.rating,
      comment: data.comment,
    }
  });

  // Only awards points above 4.5 stars — see TrustScoreService.applyReview.
  await applyTrustScoreReview(revieweeId, review.id, data.rating);

  await createNotification({
    userId: revieweeId,
    type: "REVIEW_RECEIVED",
    title: "New review",
    message: `You received a ${data.rating}/5 review on "${deal.title}".`,
    metadata: { dealId: deal.id, reviewId: review.id },
  });

  return review;
}

export async function getReviewsForDeal(dealId: string) {
  return prisma.review.findMany({ where: { dealId } });
}
