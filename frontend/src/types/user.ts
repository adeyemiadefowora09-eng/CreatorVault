/**
 * src/types/user.ts
 * Full user profile shape, as returned by GET /auth/me and GET /users/:id
 * (backend/src/modules/users/users.service.ts's `userSelect`).
 */

export type UserRole = "CREATOR" | "BRAND" | "ADMIN";

export interface CreatorProfile {
  id: string;
  categories: string[];
  portfolioUrl: string | null;
  completedDeals: number;
  avgRating: number;
  socialLinks: Record<string, string> | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankCode: string | null;
}

export interface BrandProfile {
  id: string;
  companyName: string | null;
  industry: string | null;
  website: string | null;
  completedDeals: number;
  avgRating: number;
  verified: boolean;
}

export interface FullUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
  bio: string | null;
  country: string | null;
  trustScore: number;
  createdAt: string;
  updatedAt: string;
  creatorProfile: CreatorProfile | null;
  brandProfile: BrandProfile | null;
}

export interface UpdateProfileInput {
  name?: string;
  bio?: string;
  country?: string;
  avatarUrl?: string;
}

export interface UpdateCreatorProfileInput {
  categories?: string[];
  portfolioUrl?: string;
  socialLinks?: Record<string, string>;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankName?: string;
  bankCode?: string;
}

export interface UpdateBrandProfileInput {
  companyName?: string;
  industry?: string;
  website?: string;
}
