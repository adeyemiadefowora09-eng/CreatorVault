"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Clock, CreditCard, Loader2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  usePayments,
  usePaymentMode,
  usePaymentStats,
  usePayoutBalance,
  usePayouts,
  useRequestPayout,
} from "@/hooks/usePayments";
import { useMe } from "@/hooks/useProfile";
import { useAuthStore } from "@/stores/authStore";
import { formatMoney, minorToNumber, toMinor, toMinorOrZero } from "@/lib/money";
import {
  getApiErrorMessage,
  newIdempotencyKey,
  readPendingPayment,
} from "@/lib/payments";
import type { Payment, Payout } from "@/types/payments";

// Unknown statuses (e.g. a future REVERSED) must still render — never crash on a lookup miss.
const FALLBACK_STYLE = "bg-slate-500/10 text-slate-600";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-600",
  PROCESSING: "bg-blue-500/10 text-blue-600",
  COMPLETED: "bg-emerald-500/10 text-emerald-600",
  FAILED: "bg-rose-500/10 text-rose-600",
  REFUNDED: "bg-slate-500/10 text-slate-600",
  REVERSED: "bg-rose-500/10 text-rose-600",
};

/** Plain-language labels; the raw status is kept in the tooltip for support. */
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  REVERSED: "Reversed",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      title={status}
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status] ?? FALLBACK_STYLE}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function PaymentRow({ payment, userId }: { payment: Payment; userId: string | undefined }) {
  const isIncoming = payment.payeeId === userId;
  // Only confirmed money gets a +/- sign; unconfirmed amounts must not read like a balance change.
  const confirmed = payment.status === "COMPLETED";
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {payment.deal?.title ?? "Deal"}
          {payment.milestone?.title ? ` · ${payment.milestone.title}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(payment.createdAt).toLocaleDateString()} · {isIncoming ? "Received" : "Paid"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StatusPill status={payment.status} />
        <span className="w-28 text-right text-sm font-semibold text-foreground">
          {confirmed ? (isIncoming ? "+" : "-") : ""}
          {formatMoney(payment.amount, payment.currency)}
        </span>
      </div>
    </div>
  );
}

function PayoutRow({ payout }: { payout: Payout }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {payout.bankName} · ••••{payout.bankAccountNumber.slice(-4)}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(payout.requestedAt).toLocaleDateString()}
          {payout.failureReason ? ` · ${payout.failureReason}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StatusPill status={payout.status} />
        <span className="w-28 text-right text-sm font-semibold text-foreground">
          -{formatMoney(payout.amount, payout.currency)}
        </span>
      </div>
    </div>
  );
}

/**
 * Brand-side recovery: if the brand left for checkout and never came back
 * (closed tab, dropped network, bank app switch), offer to re-check that
 * payment instead of letting them pay a second time.
 */
function PendingPaymentBanner() {
  // sessionStorage is only readable in the browser; a lazy initializer keeps SSR output identical (null).
  const [pending] = useState(() => (typeof window === "undefined" ? null : readPendingPayment()));
  if (!pending) return null;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">You have a payment in progress</p>
            <p className="text-xs text-muted-foreground">
              Finished paying but didn&apos;t see a confirmation? Check it before paying again.
            </p>
          </div>
        </div>
        <Link
          href={`/payments/verify/${pending.reference}`}
          className="text-sm font-medium text-primary underline underline-offset-2"
        >
          Check payment status
        </Link>
      </CardContent>
    </Card>
  );
}

