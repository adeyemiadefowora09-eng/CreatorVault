"use client";

import { useState } from "react";
import { AlertCircle, CreditCard, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePayments, usePaymentStats, usePayoutBalance, usePayouts, useRequestPayout } from "@/hooks/usePayments";
import { useMe } from "@/hooks/useProfile";
import { useAuthStore } from "@/stores/authStore";
import type { Payment, PaymentStatus, Payout, PayoutStatus } from "@/types/payments";

function formatAmount(amount: string | number, currency: string) {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(value || 0);
}

const STATUS_STYLES: Record<PaymentStatus, string> = {
  PENDING: "bg-amber-500/10 text-amber-600",
  PROCESSING: "bg-blue-500/10 text-blue-600",
  COMPLETED: "bg-emerald-500/10 text-emerald-600",
  FAILED: "bg-rose-500/10 text-rose-600",
  REFUNDED: "bg-slate-500/10 text-slate-600",
};

const PAYOUT_STATUS_STYLES: Record<PayoutStatus, string> = {
  PENDING: "bg-amber-500/10 text-amber-600",
  PROCESSING: "bg-blue-500/10 text-blue-600",
  COMPLETED: "bg-emerald-500/10 text-emerald-600",
  FAILED: "bg-rose-500/10 text-rose-600",
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function PaymentRow({ payment, userId }: { payment: Payment; userId: string | undefined }) {
  const isIncoming = payment.payeeId === userId;
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
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[payment.status]}`}
        >
          {payment.status}
        </span>
        <span className="w-28 text-right text-sm font-semibold text-foreground">
          {isIncoming ? "+" : "-"}
          {formatAmount(payment.amount, payment.currency)}
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
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${PAYOUT_STATUS_STYLES[payout.status]}`}
        >
          {payout.status}
        </span>
        <span className="w-28 text-right text-sm font-semibold text-foreground">
          -{formatAmount(payout.amount, payout.currency)}
        </span>
      </div>
    </div>
  );
}

function WithdrawCard() {
  const { data: me } = useMe();
  const { data: balance, isLoading } = usePayoutBalance();
  const requestPayout = useRequestPayout();
  const [amount, setAmount] = useState("");

  const hasBankDetails = Boolean(
    me?.creatorProfile?.bankAccountNumber && me?.creatorProfile?.bankName
  );
  const available = balance?.availableBalance ?? 0;

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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Available</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {isLoading ? "…" : formatAmount(available, "NGN")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending payouts</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {isLoading ? "…" : formatAmount(balance?.pendingPayouts ?? 0, "NGN")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total earned</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {isLoading ? "…" : formatAmount(balance?.totalEarned ?? 0, "NGN")}
            </p>
          </div>
        </div>

        {!hasBankDetails ? (
          <p className="text-sm text-muted-foreground">
            Add your bank details on your{" "}
            <a href="/profile" className="underline underline-offset-2">
              profile
            </a>{" "}
            before requesting a payout.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = Number(amount);
              if (value > 0) requestPayout.mutate(value, { onSuccess: () => setAmount("") });
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="max-w-[180px] flex-1 space-y-1.5">
              <label htmlFor="payout-amount" className="text-xs text-muted-foreground">
                Amount (NGN)
              </label>
              <Input
                id="payout-amount"
                type="number"
                min={1}
                max={available}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={requestPayout.isPending || !amount || Number(amount) <= 0 || Number(amount) > available}
            >
              {requestPayout.isPending ? "Requesting…" : "Request payout"}
            </Button>
          </form>
        )}

        {requestPayout.isError && (
          <p className="text-sm text-destructive">
            Couldn&apos;t request that payout — check the amount and try again.
          </p>
        )}
        {requestPayout.isSuccess && (
          <p className="text-sm text-emerald-600">
            Payout requested — it&apos;ll show in your history below once processed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function PaymentsPage() {
  const user = useAuthStore((s) => s.user);
  const { data: payments, isLoading, isError } = usePayments();
  const { data: stats } = usePaymentStats();
  const { data: payouts } = usePayouts();

  const isCreator = user?.role === "CREATOR";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Milestone payouts and payment history for your deals.
        </p>
      </header>

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isCreator ? (
            <>
              <StatCard label="Total earned" value={formatAmount(stats.earned ?? 0, "NGN")} />
              <StatCard label="Pending" value={formatAmount(stats.pending ?? 0, "NGN")} />
            </>
          ) : (
            <StatCard label="Total spent" value={formatAmount(stats.spent ?? 0, "NGN")} />
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
              <PaymentRow key={payment.id} payment={payment} userId={user?.id} />
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
