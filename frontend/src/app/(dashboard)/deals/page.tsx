"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDeals } from "@/hooks/useDeals";

export default function DealsPage() {
  const { data: deals, isLoading, isError } = useDeals();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Deals</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every brand deal you've created or been invited into, in one place.
        </p>
      </header>

      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-400">
            Loading your deals…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-600">
            Couldn't load your deals. Refresh the page to try again.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && deals?.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-400">
            No deals yet — once you create one, it'll show up here.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && deals && deals.length > 0 && (
        <div className="space-y-3">
          {deals.map((deal) => (
            <Link key={deal.id} href={`/deals/${deal.id}`}>
              <Card className="transition-colors hover:border-amber-300">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>{deal.title}</CardTitle>
                    <CardDescription>{deal.counterpartyName}</CardDescription>
                  </div>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {deal.status}
                  </span>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}