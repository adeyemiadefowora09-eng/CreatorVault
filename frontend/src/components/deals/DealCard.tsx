import Link from "next/link";
import type { Deal, DealStatus } from "@/types/deals";

const STATUS_STYLES: Record<DealStatus, string> = {
  DRAFT: "bg-slate-500/10 text-slate-600",
  PROPOSED: "bg-amber-500/10 text-amber-600",
  NEGOTIATING: "bg-amber-500/10 text-amber-600",
  ACTIVE: "bg-blue-500/10 text-blue-600",
  COMPLETED: "bg-emerald-500/10 text-emerald-600",
  DISPUTED: "bg-rose-500/10 text-rose-600",
  CANCELLED: "bg-slate-500/10 text-slate-500",
};

export function DealStatusBadge({ status }: { status: DealStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function formatAmount(amount: string, currency: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(
    parseFloat(amount) || 0
  );
}

export function DealCard({ deal, currentUserId }: { deal: Deal; currentUserId?: string }) {
  const counterparty = deal.creatorId === currentUserId ? deal.brand : deal.creator;
  return (
    <Link
      href={`/deals/${deal.id}`}
      className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{deal.title}</p>
        <p className="text-xs text-muted-foreground">
          with {counterparty.name} · {formatAmount(deal.amount, deal.currency)}
        </p>
      </div>
      <DealStatusBadge status={deal.status} />
    </Link>
  );
}
