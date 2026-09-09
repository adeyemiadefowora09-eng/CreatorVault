"use client";

import Link from "next/link";
import { Handshake, ShieldCheck, Gauge, CreditCard, ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuthStore } from "@/stores/authStore";
import { useTrustScore } from "@/hooks/useTrustScore";

const QUICK_LINKS = [
  {
    href: "/deals",
    icon: Handshake,
    title: "Deals",
    description: "View and manage your active and past deals.",
  },
  {
    href: "/deal-guardian",
    icon: ShieldCheck,
    title: "AI Deal Guardian",
    description: "Analyze a contract for risky clauses before you sign.",
  },
  {
    href: "/trust-score",
    icon: Gauge,
    title: "Trust Score",
    description: "See your current score and what's shaping it.",
  },
  {
    href: "/payments",
    icon: CreditCard,
    title: "Payments",
    description: "Track milestone payments and payout history.",
  },
] as const;

export default function DashboardHomePage() {
  const user = useAuthStore((s) => s.user);
  const { data: trustScore } = useTrustScore();

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's what's happening across your deals today.
          </p>
        </div>

        {trustScore && (
          <Link
            href="/trust-score"
            className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50"
          >
            <div>
              <p className="text-xs text-muted-foreground">Trust Score</p>
              <p className="text-xl font-semibold text-foreground">
                {trustScore.currentScore}
                <span className="text-sm font-normal text-muted-foreground">/100</span>
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        )}
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_LINKS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <CardTitle className="mt-2 text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Handshake className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">No recent deal activity yet</p>
          <p className="text-sm text-muted-foreground">
            Head over to{" "}
            <Link href="/deals" className="font-medium text-primary hover:underline">
              Deals
            </Link>{" "}
            to create or view one.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
