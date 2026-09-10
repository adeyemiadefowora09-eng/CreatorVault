import { z } from "zod";

export const createDisputeSchema = z.object({
  dealId: z.string().uuid(),
  reason: z.string().min(20),
});
