"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { AlertCircle, Plus, Scale } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateDispute, useDisputes, useResolveDispute } from "@/hooks/useDisputes";
import { useAuthStore } from "@/stores/authStore";
import type { CreateDisputeInput, Dispute, DisputeStatus } from "@/types/disputes";

// Matches the real DisputeStatus enum (OPEN | UNDER_REVIEW | RESOLVED |
// ESCALATED) — this used to have a "DISMISSED" entry that doesn't exist as
// a status (it's an outcome once RESOLVED) and was missing ESCALATED.
const STATUS_STYLES: Record<DisputeStatus, string> = {
  OPEN: "bg-amber-500/10 text-amber-600",
  UNDER_REVIEW: "bg-blue-500/10 text-blue-600",
  RESOLVED: "bg-emerald-500/10 text-emerald-600",
  ESCALATED: "bg-rose-500/10 text-rose-600",
};

function ResolveDisputeControls({ dispute }: { dispute: Dispute }) {
  const [resolution, setResolution] = useState("");
  const resolveDispute = useResolveDispute();

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-foreground/15 p-3">
      <Label htmlFor={`resolution-${dispute.id}`} className="text-xs text-muted-foreground">
        Admin: resolve this dispute
      </Label>
      <Textarea
        id={`resolution-${dispute.id}`}
        rows={2}
        placeholder="Explain the decision (10+ characters)…"
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => resolveDispute.mutate({ id: dispute.id, outcome: "UPHELD", resolution })}
          disabled={resolveDispute.isPending || resolution.length < 10}
        >
          Uphold (dock respondent)
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => resolveDispute.mutate({ id: dispute.id, outcome: "DISMISSED", resolution })}
          disabled={resolveDispute.isPending || resolution.length < 10}
        >
          Dismiss
        </Button>
      </div>
      {resolveDispute.isError && (
        <p className="text-sm text-destructive">Couldn&apos;t resolve — try again.</p>
      )}
    </div>
  );
}

function DisputeCard({ dispute, isAdmin }: { dispute: Dispute; isAdmin: boolean }) {
  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-foreground">{dispute.deal.title}</p>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[dispute.status]}`}
          >
            {dispute.status.replace("_", " ")}
            {dispute.outcome ? ` · ${dispute.outcome}` : ""}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{dispute.reason}</p>
        {dispute.resolution && (
          <p className="rounded-lg bg-muted/50 p-2 text-sm text-foreground">
            <span className="font-medium">Resolution: </span>
            {dispute.resolution}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Opened {new Date(dispute.createdAt).toLocaleDateString()}
        </p>
        {isAdmin && dispute.status !== "RESOLVED" && (
          <ResolveDisputeControls dispute={dispute} />
        )}
      </CardContent>
    </Card>
  );
}

function RaiseDisputeForm({ onDone }: { onDone: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateDisputeInput>();
  const createDispute = useCreateDispute();

  const onSubmit = (values: CreateDisputeInput) => {
    createDispute.mutate(values, { onSuccess: onDone });
  };

  return (
    <Card>
      <CardContent className="py-5">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dealId">Deal ID</Label>
            <Input
              id="dealId"
              placeholder="The deal this dispute is about"
              aria-invalid={Boolean(errors.dealId)}
              {...register("dealId", { required: "Deal ID is required" })}
            />
            {errors.dealId && (
              <p className="text-sm text-destructive">{errors.dealId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason">What happened?</Label>
            <Textarea
              id="reason"
              rows={4}
              placeholder="Describe the issue in at least 20 characters…"
              aria-invalid={Boolean(errors.reason)}
              {...register("reason", {
                required: "Please describe the issue",
                minLength: { value: 20, message: "Please provide a bit more detail (20+ characters)" },
              })}
            />
            {errors.reason && (
              <p className="text-sm text-destructive">{errors.reason.message}</p>
            )}
          </div>

          {createDispute.isError && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Couldn&apos;t raise the dispute. Check the deal ID and try again.</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={createDispute.isPending}>
              {createDispute.isPending ? "Submitting…" : "Raise dispute"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function DisputesPage() {
  const [showForm, setShowForm] = useState(false);
  const { data: disputes, isLoading, isError } = useDisputes();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Disputes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track and raise disputes on deals you&apos;re part of.
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Raise a dispute
          </Button>
        )}
      </header>

      {showForm && <RaiseDisputeForm onDone={() => setShowForm(false)} />}

      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading disputes…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-rose-500" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load your disputes. Refresh the page to try again.
            </p>
          </CardContent>
        </Card>
      )}

      {disputes && disputes.length === 0 && !showForm && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Scale className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No disputes</p>
            <p className="text-sm text-muted-foreground">
              You have no open or past disputes. Hopefully it stays that way.
            </p>
          </CardContent>
        </Card>
      )}

      {disputes && disputes.length > 0 && (
        <div className="space-y-3">
          {disputes.map((dispute) => (
            <DisputeCard key={dispute.id} dispute={dispute} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}
