"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ShieldAlert,
  ShieldX,
  Gavel,
  BadgeCheck,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TrustScoreEvent, TrustScoreSummary } from "@/types/trust-score";

const TIER_STYLES: Record<
  string,
  { label: string; badge: string; gauge: string }
> = {
  AT_RISK: {
    label: "At risk",
    badge: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20",
    gauge: "#E11D48",
  },
  BUILDING: {
    label: "Building",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
    gauge: "#D97706",
  },
  TRUSTED: {
    label: "Trusted",
    badge: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20",
    gauge: "#0284C7",
  },
  ELITE: {
    label: "Elite",
    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
    gauge: "#059669",
  },
};

// Helper function to safely extract tier styles regardless of casing/undefined state
function getTierStyle(tier?: string) {
  if (!tier) return TIER_STYLES.BUILDING;
  const normalizedKey = tier.toUpperCase();
  return TIER_STYLES[normalizedKey] || TIER_STYLES.BUILDING;
}

const EVENT_ICONS: Record<TrustScoreEvent["type"], React.ElementType> = {
  DEAL_COMPLETED: CheckCircle2,
  DEAL_CANCELLED: ShieldX,
  PAYMENT_ON_TIME: CheckCircle2,
  PAYMENT_LATE: Clock,
  AI_FLAG_CRITICAL: ShieldAlert,
  AI_FLAG_HIGH: ShieldAlert,
  DISPUTE_RESOLVED: Gavel,
  DISPUTE_LOST: Gavel,
  PROFILE_VERIFIED: BadgeCheck,
};

export function TierBadge({ tier }: { tier: TrustScoreSummary["tier"] }) {
  const style = getTierStyle(tier);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        style.badge
      )}
    >
      {style.label}
    </span>
  );
}

interface TrustScoreGaugeProps {
  score: number;
  tier: TrustScoreSummary["tier"];
  size?: number;
}

export function TrustScoreGauge({ score, tier, size = 220 }: TrustScoreGaugeProps) {
  const style = getTierStyle(tier);
  const clamped = Math.min(100, Math.max(0, score ?? 0));
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const halfCircumference = Math.PI * radius;
  const offset = halfCircumference * (1 - clamped / 100);
  const color = style.gauge;

  return (
    <div
      className="relative inline-flex flex-col items-center"
      role="img"
      aria-label={`Trust score ${clamped} out of 100, tier ${style.label}`}
    >
      <svg width={size} height={size / 2 + strokeWidth / 2} viewBox={`0 0 ${size} ${size / 2 + strokeWidth / 2}`}>
        <path
          d={`M ${strokeWidth / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${cy}`}
          fill="none"
          stroke="currentColor"
          className="text-slate-100"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d={`M ${strokeWidth / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={halfCircumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 700ms ease-out" }}
        />
      </svg>
      <div className="absolute bottom-0 flex flex-col items-center">
        <span className="text-4xl font-semibold tabular-nums text-slate-900">{clamped}</span>
        <span className="text-xs text-slate-500">out of 100</span>
      </div>
    </div>
  );
}

export function EventDeltaRow({ event }: { event: TrustScoreEvent }) {
  const Icon = EVENT_ICONS[event.type] || CheckCircle2;
  const isPositive = event.pointsDelta >= 0;

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-700">{event.label}</p>
          <p className="text-xs text-slate-400">
            {new Date(event.occurredAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      </div>
      <span
        className={cn(
          "flex shrink-0 items-center gap-0.5 text-sm font-medium tabular-nums",
          isPositive ? "text-emerald-600" : "text-rose-600"
        )}
      >
        {isPositive ? (
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {isPositive ? "+" : ""}
        {event.pointsDelta}
      </span>
    </div>
  );
}

export function TrustScoreBreakdown({ summary }: { summary: TrustScoreSummary }) {
  const change = (summary?.currentScore ?? 0) - (summary?.previousScore ?? 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 pt-6">
          <TrustScoreGauge score={summary?.currentScore ?? 0} tier={summary?.tier} />
          <TierBadge tier={summary?.tier} />
          {change !== 0 && (
            <p
              className={cn(
                "text-xs font-medium",
                change > 0 ? "text-emerald-600" : "text-rose-600"
              )}
            >
              {change > 0 ? "+" : ""}
              {change} since last update
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <CardDescription>What&apos;s moved your score lately.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100">
          {!summary?.recentEvents || summary.recentEvents.length === 0 ? (
            <p className="py-4 text-sm text-slate-400">
              No scoring activity yet — complete a deal to get started.
            </p>
          ) : (
            summary.recentEvents.map((event) => <EventDeltaRow key={event.id} event={event} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}