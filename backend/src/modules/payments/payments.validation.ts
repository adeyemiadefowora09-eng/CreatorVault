import { z } from "zod";

export const initializePaymentSchema = z.object({
  dealId: z.string().uuid(),
  milestoneId: z.string().uuid(),
});

export const verifyPaymentParamSchema = z.object({
  reference: z.string(),
});

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REFUNDED"]).optional(),
  dealId: z.string().uuid().optional(),
});

export const requestPayoutSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
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