function WithdrawCard() {
  const { data: me } = useMe();
  const { data: balance, isLoading: balanceLoading, isError: balanceError } = usePayoutBalance();
  const requestPayout = useRequestPayout();
  const [amount, setAmount] = useState("");
  // One key per withdrawal *intent*; kept across retries, replaced after success.
  const idempotencyKey = useRef(newIdempotencyKey());
  // Synchronous submit lock (a ref beats state against a fast double-click).
  const submittingRef = useRef(false);

  const currency = balance?.currency ?? "NGN";
  const hasBankDetails = Boolean(
    me?.creatorProfile?.bankAccountNumber && me?.creatorProfile?.bankName
  );

  // Exact integer-minor-unit validation — no float math on money.
  const amountMinor = toMinor(amount);
  const availableMinor = toMinorOrZero(balance?.availableBalance ?? 0);
  const amountProblem =
    amount === ""
      ? null
      : amountMinor === null
        ? "Enter a valid amount with at most 2 decimal places."
        : amountMinor <= BigInt(0)
          ? "Amount must be greater than zero."
          : amountMinor > availableMinor
            ? "That's more than your available balance."
            : null;
  const canSubmit = amountMinor !== null && amountProblem === null && amount !== "";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || !canSubmit || amountMinor === null) return;
    submittingRef.current = true;
    requestPayout.mutate(
      { amount: minorToNumber(amountMinor), idempotencyKey: idempotencyKey.current },
      {
        onSuccess: () => {
          setAmount("");
          idempotencyKey.current = newIdempotencyKey();
        },
        onSettled: () => {
          submittingRef.current = false;
        },
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" aria-hidden="true" />
          Withdraw to bank
        </CardTitle>
        <CardDescription>
          Move your completed-milestone earnings from your CreatorVault balance to your bank account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {balanceError ? (
          <p className="text-sm text-destructive">
            We couldn&apos;t load your balance, so withdrawals are paused. Refresh to try again.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Available</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {balanceLoading ? "…" : formatMoney(balance?.availableBalance ?? 0, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending payouts</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {balanceLoading ? "…" : formatMoney(balance?.pendingPayouts ?? 0, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total earned</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {balanceLoading ? "…" : formatMoney(balance?.totalEarned ?? 0, currency)}
              </p>
            </div>
          </div>
        )}

        {!hasBankDetails ? (
          <p className="text-sm text-muted-foreground">
            Add your bank details on your{" "}
            <Link href="/profile" className="underline underline-offset-2">
              profile
            </Link>{" "}
            before requesting a payout.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-2" noValidate>
            <div className="flex flex-wrap items-end gap-3">
              <div className="max-w-[200px] flex-1 space-y-1.5">
                <label htmlFor="payout-amount" className="text-xs text-muted-foreground">
                  Amount ({currency})
                </label>
                <Input
                  id="payout-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  aria-invalid={Boolean(amountProblem)}
                  aria-describedby={amountProblem ? "payout-amount-error" : undefined}
                  disabled={requestPayout.isPending || balanceError}
                />
              </div>
              <Button type="submit" size="sm" disabled={!canSubmit || requestPayout.isPending || balanceLoading}>
                {requestPayout.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Requesting…
                  </>
                ) : (
                  "Request payout"
                )}
              </Button>
            </div>
            {amountProblem && (
              <p id="payout-amount-error" className="text-sm text-destructive">
                {amountProblem}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Paying out to {me?.creatorProfile?.bankName} · ••••{me?.creatorProfile?.bankAccountNumber?.slice(-4)}
            </p>
          </form>
        )}

        {requestPayout.isError && (
          <p role="alert" className="text-sm text-destructive">
            {getApiErrorMessage(requestPayout.error, "Couldn't request that payout — check the amount and try again.")}
          </p>
        )}
        {requestPayout.isSuccess && (
          <p role="status" className="text-sm text-emerald-600">
            Payout requested — it&apos;s now in your history below. We&apos;ll update its status as the bank processes it.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function PaymentsPage() {
  const storeUser = useAuthStore((s) => s.user);
  const { data: me } = useMe();
  // Prefer the server-verified role; the persisted store copy is editable in DevTools,
  // so it is only used as a first-paint fallback. The backend enforces roles regardless.
  const role = me?.role ?? storeUser?.role;
  const userId = me?.id ?? storeUser?.id;
  const isCreator = role === "CREATOR";
  const isBrand = role === "BRAND";

  const { data: payments, isLoading, isError } = usePayments();
  const { data: stats } = usePaymentStats();
  // Payout endpoints are creator-only server-side — don't fire them (and eat 403s) for brands.
  const { data: payouts } = usePayouts(isCreator);
  const { data: paymentMode } = usePaymentMode();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Milestone payouts and payment history for your deals.
        </p>
      </header>

      {paymentMode && !paymentMode.live && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Demo mode: no live payment provider is connected, so payments and payouts here are
            simulated — no real money moves, but the flow (escrow → confirm → balance → withdraw)
            works the same way a live one would.
          </span>
        </div>
      )}

      {isBrand && <PendingPaymentBanner />}

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isCreator ? (
            <>
              <StatCard label="Total earned" value={formatMoney(stats.earned ?? 0, "NGN")} />
              <StatCard label="Pending" value={formatMoney(stats.pending ?? 0, "NGN")} />
            </>
          ) : (
            <StatCard label="Total spent" value={formatMoney(stats.spent ?? 0, "NGN")} />
          )}
        </div>
      )}

      {isCreator && <WithdrawCard />}

      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading payments…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-rose-500" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load your payments. Refresh the page to try again.
            </p>
          </CardContent>
        </Card>
      )}

      {payments && payments.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CreditCard className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No payments yet</p>
            <p className="text-sm text-muted-foreground">
              Payments show up here once a milestone is paid out.
            </p>
          </CardContent>
        </Card>
      )}

      {payments && payments.length > 0 && (
        <Card className="p-0">
          <div>
            {payments.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} userId={userId} />
            ))}
          </div>
        </Card>
      )}

      {isCreator && payouts && payouts.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-foreground">Payout history</h2>
          <Card className="p-0">
            <div>
              {payouts.map((payout) => (
                <PayoutRow key={payout.id} payout={payout} />
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
