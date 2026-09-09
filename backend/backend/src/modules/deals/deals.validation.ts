import { z } from "zod";

export const createDealSchema = z.object({
  creatorId: z.string().uuid("Invalid creator ID"),
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  amount: z.number().positive("Amount must be positive"),
  currency: z.string().default("NGN"),
  deliverables: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().optional(),
    })
  ).min(1, "At least one deliverable is required"),
  deadline: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
});

export const updateDealSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(10).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().optional(),
  deliverables: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().optional(),
    })
  ).optional(),
  deadline: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }).optional(),
});

export const listDealsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum([
    "DRAFT", "PROPOSED", "NEGOTIATING", "ACTIVE",
    "COMPLETED", "DISPUTED", "CANCELLED",
  ]).optional(),
  role: z.enum(["as_creator", "as_brand"]).optional(),
});

export const dealIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;
export type ListDealsQuery = z.infer<typeof listDealsQuerySchema>;
