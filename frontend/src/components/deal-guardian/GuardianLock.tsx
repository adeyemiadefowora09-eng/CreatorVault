"use client";

import { useEffect, useState } from "react";
import { Lock, Unlock, ShieldAlert, ShieldCheck, ScanLine } from "lucide-react";

/**
 * AI Guardian lock — plays a scan animation while the contract analysis
 * request is in flight, then resolves into an unlocked (safe) or
 * locked-and-shaking (risky) state based on the AI's risk level.
 *
 * Drop this <style> block's keyframes into your global CSS (e.g. globals.css)
 * once, rather than repeating it per-component if you reuse these elsewhere.
 */

const styleSheet = `
@keyframes lock-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-3px); }
  40% { transform: translateX(3px); }
  60% { transform: translateX(-2px); }
  80% { transform: translateX(2px); }
}
@keyframes scan-line {
  0% { top: 8%; opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  100% { top: 88%; opacity: 0; }
}
`;

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface GuardianLockProps {
  /** Risk level returned from your ContractAnalysisResult. Undefined while loading. */
  riskLevel?: RiskLevel;
  /** True while the /api/contracts/analyze request is in flight */
  isAnalyzing: boolean;
}

export function GuardianLock({ riskLevel, isAnalyzing }: GuardianLockProps) {
  const [phase, setPhase] = useState<"idle" | "scanning" | "safe" | "risky">("idle");

  useEffect(() => {
    if (isAnalyzing) {
      setPhase("scanning");
      return;
    }
    if (!riskLevel) {
      setPhase("idle");
      return;
    }

    // LOW/MEDIUM read as "cleared", HIGH/CRITICAL read as "hold" —
    // adjust this split if you want a distinct amber state for MEDIUM/HIGH.
    const isRisky = riskLevel === "HIGH" || riskLevel === "CRITICAL";
    setPhase(isRisky ? "risky" : "safe");
  }, [isAnalyzing, riskLevel]);

  return (
    <div className="flex flex-col items-center gap-4">
      <style>{styleSheet}</style>
      <div className="relative w-36 h-36 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
        {phase === "scanning" && (
          <div
            className="absolute left-0 right-0 h-px bg-amber-400/80 shadow-[0_0_8px_2px_rgba(217,180,79,0.6)]"
            style={{ animation: "scan-line 1.6s ease-in-out infinite" }}
          />
        )}
        <div
          className={[
            "flex flex-col items-center gap-2",
            phase === "risky" ? "text-red-400" : phase === "scanning" ? "text-zinc-400" : phase === "idle" ? "text-zinc-500" : "text-emerald-400",
          ].join(" ")}
          style={phase === "risky" ? { animation: "lock-shake 0.5s ease-in-out" } : undefined}
        >
          {phase === "scanning" && <ScanLine className="w-9 h-9" />}
          {phase === "safe" && <Unlock className="w-9 h-9" />}
          {phase === "risky" && <Lock className="w-9 h-9" />}
          {phase === "idle" && <Lock className="w-9 h-9" />}
          <span className="text-[10px] tracking-wide">
            {phase === "scanning"
              ? "SCANNING CONTRACT"
              : phase === "safe"
              ? "CLEARED"
              : phase === "idle"
              ? "AWAITING CONTRACT"
              : `${riskLevel} RISK — HOLD`}
          </span>
        </div>
      </div>
      {!isAnalyzing && riskLevel && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          {phase === "safe" ? (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
          )}
          Risk level: {riskLevel}
        </div>
      )}
    </div>
  );
}
