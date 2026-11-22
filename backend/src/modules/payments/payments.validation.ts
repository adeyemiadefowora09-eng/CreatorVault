import { z } from "zod";

export const initializePaymentSchema = z.object({
  dealId: z.string().uuid(),
  milestoneId: z.string().uuid(),
});

export const verifyPaymentParamSchema = z.object({ reference: z.string().min(8).max(80) });

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REFUNDED", "EXPIRED", "REVIEW"]).optional(),
  dealId: z.string().uuid().optional(),
});

// Amount as number OR string; parsed to an exact Decimal on the server (max 2dp).
export const requestPayoutSchema = z.object({
  amount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/)]),
});

export const resolveBankSchema = z.object({
  bankCode: z.string().min(2).max(12),
  accountNumber: z.string().regex(/^\d{10}$/, "Account number must be 10 digits"),
});

export const saveBankSchema = resolveBankSchema.extend({
  confirmedAccountName: z.string().min(2).max(120),
});

export const adminResolveEscrowSchema = z.object({
  action: z.enum(["RELEASE_TO_CREATOR", "REFUND_TO_BRAND"]),
  reason: z.string().min(5).max(300),
});

export const adminSettleRefundSchema = z.object({
  brandId: z.string().uuid(),
  amount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/)]),
  reference: z.string().min(6).max(64),
});

export const bankEnquirySchema = z.object({
  bankCode: z.string().min(2, "Bank code is required"),
  accountNumber: z.string().min(10).max(10, "NUBAN account number must be 10 digits"),
});

export const saveBankSchema = z.object({
  bankCode: z.string().min(2, "Bank code is required"),
  accountNumber: z.string().min(10).max(10, "NUBAN account number must be 10 digits"),
  bankName: z.string().optional(),
});

export const refundEscrowSchema = z.object({
  dealId: z.string().uuid(),
  milestoneId: z.string().uuid(),
  reason: z.string().min(5, "Reason must be at least 5 characters"),
});
