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
