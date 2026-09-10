"use client";

import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDeal } from "@/hooks/useDeals";
import { DealFlow } from "@/components/deals/DealFlow";

export default function DealDetailPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const { data: deal, isLoading, isError } = useDeal(dealId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-400">
            Loading deal…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-600">
            Couldn't load this deal. Refresh the page to try again.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && deal && (
        <>
          <header>
            <h1 className="text-2xl font-semibold text-slate-900">{deal.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              With {deal.counterpartyName} — status: {deal.status}
            </p>
          </header>

          <Card>
            <CardHeader>
              <CardTitle>Deal flow</CardTitle>
              <CardDescription>
                {deal.status === "COMPLETED"
                  ? "Value has moved through the vault."
                  : "Value moves once this deal is marked complete."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DealFlow triggerKey={`${deal.id}-${deal.status}`} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}