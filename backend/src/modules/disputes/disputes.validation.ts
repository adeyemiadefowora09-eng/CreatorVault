import { z } from "zod";

export const createDisputeSchema = z.object({
  dealId: z.string().uuid(),
  reason: z.string().min(20),
});

export const resolveDisputeSchema = z.object({
  outcome: z.enum(["UPHELD", "DISMISSED"]),
  resolution: z.string().min(10, "Explain the resolution in at least 10 characters"),
});
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
