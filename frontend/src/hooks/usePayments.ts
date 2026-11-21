/**
 * src/hooks/usePayments.ts
 * React Query hooks wrapping the Payments API (backend/src/modules/payments).
 *
 * Money-truth rules enforced here:
 *  - Nothing in this file marks a payment "paid". Payment state is whatever the
 *    backend last reported; `useVerifyPayment` keeps asking until the backend
 *    says COMPLETED / FAILED / REFUNDED (the backend itself confirms with the
 *    provider and/or the signed webhook).
 *  - Every state change invalidates the caches that display it (payments,
 *    payouts, balance, stats, deals, milestones) so no screen shows stale money.
 */

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { api } from "@/lib/api";
import type { Payment, PaymentStats, Payout, PayoutBalance } from "@/types/payments";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: { page: number; limit: number; total: number; totalPages: number };
}

/** Prefix key — invalidating this refreshes payments list, stats, payouts and balance in one go. */
export const PAYMENTS_KEY = ["payments"] as const;

const TERMINAL_PAYMENT_STATUSES = new Set(["COMPLETED", "FAILED", "REFUNDED"]);
const IN_FLIGHT_PAYOUT_STATUSES = new Set(["PENDING", "PROCESSING"]);

/** Poll cadence while waiting on the provider/webhook: every 3s, give up after ~2 minutes. */
export const VERIFY_POLL_INTERVAL_MS = 3_000;
export const VERIFY_MAX_POLLS = 40;

// ---------------------------------------------------------------------------
// Brand: fund a milestone
// ---------------------------------------------------------------------------

/**
 * POST /payments/initialize — starts funding escrow for a milestone.
 *
 * Live mode: returns the provider's hosted `checkoutUrl` to send the brand to.
 * Demo mode (no provider credentials on the backend): `checkoutUrl` is null and
 * `mock: true` with a `reference` — the UI offers an explicit "simulate
 * payment" step instead (see useConfirmMockPayment).
 *
 * This does NOT mark anything paid/funded on the client; that happens only
 * after backend verification. `idempotencyKey` is generated once per
 * click-intent by the caller (see PayButton) and re-used for retries.
 */
export function useInitializePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { dealId: string; milestoneId: string; idempotencyKey: string }) => {
      const { idempotencyKey, ...body } = input;
      const { data } = await api.post<
        ApiEnvelope<{ payment: Payment; checkoutUrl: string | null; mock?: boolean; reference?: string }>
      >("/payments/initialize", body, { headers: { "Idempotency-Key": idempotencyKey } });
      return data.data;
    },
    onSuccess: () => {
      // A PENDING payment now exists server-side; refresh lists. Balances/milestones only change after verification.
      queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY });
    },
  });
}

/** GET /payments/mode — whether the backend has real provider credentials configured. */
export function usePaymentMode() {
  return useQuery({
    queryKey: [...PAYMENTS_KEY, "mode"],
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<{ live: boolean }>>("/payments/mode");
      return data.data;
    },
    staleTime: Infinity,
  });
}

/**
 * POST /payments/mock/:reference/confirm — DEMO MODE ONLY. Simulates a
 * successful checkout (what a real provider webhook would otherwise report).
 * The backend only allows it when `live` is false.
 */
