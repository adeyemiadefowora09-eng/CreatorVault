/** src/hooks/usePayments.ts — React Query hooks for the escrow/ledger Payments API. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Bank, Payment, PaymentMode, PaymentStats, Payout, PayoutBalance, VirtualAccount } from "@/types/payments";

interface ApiEnvelope<T> { success: boolean; message: string; data: T }

/** GET /payments/mode — disabled | sandbox | live. */
export function usePaymentMode() {
  return useQuery({
    queryKey: ["payments", "mode"],
    queryFn: async () => (await api.get<ApiEnvelope<PaymentMode>>("/payments/mode")).data.data,
    staleTime: 60_000,
  });
}

/** POST /payments/initialize — brand funds a milestone escrow by bank transfer to a one-time virtual account. */
export function useInitializePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { dealId: string; milestoneId: string }) =>
      (await api.post<ApiEnvelope<{ payment: Payment; virtualAccount: VirtualAccount | null; reference: string; sandbox: boolean }>>("/payments/initialize", input)).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payments"] }); qc.invalidateQueries({ queryKey: ["milestones"] }); },
  });
}

/** POST /payments/verify/:reference — asks the backend to re-check with Payaza. Never trusts the browser. */
export function useVerifyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reference: string) => (await api.post<ApiEnvelope<Payment>>(`/payments/verify/${reference}`)).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payments"] }); qc.invalidateQueries({ queryKey: ["milestones"] }); qc.invalidateQueries({ queryKey: ["deals"] }); },
  });
}

/** SANDBOX ONLY — asks Payaza to simulate the bank transfer (a real webhook follows). */
export function useSimulateSandboxPayment() {
  return useMutation({
    mutationFn: async (reference: string) => (await api.post(`/payments/sandbox/${reference}/simulate`)).data,
  });
}

export function usePayments() {
  return useQuery({
    queryKey: ["payments", "list"],
    queryFn: async () => (await api.get<ApiEnvelope<Payment[]>>("/payments")).data.data,
    refetchInterval: 15_000,
  });
}

export function usePaymentStats() {
  return useQuery({
    queryKey: ["payments", "stats"],
    queryFn: async () => (await api.get<ApiEnvelope<PaymentStats>>("/payments/stats")).data.data,
  });
}

export function usePayoutBalance() {
  return useQuery({
    queryKey: ["payments", "payouts", "balance"],
    queryFn: async () => (await api.get<ApiEnvelope<PayoutBalance>>("/payments/payouts/balance")).data.data,
    refetchInterval: 15_000,
  });
}

export function usePayouts() {
  return useQuery({
    queryKey: ["payments", "payouts", "list"],
    queryFn: async () => (await api.get<ApiEnvelope<Payout[]>>("/payments/payouts")).data.data,
    refetchInterval: 15_000,
  });
}

/** POST /payments/payouts — sends an Idempotency-Key so a double-click / retry can never withdraw twice. */
export function useRequestPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (amount: string) => {
      const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return (await api.post<ApiEnvelope<Payout>>("/payments/payouts", { amount }, { headers: { "Idempotency-Key": key } })).data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

// ---- payout bank account (verified through Payaza name enquiry) ------------
export function useBanks(enabled = true) {
  return useQuery({
    queryKey: ["payments", "banks"],
    enabled,
    staleTime: 6 * 3600_000,
    queryFn: async () => (await api.get<ApiEnvelope<Bank[]>>("/payments/banks")).data.data,
  });
}

export function useResolveBank() {
  return useMutation({
    mutationFn: async (input: { bankCode: string; accountNumber: string }) =>
      (await api.post<ApiEnvelope<{ accountName: string }>>("/payments/bank/resolve", input)).data.data,
  });
}

export function useSaveBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bankCode: string; accountNumber: string; confirmedAccountName: string }) =>
      (await api.put<ApiEnvelope<{ withdrawalsAvailableAt: string }>>("/payments/bank", input)).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profile"] }); qc.invalidateQueries({ queryKey: ["payments"] }); },
  });
}
