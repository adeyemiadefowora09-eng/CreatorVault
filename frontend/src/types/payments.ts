/**
 * src/types/payments.ts
 * Matches backend/src/modules/payments (payments.service.ts's listPayments
 * and getPaymentStats — amounts come back as Prisma Decimal, serialized to
 * string over JSON).
 */

export type PaymentStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REFUNDED";
export type PaymentProvider = "PAYAZA" | string;

export interface Payment {
  id: string;
  dealId: string;
  milestoneId: string | null;
  payerId: string;
  payeeId: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  providerRef: string | null;
  provider: PaymentProvider;
  paidAt: string | null;
  createdAt: string;
  deal?: { title: string } | null;
  milestone?: { title: string } | null;
}

export interface PaymentStats {
  earned?: string | number;
  pending?: string | number;
  spent?: string | number;
}

export type PayoutStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface Payout {
  id: string;
  userId: string;
  amount: string;
  currency: string;
  status: PayoutStatus;
  providerRef: string | null;
  bankAccountNumber: string;
  bankName: string;
  failureReason: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export interface PayoutBalance {
  totalEarned: number;
  totalPaidOut: number;
  pendingPayouts: number;
  availableBalance: number;
  currency: string;
}
