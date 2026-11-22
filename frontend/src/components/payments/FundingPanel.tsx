"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSimulateSandboxPayment, useVerifyPayment } from "@/hooks/usePayments";
import type { Payment } from "@/types/payments";

/** Shows the one-time bank account a brand must transfer the exact amount to (escrow funding). */
export function FundingPanel({ payment, sandbox }: { payment: Payment; sandbox: boolean }) {
  const verify = useVerifyPayment();
  const simulate = useSimulateSandboxPayment();
  const [copied, setCopied] = useState(false);
  const va = payment.virtualAccount;
  if (!va || !payment.providerRef) return null;
  const amount = new Intl.NumberFormat("en-NG", { style: "currency", currency: payment.currency }).format(Number(payment.amount));

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <p className="font-medium text-foreground">Transfer exactly {amount} to:</p>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Bank</dt><dd>{va.bankName}</dd>
        <dt className="text-muted-foreground">Account number</dt>
        <dd className="flex items-center gap-2 font-mono">{va.accountNumber}
          <button type="button" className="text-xs underline" onClick={() => { navigator.clipboard?.writeText(va.accountNumber); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</button>
        </dd>
        <dt className="text-muted-foreground">Account name</dt><dd>{va.accountName}</dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        This account is for this milestone only{payment.expiresAt ? ` and expires ${new Date(payment.expiresAt).toLocaleTimeString()}` : ""}. Other amounts are rejected by the bank. Your payment is held in escrow until you approve the work.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={verify.isPending} onClick={() => verify.mutate(payment.providerRef!)}>
          {verify.isPending ? "Checking…" : "I've paid — check status"}
        </Button>
        {sandbox && (
          <Button size="sm" variant="ghost" disabled={simulate.isPending} onClick={() => simulate.mutate(payment.providerRef!)}>
            {simulate.isPending ? "Simulating…" : "Sandbox: simulate bank transfer"}
          </Button>
        )}
      </div>
      {verify.data && verify.data.status === "PENDING" && <p className="text-xs text-amber-600">Not received yet — it can take a minute after you transfer.</p>}
      {verify.data && verify.data.status === "REVIEW" && <p className="text-xs text-destructive">We received a different amount. Support will contact you; nothing is lost.</p>}
      {(verify.isError || simulate.isError) && <p className="text-xs text-destructive">Couldn&apos;t reach the payment provider. Try again shortly.</p>}
    </div>
  );
}
