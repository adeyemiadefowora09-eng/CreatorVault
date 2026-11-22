/** src/types/payments.ts — matches backend/src/modules/payments (escrow + ledger version). */

export type PaymentStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REFUNDED" | "EXPIRED" | "REVIEW";
export type PaymentProvider = "PAYAZA" | string;
export type EscrowStatus = "UNFUNDED" | "FUNDED" | "RELEASED" | "REFUNDED";

export interface VirtualAccount {
  accountNumber: string;
  accountName: string | null;
  bankName: string | null;
}

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
  environment: "sandbox" | "live";
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
  failureReason: string | null;
  virtualAccount: VirtualAccount | null; // only returned to the paying brand
  deal?: { title: string } | null;
  milestone?: { title: string; escrowStatus?: EscrowStatus } | null;
}

export interface PaymentStats {
  earned?: string | number;
  pending?: string | number; // funded in escrow, awaiting brand approval
  available?: string | number;
  spent?: string | number;
  inEscrow?: string | number;
  refundable?: string | number;
}

export type PayoutStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface Payout {
  id: string;
  amount: string;
  currency: string;
  status: PayoutStatus;
  providerRef: string | null;
  bankAccountNumber: string; // masked by the API
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
  inEscrow: number;
  currency: string;
  environment: "sandbox" | "live";
}

export interface PaymentMode {
  mode: "disabled" | "sandbox" | "live";
  enabled: boolean;
  sandbox: boolean;
  live: boolean;
  escrowRequired: boolean;
  platformFeeBps: number;
  payoutMinAmount: number;
}

export interface Bank { code: string; name: string }
