"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

/**
 * Trust Score "vault dial" — animates the ring sweeping up to the
 * real score with an eased ease-out-cubic curve, like a combination
 * dial settling into place rather than a bar just filling instantly.
 */

interface TrustDialProps {
  /** 0-100 trust score, e.g. from GET /api/users/:id/trust-score */
  score: number;
}

export function TrustDial({ score: target }: TrustDialProps) {
  const [displayScore, setDisplayScore] = useState(0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayScore / 100) * circumference;

  const run = () => {
    setDisplayScore(0);
    const start = performance.now();
    const duration = 1400;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      setDisplayScore(Math.round(eased * target));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // Re-run whenever the underlying score changes (e.g. after a new review)
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#27272a" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="#d9b44f"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 80ms linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold text-zinc-100 tabular-nums">
            {displayScore}
          </span>
          <span className="text-[10px] tracking-wide text-zinc-500">TRUST SCORE</span>
        </div>
      </div>
      <button
        onClick={run}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-amber-400 transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" /> Replay
      </button>
    </div>
  );
}
