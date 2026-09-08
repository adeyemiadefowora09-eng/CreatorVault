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

const RISK_STYLES: Record<
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

interface ContractUploadFormProps {
  onSubmit: (payload: AnalyzeContractPayload) => void;
  isSubmitting?: boolean;
}

const ACCEPTED_TYPES = [".pdf", ".doc", ".docx"];
const MAX_FILE_SIZE_MB = 15;

export function ContractUploadForm({ onSubmit, isSubmitting }: ContractUploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UploadFormValues>({
    defaultValues: { dealTitle: "", counterpartyName: "" },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const extension = `.${selected.name.split(".").pop()?.toLowerCase()}`;
    if (!ACCEPTED_TYPES.includes(extension)) {
      setFileError("Upload a PDF or Word document.");
      setFile(null);
      return;
    }
    if (selected.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setFileError(`File must be under ${MAX_FILE_SIZE_MB}MB.`);
      setFile(null);
      return;
    }

    setFileError(null);
    setFile(selected);
  }

  function submit(values: UploadFormValues) {
    if (!file) {
      setFileError("Attach the contract you want analyzed.");
      return;
    }
    onSubmit({ file, ...values });
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="dealTitle">Deal title</Label>
        <Input
          id="dealTitle"
          placeholder="e.g. Q4 Sponsored Reel — Aura Skincare"
          aria-invalid={Boolean(errors.dealTitle)}
          {...register("dealTitle", { required: "Give this deal a name." })}
        />
        {errors.dealTitle && (
          <p className="text-sm text-rose-600">{errors.dealTitle.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="counterpartyName">Brand / counterparty</Label>
        <Input
          id="counterpartyName"
          placeholder="e.g. Aura Skincare Ltd."
          aria-invalid={Boolean(errors.counterpartyName)}
          {...register("counterpartyName", { required: "Who is the other party?" })}
        />
        {errors.counterpartyName && (
          <p className="text-sm text-rose-600">{errors.counterpartyName.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contractFile">Contract file</Label>

        {!file ? (
          <label
            htmlFor="contractFile"
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed",
              "border-slate-300 bg-slate-50/60 px-6 py-8 text-center transition-colors hover:bg-slate-50",
              "focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2"
            )}
          >
            <UploadCloud className="h-6 w-6 text-slate-400" aria-hidden="true" />
            <span className="text-sm font-medium text-slate-700">
              Click to upload, or drag a file here
            </span>
            <span className="text-xs text-slate-400">PDF or Word, up to {MAX_FILE_SIZE_MB}MB</span>
            <input
              id="contractFile"
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
              <span className="truncate text-sm text-slate-700">{file.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {fileError && <p className="text-sm text-rose-600">{fileError}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Analyzing contract…" : "Run Deal Guardian analysis"}
      </Button>
    </form>
  );
}

export function FlaggedClauseCard({ clause }: { clause: FlaggedClause }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-900">{clause.clauseTitle}</h4>
        <RiskBadge level={clause.riskLevel} />
      </div>
      <blockquote className="mt-2 border-l-2 border-slate-200 pl-3 text-sm italic text-slate-500">
        {clause.excerpt}
      </blockquote>
      <p className="mt-2 text-sm text-slate-600">{clause.explanation}</p>
    </div>
  );
}

export function RecommendationList({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-slate-700">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function DealGuardianReportView({ report }: { report: DealGuardianReport }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{report.contractName}</CardTitle>
            <CardDescription>
              Analyzed {new Date(report.analyzedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </CardDescription>
          </div>
          <RiskBadge level={report.riskLevel} className="self-start sm:self-auto" />
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <SafetyScoreRing score={report.safetyScore} level={report.riskLevel} />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
            <p className="mt-1 text-sm text-slate-600">{report.summary}</p>
          </div>
        </CardContent>
      </Card>

      {report.flaggedClauses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Flagged clauses ({report.flaggedClauses.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.flaggedClauses.map((clause) => (
              <FlaggedClauseCard key={clause.id} clause={clause} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <RecommendationList items={report.recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}