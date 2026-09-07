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

export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
