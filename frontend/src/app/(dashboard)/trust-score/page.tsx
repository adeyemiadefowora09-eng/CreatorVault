"use client";

import { AlertCircle } from "lucide-react";

import { TrustScoreBreakdown } from "@/components/trust-score";
import { useTrustScore } from "@/hooks/useTrustScore";
import { Card, CardContent } from "@/components/ui/card";

export default function TrustScorePage() {
  const { data: summary, isLoading, isError } = useTrustScore();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Trust Score</h1>
        <p className="mt-1 text-sm text-slate-500">
          A living measure of how reliably you deliver on deals — everyone starts at 50.
        </p>
      </header>

      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-400">
            Loading your trust score…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-rose-400" aria-hidden="true" />
            <p className="text-sm text-slate-600">
              Couldn&apos;t load your trust score. Refresh the page to try again.
            </p>
          </CardContent>
        </Card>
      )}

      {summary && <TrustScoreBreakdown summary={summary} />}
    </div>
  );
}