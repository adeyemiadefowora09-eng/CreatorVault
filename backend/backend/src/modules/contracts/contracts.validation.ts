import { z } from "zod";

export const uploadContractSchema = z.object({
  dealId: z.string().uuid("Invalid deal ID"),
  rawText: z.string().min(50, "Contract text must be at least 50 characters").optional(),
});

export const contractIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type UploadContractInput = z.infer<typeof uploadContractSchema>;
