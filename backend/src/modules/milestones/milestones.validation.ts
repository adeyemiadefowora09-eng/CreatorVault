import { z } from "zod";

export const createMilestoneSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  description: z.string().optional(),
  amount: z.number().positive("Amount must be positive"),
  dueDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
  orderIndex: z.number().int().min(0),
});

export const updateMilestoneSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  amount: z.number().positive().optional(),
  dueDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

export const rejectMilestoneSchema = z.object({
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

// The brand needs something to actually review before approving/paying —
// require at least a note or a link (a file/portfolio/drive URL etc).
export const submitMilestoneSchema = z
  .object({
    submissionNote: z.string().max(2000).optional(),
    submissionUrl: z.string().url("Must be a valid URL").optional(),
  })
  .refine((data) => Boolean(data.submissionNote?.trim() || data.submissionUrl?.trim()), {
    message: "Provide a note and/or a link to what you're submitting",
  });

export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
export type SubmitMilestoneInput = z.infer<typeof submitMilestoneSchema>;
