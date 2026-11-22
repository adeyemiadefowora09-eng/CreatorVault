"use client";

import { useState } from "react";
import { AlertCircle, CreditCard, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBanks, usePayments, usePaymentStats, usePayoutBalance, usePayouts, useRequestPayout, usePaymentMode, useResolveBank, useSaveBank } from "@/hooks/usePayments";
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
  EXPIRED: "bg-slate-500/10 text-slate-600",
  REVIEW: "bg-rose-500/10 text-rose-600",
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

function PayoutAccountCard() {
  const { data: me } = useMe();
  const { data: banks } = useBanks();
  const resolve = useResolveBank();
  const save = useSaveBank();
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const p = me?.creatorProfile;
  const verified = Boolean(p?.bankAccountNumber && p?.bankName);
  const resolved = resolve.data?.accountName;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payout bank account</CardTitle>
        <CardDescription>
          We verify the account name with your bank before saving. After a change, withdrawals pause for a security period.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {verified && (
          <p className="text-sm text-foreground">
            {p?.bankName} ••••{p?.bankAccountNumber?.slice(-4)} · {p?.bankAccountName}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label htmlFor="bank" className="text-xs text-muted-foreground">Bank</label>
            <select id="bank" value={bankCode} onChange={(e) => { setBankCode(e.target.value); resolve.reset(); }} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Select bank…</option>
              {(banks ?? []).map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="acct" className="text-xs text-muted-foreground">Account number</label>
            <Input id="acct" inputMode="numeric" maxLength={10} value={accountNumber} onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, "")); resolve.reset(); }} placeholder="0123456789" />
          </div>
          <Button size="sm" variant="secondary" disabled={!bankCode || accountNumber.length !== 10 || resolve.isPending} onClick={() => resolve.mutate({ bankCode, accountNumber })}>
            {resolve.isPending ? "Verifying…" : "Verify account"}
          </Button>
        </div>
        {resolve.isError && <p className="text-sm text-destructive">We couldn&apos;t verify that account. Check the bank and number.</p>}
        {resolved && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p>Account name: <strong>{resolved}</strong></p>
            <p className="text-xs text-muted-foreground">Only continue if this is your account.</p>
            <Button size="sm" className="mt-2" disabled={save.isPending} onClick={() => save.mutate({ bankCode, accountNumber, confirmedAccountName: resolved }, { onSuccess: () => { resolve.reset(); setAccountNumber(""); } })}>
              {save.isPending ? "Saving…" : "Yes, this is my account — save"}
            </Button>
          </div>
        )}
        {save.isSuccess && <p className="text-sm text-emerald-600">Saved. Withdrawals are paused briefly as a security measure.</p>}
        {save.isError && <p className="text-sm text-destructive">Couldn&apos;t save — you may have a payout in progress, or the name didn&apos;t match.</p>}
      </CardContent>
    </Card>
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
  const inEscrow = balance?.inEscrow ?? 0;
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
            <p className="text-xs text-muted-foreground">In escrow (awaiting approval)</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {isLoading ? "…" : formatAmount(inEscrow, "NGN")}
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
            Verify your bank account in the{" "}
            payout account card above
            {" "}before requesting a payout.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = Number(amount);
              if (value > 0) requestPayout.mutate(amount.trim(), { onSuccess: () => setAmount("") });
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
            Couldn&apos;t request that payout — check the amount, your verified bank account and the minimum withdrawal.
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
  const { data: paymentMode } = usePaymentMode();

  const isCreator = user?.role === "CREATOR";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escrow funding, earnings and withdrawals for your deals.
        </p>
      </header>

      {paymentMode && paymentMode.mode === "disabled" && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Payments are switched off on this server, so no money can be funded or withdrawn.</span>
        </div>
      )}
      {paymentMode && paymentMode.mode === "sandbox" && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Sandbox mode: this uses Payaza&apos;s test environment. No real money moves, and sandbox balances can never be withdrawn in live mode.</span>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isCreator ? (
            <>
              <StatCard label="Total earned" value={formatAmount(stats.earned ?? 0, "NGN")} />
              <StatCard label="In escrow (awaiting approval)" value={formatAmount(stats.pending ?? 0, "NGN")} />
            </>
          ) : (
            <>
              <StatCard label="Total funded" value={formatAmount(stats.spent ?? 0, "NGN")} />
              <StatCard label="Held in escrow" value={formatAmount(stats.inEscrow ?? 0, "NGN")} />
            </>
          )}
        </div>
      )}

      {isCreator && <PayoutAccountCard />}
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
