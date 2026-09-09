import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/apiError.js";
import { UploadContractInput } from "./contracts.validation.js";

export async function uploadContract(
  userId: string,
  data: UploadContractInput,
  fileUrl?: string
) {
  if (!fileUrl && !data.rawText) {
    throw ApiError.badRequest("Either a file or raw text is required");
  }

  const deal = await prisma.deal.findUnique({
    where: { id: data.dealId },
  });

  if (!deal) throw ApiError.notFound("Deal");

  if (deal.creatorId !== userId && deal.brandId !== userId) {
    throw ApiError.forbidden("You are not a party to this deal");
  }

  // Check if contract already exists for this deal
  const existing = await prisma.contract.findUnique({
    where: { dealId: data.dealId },
  });

  if (existing) {
    throw ApiError.conflict("A contract already exists for this deal");
  }

  return prisma.contract.create({
    data: {
      dealId: data.dealId,
      fileUrl: fileUrl || null,
      rawText: data.rawText || null,
    },
    include: { analysis: true },
  });
}

export async function listContracts(userId: string) {
  return prisma.contract.findMany({
    where: {
      deal: {
        OR: [{ creatorId: userId }, { brandId: userId }],
      },
    },
    include: {
      deal: { select: { id: true, title: true, status: true } },
      analysis: { select: { id: true, riskLevel: true, riskScore: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getContractById(contractId: string, userId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      deal: {
        select: {
          id: true,
          title: true,
          status: true,
          creatorId: true,
          brandId: true,
        },
      },
      analysis: true,
    },
  });

  if (!contract) throw ApiError.notFound("Contract");

  if (contract.deal.creatorId !== userId && contract.deal.brandId !== userId) {
    throw ApiError.forbidden("You are not a party to this contract");
  }

  return contract;
}

export async function signContract(contractId: string, userId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { deal: true },
  });

  if (!contract) throw ApiError.notFound("Contract");

  const isCreator = contract.deal.creatorId === userId;
  const isBrand = contract.deal.brandId === userId;

  if (!isCreator && !isBrand) {
    throw ApiError.forbidden("You are not a party to this contract");
  }

  const updateData: Record<string, any> = {};

  if (isCreator) {
    if (contract.signedByCreator) throw ApiError.badRequest("You have already signed this contract");
    updateData.signedByCreator = true;
  }

  if (isBrand) {
    if (contract.signedByBrand) throw ApiError.badRequest("You have already signed this contract");
    updateData.signedByBrand = true;
  }

  // If both parties have now signed, mark as SIGNED
  const willBeFullySigned =
    (isCreator && contract.signedByBrand) ||
    (isBrand && contract.signedByCreator);

  if (willBeFullySigned) {
    updateData.status = "SIGNED";
  }

  return prisma.contract.update({
    where: { id: contractId },
    data: updateData,
    include: { analysis: true },
  });
}

export async function deleteContract(contractId: string, userId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { deal: true },
  });

  if (!contract) throw ApiError.notFound("Contract");

  if (contract.deal.creatorId !== userId && contract.deal.brandId !== userId) {
    throw ApiError.forbidden("You are not a party to this contract");
  }

  if (contract.status !== "PENDING_REVIEW") {
    throw ApiError.badRequest("Can only delete contracts in PENDING_REVIEW status");
  }

  await prisma.contract.delete({ where: { id: contractId } });
}
