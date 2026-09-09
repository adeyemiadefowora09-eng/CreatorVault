import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  bio: z.string().max(500).optional(),
  country: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

export const updateCreatorProfileSchema = z.object({
  categories: z.array(z.string()).optional(),
  portfolioUrl: z.string().url().optional(),
  socialLinks: z.record(z.string()).optional(),
});

export const updateBrandProfileSchema = z.object({
  companyName: z.string().min(2).optional(),
  industry: z.string().optional(),
  website: z.string().url().optional(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  role: z.enum(["CREATOR", "BRAND"]).optional(),
  search: z.string().optional(),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateCreatorProfileInput = z.infer<typeof updateCreatorProfileSchema>;
export type UpdateBrandProfileInput = z.infer<typeof updateBrandProfileSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
