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

/**
 * POST /payments/initialize — starts a payment for an approved milestone.
 * In live mode this returns a real Payaza checkoutUrl to send the brand
 * to; in demo mode (no PAYAZA_API_KEY configured on the backend) there's
 * no gateway to redirect to, so checkoutUrl is null and `mock: true` —
 * the UI should show an in-app "confirm payment" step instead (see
 * useConfirmMockPayment below).
 */
export function useInitializePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { dealId: string; milestoneId: string }) => {
      const { data } = await api.post<
        ApiEnvelope<{ payment: Payment; checkoutUrl: string | null; mock?: boolean; reference?: string }>
      >("/payments/initialize", input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

/** GET /payments/mode — whether the backend has real Payaza credentials configured. */
export function usePaymentMode() {
  return useQuery({
    queryKey: ["payments", "mode"],
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<{ live: boolean }>>("/payments/mode");
      return data.data;
    },
    staleTime: Infinity,
  });
}

/**
 * POST /payments/mock/:reference/confirm — demo-mode-only. Simulates the
 * brand's checkout succeeding, which is what a real Payaza webhook would
 * otherwise report. Only callable when usePaymentMode() says `live: false`.
 */
export function useConfirmMockPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reference: string) => {
      const { data } = await api.post<ApiEnvelope<Payment>>(`/payments/mock/${reference}/confirm`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
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
