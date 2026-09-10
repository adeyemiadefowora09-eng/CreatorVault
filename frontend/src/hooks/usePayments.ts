/**
 * src/hooks/usePayments.ts
 * React Query hooks wrapping the Payments API (backend/src/modules/payments).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Payment, PaymentStats, Payout, PayoutBalance } from "@/types/payments";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: { page: number; limit: number; total: number; totalPages: number };
}

/** POST /payments/initialize — real call through to Payaza; returns a checkoutUrl to send the brand to. */
export function useInitializePayment() {
  return useMutation({
    mutationFn: async (input: { dealId: string; milestoneId: string }) => {
      const { data } = await api.post<ApiEnvelope<{ payment: Payment; checkoutUrl: string }>>(
        "/payments/initialize",
        input
      );
      return data.data;
    },
  });
}

/** GET /payments — the signed-in user's payments (as payer or payee). */
export function usePayments() {
  return useQuery({
    queryKey: ["payments", "list"],
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<Payment[]>>("/payments");
      return data.data;
    },
  });
}

/** GET /payments/stats — earned/pending (creators) or spent (brands). */
export function usePaymentStats() {
  return useQuery({
    queryKey: ["payments", "stats"],
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<PaymentStats>>("/payments/stats");
      return data.data;
    },
  });
}

/** GET /payments/payouts/balance — a creator's withdrawable balance. */
export function usePayoutBalance() {
  return useQuery({
    queryKey: ["payments", "payouts", "balance"],
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<PayoutBalance>>("/payments/payouts/balance");
      return data.data;
    },
  });
}

/** GET /payments/payouts — a creator's payout history. */
export function usePayouts() {
  return useQuery({
    queryKey: ["payments", "payouts", "list"],
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<Payout[]>>("/payments/payouts");
      return data.data;
    },
  });
}

/** POST /payments/payouts — request a withdrawal of the available balance. */
export function useRequestPayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (amount: number) => {
      const { data } = await api.post<ApiEnvelope<Payout>>("/payments/payouts", { amount });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", "payouts"] });
    },
  });
}
