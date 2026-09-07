"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldQuestion, UploadCloud, FileText, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import type {
  AnalyzeContractPayload,
  DealGuardianReport,
  FlaggedClause,
  RiskLevel,
} from "@/types/deal-guardian";

const RISK_STYLES: Record
  RiskLevel,
  { label: string; badge: string; ring: string; icon: React.ElementType; text: string }
> = {
  LOW: {
    label: "Low risk",
    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
    ring: "#059669",
    text: "text-emerald-700",
    icon: ShieldCheck,
  },
  MEDIUM: {
    label: "Medium risk",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
    ring: "#D97706",
    text: "text-amber-700",
    icon: ShieldQuestion,
  },
  HIGH: {
    label: "High risk",
    badge: "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20",
    ring: "#EA580C",
    text: "text-orange-700",
    icon: ShieldAlert,
  },
  CRITICAL: {
    label: "Critical risk",
    badge: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20",
    ring: "#E11D48",
    text: "text-rose-700",
    icon: AlertTriangle,
  },
};

interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
}

export function RiskBadge({ level, className }: RiskBadgeProps) {
  const style = RISK_STYLES[level];
  const Icon = style.icon;

  return (
    <span
      role="status"
      aria-label={style.label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        style.badge,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {style.label}
    </span>
  );
}

interface SafetyScoreRingProps {
  score: number;
  level: RiskLevel;
  size?: number;
}

export function SafetyScoreRing({ score, level, size = 128 }: SafetyScoreRingProps) {
  const clamped = Math.min(100, Math.max(0, score));
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const color = RISK_STYLES[level].ring;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Safety score ${clamped} out of 100, ${RISK_STYLES[level].label}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={8}
          fill="none"
          className="text-slate-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 700ms ease-out" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-semibold tabular-nums text-slate-900">{clamped}</span>
        <span className="text-xs text-slate-500">/ 100</span>
      </div>
    </div>
  );
}

interface UploadFormValues {
  dealTitle: string;
  counterpartyName: string;
}

interface