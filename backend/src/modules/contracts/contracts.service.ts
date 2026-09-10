import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/apiError.js";
import { UploadContractInput } from "./contracts.validation.js";
import { DealGuardianService } from "@creatorvault/ai-engine";
import { applyTrustScoreEvent } from "../trust-score/trustScore.instance.js";

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

/**
 * Run AI Deal Guardian against this deal's actual contract and persist the
 * result as a ContractAnalysis (upserted — re-running replaces the previous
 * analysis rather than erroring, since @@unique([contractId]) means only one
 * can exist at a time). This is the piece that was missing entirely before:
 * the standalone /deal-guardian/analyze endpoint never touched a real deal's
 * Contract row, so a contract could be fully signed with zero AI review.
 *
 * Mirrors the hook pattern documented in ai-engine's index.ts
 * (onAnalysisComplete / onCriticalFlag) without pulling in the full
 * createAiEngineRouter — this stays consistent with how
 * deal-guardian/dealGuardian.routes.ts already calls the service directly.
 */
export async function analyzeContract(contractId: string, userId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { deal: true },
  });

  if (!contract) throw ApiError.notFound("Contract");

  if (contract.deal.creatorId !== userId && contract.deal.brandId !== userId) {
    throw ApiError.forbidden("You are not a party to this contract");
  }

  if (!contract.rawText) {
    throw ApiError.badRequest(
      "This contract has no text to analyze yet — attach the contract text first"
    );
  }

  // Instantiate here to ensure process.env is populated and configuration is passed
  const dealGuardianService = new DealGuardianService({
    apiKey: process.env.GROQ_API_KEY,
    model: "openai/gpt-oss-20b",
  });

  const analysis = await dealGuardianService.analyzeContract(contract.rawText);

  // ai-engine's ContractAnalysis.safetyScore is 0-100, higher = safer.
  // Prisma's ContractAnalysis.riskScore is the inverse (higher = riskier) so
  // it reads naturally next to riskLevel — invert here rather than storing
  // the two fields on different scales.
  const riskScore = 100 - analysis.safetyScore;

  const saved = await prisma.contractAnalysis.upsert({
    where: { contractId },
    create: {
      contractId,
      riskLevel: analysis.riskLevel,
      riskScore,
      flaggedClauses: analysis.flaggedClauses as any,
      summary: analysis.summary,
      recommendations: analysis.recommendations as any,
    },
    update: {
      riskLevel: analysis.riskLevel,
      riskScore,
      flaggedClauses: analysis.flaggedClauses as any,
      summary: analysis.summary,
      recommendations: analysis.recommendations as any,
      analyzedAt: new Date(),
    },
  });

  await prisma.contract.update({
    where: { id: contractId },
    data: { status: "ANALYZED" },
  });

  if (analysis.riskLevel === "CRITICAL") {
    // Per ai-engine's documented AI_GUARDIAN_CRITICAL_FLAG rule (-10),
    // applied against the creator side of the deal — matches the pattern in
    // ai-engine's index.ts doc comment.
    await applyTrustScoreEvent({
      type: "AI_GUARDIAN_CRITICAL_FLAG",
      userId: contract.deal.creatorId,
      sourceId: contractId,
    });
  }

  return prisma.contract.findUnique({
    where: { id: contractId },
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