import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/apiError.js";

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
  return dispute;
}

export async function listDisputes(userId: string) {
  return prisma.dispute.findMany({
    where: { OR: [{ deal: { creatorId: userId } }, { deal: { brandId: userId } }] },
    include: { deal: true }
  });
}
