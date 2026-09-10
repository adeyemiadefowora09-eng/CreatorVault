"use client";

import { useEffect, useState } from "react";
import { Coins, RotateCcw, ShieldCheck } from "lucide-react";

/**
 * Deal value flow — animates a coin traveling from the Brand into the
 * vault and out to the Creator, visualizing CreatorVault as the
 * trusted intermediary holding the deal.
 *
 * Drop this <style> block's keyframes into your global CSS (e.g. globals.css)
 * once, rather than repeating it per-component if you reuse these elsewhere.
 */

const styleSheet = `
@keyframes coin-travel {
  0% { left: 6%; opacity: 0; transform: translateY(0) scale(0.6); }
  10% { opacity: 1; transform: translateY(0) scale(1); }
  48% { left: 47%; transform: translateY(-14px) scale(1); }
  52% { transform: translateY(-14px) scale(0.85); }
  58% { transform: translateY(-14px) scale(1); }
  90% { opacity: 1; }
  100% { left: 88%; opacity: 0; transform: translateY(0) scale(0.6); }
}
@keyframes vault-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(217,180,79,0.35); }
  50% { box-shadow: 0 0 0 10px rgba(217,180,79,0); }
}
`;

interface DealFlowProps {
  /** Bump this whenever a deal actually completes (e.g. deal.id or a counter) to replay the animation */
  triggerKey: string | number;
}

export function DealFlow({ triggerKey }: DealFlowProps) {
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    setPulsing(true);
    const timeout = setTimeout(() => setPulsing(false), 1500);
    return () => clearTimeout(timeout);
  }, [triggerKey]);

  return (
    <div className="flex flex-col items-center gap-4">
      <style>{styleSheet}</style>
      <div className="relative w-full h-36 flex items-center justify-between px-2">
        <div className="w-11 h-11 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-400 font-medium z-10">
          BRAND
        </div>

        <div
          className={[
            "w-14 h-14 rounded-lg bg-zinc-900 border flex items-center justify-center z-10",
            pulsing ? "border-amber-500" : "border-zinc-800",
          ].join(" ")}
          style={pulsing ? { animation: "vault-pulse 1.5s ease-out" } : undefined}
        >
          <ShieldCheck className="w-6 h-6 text-amber-400" />
        </div>

        <div className="w-11 h-11 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-400 font-medium z-10">
          CREATOR
        </div>

        <Coins
          key={triggerKey}
          className="w-5 h-5 text-amber-400 absolute top-1/2 -translate-y-1/2"
          style={{ animation: "coin-travel 1.5s ease-in-out" }}
        />
      </div>
      <button
        onClick={() => {
          setPulsing(false);
          requestAnimationFrame(() => setPulsing(true));
        }}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-amber-400 transition-colors"
        type="button"
      >
        <RotateCcw className="w-3.5 h-3.5" /> Replay
      </button>
    </div>
  );
}
