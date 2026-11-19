"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function VerifyPaymentPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = use(params);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [dealId, setDealId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function verify() {
      try {
        const response = await api.post(`/payments/verify/${encodeURIComponent(reference)}`);
        if (!isMounted) return;

        const data = response.data?.data || response.data;
        if (data?.dealId) {
          setDealId(data.dealId);
        }
        setStatus("success");
      } catch (err: any) {
        if (!isMounted) return;
        setStatus("error");
        setErrorMessage(
          err.response?.data?.message || "Could not verify payment with Payaza. Please check your bank or contact support."
        );
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [reference]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center p-6">
      <Card className="w-full text-center">
        <CardHeader>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            {status === "loading" && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
            {status === "success" && <ShieldCheck className="h-8 w-8 text-emerald-600" />}
            {status === "error" && <AlertCircle className="h-8 w-8 text-rose-600" />}
          </div>
          <CardTitle className="text-xl">
            {status === "loading" && "Verifying Escrow Funding..."}
            {status === "success" && "Escrow Secured 🛡️"}
            {status === "error" && "Verification Incomplete"}
          </CardTitle>
          <CardDescription>Reference: {reference}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <p className="text-sm text-muted-foreground">
              Connecting with Payaza to confirm your payment settlement into the CreatorVault Escrow Vault.
            </p>
          )}

          {status === "success" && (
            <>
              <p className="text-sm text-muted-foreground">
                Your payment has been confirmed and placed into escrow custody. The creator has been notified to begin work on the milestone deliverables.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                {dealId ? (
                  <Link href={`/deals/${dealId}/milestones`}>
                    <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                      View Deal Milestones
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                ) : (
                  <Link href="/payments">
                    <Button className="w-full">
                      View Payments Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                )}
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <p className="text-sm text-rose-600">{errorMessage}</p>
              <div className="pt-2">
                <Link href="/payments">
                  <Button variant="outline" className="w-full">
                    Return to Payments
                  </Button>
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
