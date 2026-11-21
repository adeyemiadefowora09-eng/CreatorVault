"use client";

/**
 * src/components/payments/PayButton.tsx
 *
 * "Fund escrow" button for brands.
 *
 * What it does:
 *  1. Locks itself the instant it is clicked (no double-submit), and stays
 *     locked while the browser is handed over to the provider's checkout.
 *  2. Calls POST /payments/initialize with a per-intent Idempotency-Key.
 *  3. LIVE mode: validates the returned checkout URL (https + allow-listed
 *     host) before navigating, then redirects in the SAME tab so the provider's
 *     callback lands back on /payments/verify/:reference.
 *  4. DEMO mode (backend has no provider credentials -> no checkoutUrl): shows
 *     a clearly-labelled "simulate payment" step. The backend decides whether
 *     that is allowed; the client never marks anything funded itself.
 *
 * It never touches a balance or milestone status. The UI only shows "funded"
 * once the backend says so (react-query refetch after verification).
 */

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConfirmMockPayment, useInitializePayment } from "@/hooks/usePayments";
import {
  getApiErrorMessage,
  isSafeCheckoutUrl,
  isValidPaymentReference,
  newIdempotencyKey,
  rememberPendingPayment,
} from "@/lib/payments";

interface PayButtonProps {
  dealId: string;
  milestoneId: string;
  label?: string;
  /** Extra classes for the button (e.g. the green "Fund Escrow" styling). */
  className?: string;
  /** Optional leading icon. */
  icon?: React.ReactNode;
}

export function PayButton({ dealId, milestoneId, label = "Pay securely", className, icon }: PayButtonProps) {
  const initializePayment = useInitializePayment();
  const confirmMock = useConfirmMockPayment();
  // Same key for retries of the same intent; replaced only after a confirmed success.
  const idempotencyKey = useRef<string>(newIdempotencyKey());
  // Synchronous lock: React state updates are async, a ref blocks a fast second click.
  const lockedRef = useRef(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set only when the backend says this is a demo (simulated) payment.
  const [demoReference, setDemoReference] = useState<string | null>(null);
  const [demoDone, setDemoDone] = useState(false);

  const unlock = () => {
    lockedRef.current = false;
    setLocked(false);
  };

  const handlePay = () => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    setError(null);

    initializePayment.mutate(
      { dealId, milestoneId, idempotencyKey: idempotencyKey.current },
      {
        onSuccess: ({ payment, checkoutUrl, mock, reference }) => {
          const ref = reference ?? payment.providerRef;

          if (checkoutUrl) {
            if (!isSafeCheckoutUrl(checkoutUrl)) {
              setError("We couldn't verify the payment page address, so we stopped. Please contact support before trying again.");
              unlock();
              return;
            }
            if (isValidPaymentReference(ref)) rememberPendingPayment(ref);
            idempotencyKey.current = newIdempotencyKey();
            // Stay locked: the page is about to unload.
            window.location.assign(checkoutUrl);
            return;
          }

          if (mock && isValidPaymentReference(ref)) {
            idempotencyKey.current = newIdempotencyKey();
            setDemoReference(ref);
            return; // stay locked until the demo step is resolved
          }

          setError("The payment page didn't open. Please try again.");
          unlock();
        },
        onError: (err) => {
          setError(getApiErrorMessage(err, "We couldn't start that payment. Please try again."));
          unlock();
        },
      }
    );
  };

  const handleConfirmDemo = () => {
    if (!demoReference || confirmMock.isPending) return;
    confirmMock.mutate(demoReference, {
      onSuccess: () => setDemoDone(true),
      onError: (err) => setError(getApiErrorMessage(err, "The simulated payment couldn't be confirmed.")),
    });
  };

  if (demoReference) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        {demoDone ? (
          <p role="status" className="text-emerald-700">
            Simulated payment confirmed — escrow shows as funded once the page refreshes its data.
          </p>
        ) : (
          <>
            <p className="text-amber-800 dark:text-amber-300">
              Demo mode: no real payment provider is connected, so this payment is simulated and no real money moves.
            </p>
            <Button size="sm" className="mt-2" onClick={handleConfirmDemo} disabled={confirmMock.isPending}>
              {confirmMock.isPending ? "Confirming…" : "Simulate successful payment"}
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="mt-2 text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <Button size="sm" onClick={handlePay} disabled={locked} aria-busy={locked} className={className}>
        {locked ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Starting checkout…
          </>
        ) : (
          <>
            {icon}
            {label}
          </>
        )}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