export function useConfirmMockPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reference: string) => {
      const { data } = await api.post<ApiEnvelope<Payment>>(
        `/payments/mock/${encodeURIComponent(reference)}/confirm`
      );
      return data.data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

/**
 * POST /payments/verify/:reference — asks the backend where the payment stands.
 * The backend only ever flips a payment to COMPLETED after the provider
 * confirms it (or the signed webhook does), so polling this is safe.
 *
 * Polls until the status is terminal or VERIFY_MAX_POLLS is reached, then
 * stops (the UI offers a manual "Check again").
 */
export function useVerifyPayment(reference: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...PAYMENTS_KEY, "verify", reference],
    enabled: Boolean(reference),
    queryFn: async () => {
      const { data } = await api.post<ApiEnvelope<Payment>>(
        `/payments/verify/${encodeURIComponent(reference as string)}`
      );
      // Tolerate both `{ data: payment }` and a bare payment object. If the body has no
      // `status`, callers treat it as "not confirmed yet" — never as success.
      return (data.data ?? (data as unknown as Payment)) as Payment;
    },
    // 403/404 mean "not yours" / "doesn't exist" — retrying won't change that.
    retry: (failureCount, error) => {
      if (axios.isAxiosError(error) && error.response && error.response.status < 500) return false;
      return failureCount < 2;
    },
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status && TERMINAL_PAYMENT_STATUSES.has(status)) return false;
      if (q.state.dataUpdateCount >= VERIFY_MAX_POLLS) return false;
      return VERIFY_POLL_INTERVAL_MS;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
  });

  const status = query.data?.status;
  useEffect(() => {
    if (status && TERMINAL_PAYMENT_STATUSES.has(status)) {
      // Money state changed on the server — refresh everything that renders it.
      queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY });
      queryClient.invalidateQueries({ queryKey: ["deals"] }); // deals + milestones share this prefix
    }
  }, [status, queryClient]);

  // `dataUpdateCount` lives on the cache entry's state, not on the observer result.
  const updateCount =
    queryClient.getQueryState([...PAYMENTS_KEY, "verify", reference])?.dataUpdateCount ?? 0;
  const gaveUp =
    !query.isError &&
    (!status || !TERMINAL_PAYMENT_STATUSES.has(status)) &&
    updateCount >= VERIFY_MAX_POLLS;

  return { ...query, gaveUp };
}

// ---------------------------------------------------------------------------
// Shared read hooks
// ---------------------------------------------------------------------------

/** GET /payments — the signed-in user's payments (as payer or payee). */
export function usePayments() {
  return useQuery({
    queryKey: [...PAYMENTS_KEY, "list"],
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<Payment[]>>("/payments");
      return data.data;
    },
  });
}

/** GET /payments/stats — earned/pending (creators) or spent (brands). */
export function usePaymentStats() {
  return useQuery({
    queryKey: [...PAYMENTS_KEY, "stats"],
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<PaymentStats>>("/payments/stats");
      return data.data;
    },
  });
}

// ---------------------------------------------------------------------------
// Creator: balance + withdrawals
// ---------------------------------------------------------------------------

/** GET /payments/payouts/balance — a creator's withdrawable balance. Only enable for creators. */
export function usePayoutBalance(enabled = true) {
  return useQuery({
    queryKey: [...PAYMENTS_KEY, "payouts", "balance"],
    enabled,
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<PayoutBalance>>("/payments/payouts/balance");
      return data.data;
    },
  });
}

/**
 * GET /payments/payouts — a creator's payout history. While any payout is
 * PENDING/PROCESSING it re-checks every 10s so status changes appear without
 * a manual refresh, and refreshes the balance when one settles.
 */
export function usePayouts(enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...PAYMENTS_KEY, "payouts", "list"],
    enabled,
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<Payout[]>>("/payments/payouts");
      return data.data;
    },
    refetchInterval: (q) =>
      q.state.data?.some((p) => IN_FLIGHT_PAYOUT_STATUSES.has(p.status)) ? 10_000 : false,
  });

  const inFlightCount = query.data?.filter((p) => IN_FLIGHT_PAYOUT_STATUSES.has(p.status)).length ?? 0;
  useEffect(() => {
    // When the number of in-flight payouts changes, the balance changed too.
    queryClient.invalidateQueries({ queryKey: [...PAYMENTS_KEY, "payouts", "balance"] });
  }, [inFlightCount, queryClient]);

  return query;
}

/**
 * POST /payments/payouts — request a withdrawal.
 * `amount` must already have been validated with lib/money (exact, 2dp);
 * the backend re-validates against the real balance — it is the authority.
 */
export function useRequestPayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { amount: number; idempotencyKey: string }) => {
      const { data } = await api.post<ApiEnvelope<Payout>>(
        "/payments/payouts",
        { amount: input.amount },
        { headers: { "Idempotency-Key": input.idempotencyKey } }
      );
      return data.data;
    },
    // Success OR failure: re-read the server's truth (balance may have changed even on an error).
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY });
    },
  });
}
