"use client";

/**
 * src/app/(dashboard)/payments/verify/[reference]/page.tsx
 *
 * Where the payment provider sends the brand back to
 * (`{CORS_ORIGIN}/payments/verify/<reference>`).
 *
 * Trust model:
 *  - The ONLY URL input used is the path `reference`, and it is format-checked
 *    before any API call. Query params a provider may append (trxref, status,
 *    success=true, …) are ignored — they are user-editable and prove nothing.
 *  - "Escrow Secured" is shown ONLY when the backend reports status COMPLETED.
 *    A 200 response alone is not success: the endpoint also answers 200 for a
 *    payment that is still pending, so we keep polling until the status is final.
 */

import { use, useEffect } from "react";
import Link from "next/link";
import axios from "axios";
import {
  AlertCircle,
  ArrowRight,
  Clock,
  Loader2,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useVerifyPayment } from "@/hooks/usePayments";
import { formatMoney } from "@/lib/money";
import { clearPendingPayment, getApiErrorMessage, isValidPaymentReference } from "@/lib/payments";

function Shell({
  icon,
  title,
  reference,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  reference?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center p-6">
      <Card className="w-full text-center">
        <CardHeader>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">{icon}</div>
          <CardTitle className="text-xl" role="status" aria-live="polite">
            {title}
          </CardTitle>
          {reference && <CardDescription className="break-all">Reference: {reference}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">{children}</CardContent>
      </Card>
    </div>
  );
}

function VerifyPayment({ reference }: { reference: string }) {
  const { data: payment, error, isError, isFetching, refetch, gaveUp } = useVerifyPayment(reference);

  const status = typeof payment?.status === "string" ? payment.status : undefined;
  useEffect(() => {
    if (status === "COMPLETED" || status === "FAILED" || status === "REFUNDED") clearPendingPayment();
  }, [status]);

  if (isError) {
    const code = axios.isAxiosError(error) ? error.response?.status : undefined;
    const notYours = code === 403 || code === 404;
    return (
      <Shell
        icon={<AlertCircle className="h-8 w-8 text-rose-600" aria-hidden="true" />}
        title="We couldn't check this payment"
        reference={reference}
      >
        <p>
          {notYours
            ? "We couldn't find a payment with that reference on your account."
            : getApiErrorMessage(error, "Something went wrong while checking your payment.")}
        </p>
        {!notYours && (
          <>
            <p className="font-medium text-foreground">If you already paid, don&apos;t pay again — check again first.</p>
            <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Check again
            </Button>
          </>
        )}
        <div>
          <Link href="/payments" className="text-primary underline underline-offset-2">
            Return to Payments
          </Link>
        </div>
      </Shell>
    );
  }

  if (status === "COMPLETED") {
    return (
      <Shell
        icon={<ShieldCheck className="h-8 w-8 text-emerald-600" aria-hidden="true" />}
        title="Escrow Secured"
        reference={reference}
      >
        <p>
          We&apos;ve confirmed your payment of{" "}
          <span className="font-semibold text-foreground">{formatMoney(payment?.amount, payment?.currency)}</span> and
          placed it into escrow custody. The creator has been notified to begin work on the milestone deliverables.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          {payment?.dealId ? (
            <Link href={`/deals/${payment.dealId}/milestones`}>
              <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                View Deal Milestones
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          ) : (
            <Link href="/payments">
              <Button className="w-full">
                View Payments Dashboard
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          )}
        </div>
      </Shell>
    );
  }

  if (status === "FAILED") {
    return (
      <Shell
        icon={<XCircle className="h-8 w-8 text-rose-600" aria-hidden="true" />}
        title="Payment didn't go through"
        reference={reference}
      >
        <p>Your payment wasn&apos;t completed, so nothing was placed into escrow. You can try again.</p>
        <Link href={payment?.dealId ? `/deals/${payment.dealId}/milestones` : "/payments"}>
          <Button variant="outline" className="w-full">
            {payment?.dealId ? "Back to milestones to try again" : "Return to Payments"}
          </Button>
        </Link>
      </Shell>
    );
  }

  if (status === "REFUNDED") {
    return (
      <Shell
        icon={<RotateCcw className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
        title="Payment refunded"
        reference={reference}
      >
        <p>This payment has been refunded.</p>
        <Link href="/payments" className="text-primary underline underline-offset-2">
          View payment history
        </Link>
      </Shell>
    );
  }

  // First load, or PENDING / PROCESSING / an unrecognised response: keep waiting, never assume success.
  return (
    <Shell
      icon={
        gaveUp ? (
          <Clock className="h-8 w-8 text-amber-500" aria-hidden="true" />
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        )
      }
      title={gaveUp ? "Still waiting for confirmation" : "Verifying Escrow Funding…"}
      reference={reference}
    >
      <p>
        {gaveUp
          ? "Your bank or the provider is taking longer than usual. Your milestone will update automatically once it's confirmed — you don't need to pay again."
          : "Connecting with the payment provider to confirm your payment. Please keep this page open and don't pay again."}
      </p>
      {gaveUp && (
        <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Check again
        </Button>
      )}
    </Shell>
  );
}

export default function PaymentVerifyPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);

  if (!isValidPaymentReference(reference)) {
    return (
      <Shell icon={<AlertCircle className="h-8 w-8 text-rose-600" aria-hidden="true" />} title="Invalid payment link">
        <p>That payment reference doesn&apos;t look right, so we didn&apos;t check it.</p>
        <Link href="/payments" className="text-primary underline underline-offset-2">
          Return to Payments
        </Link>
      </Shell>
    );
  }

  return <VerifyPayment reference={reference} />;
}
