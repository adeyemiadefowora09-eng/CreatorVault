"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ContractUploadForm,
  DealGuardianReportView,
  RiskBadge,
} from "@/components/deal-guardian";
import { useAnalyzeContract, useDealGuardianReports } from "@/hooks/useDealGuardian";
import type { DealGuardianReport } from "@/types/deal-guardian";

export default function DealGuardianPage() {
  const { data: reports, isLoading: isLoadingReports } = useDealGuardianReports();
  const analyzeContract = useAnalyzeContract();
  const [selectedReport, setSelectedReport] = useState<DealGuardianReport | null>(null);

  const activeReport = selectedReport ?? reports?.[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">AI Deal Guardian</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a contract before you sign — Guardian flags risky clauses and gives you a
          safety score in seconds.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* Upload column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Analyze a new contract</CardTitle>
              <CardDescription>PDF or Word, up to 15MB.</CardDescription>
            </CardHeader>
            <CardContent>
              <ContractUploadForm
                isSubmitting={analyzeContract.isPending}
                onSubmit={(payload) =>
                  analyzeContract.mutate(payload, {
                    onSuccess: (report) => setSelectedReport(report),
                  })
                }
              />
              {analyzeContract.isError && (
                <p className="mt-3 text-sm text-rose-600">
                  Something went wrong analyzing that file. Try again.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
              <CardDescription>Your last {reports?.length ?? 0} analyses.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {isLoadingReports && (
                <p className="text-sm text-slate-400">Loading history…</p>
              )}

              {!isLoadingReports && reports?.length === 0 && (
                <p className="text-sm text-slate-400">
                  No contracts analyzed yet — upload one to get started.
                </p>
              )}

              {reports?.map((report) => (
                <button
                  key={report.id}
                  onClick={() => setSelectedReport(report)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${
                    activeReport?.id === report.id ? "bg-slate-50" : ""
                  }`}
                >
                  <span className="truncate text-slate-700">{report.contractName}</span>
                  <RiskBadge level={report.riskLevel} />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Report column */}
        <div>
          {activeReport ? (
            <DealGuardianReportView report={activeReport} />
          ) : (
            <Card className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <ShieldCheck className="h-8 w-8 text-slate-300" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-slate-700">No report selected</p>
                <p className="mt-1 text-sm text-slate-400">
                  Upload a contract, or pick a past analysis from the history list.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}