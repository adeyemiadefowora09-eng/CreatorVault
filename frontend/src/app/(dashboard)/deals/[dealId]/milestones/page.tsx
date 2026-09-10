"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { AlertCircle, ArrowLeft, ListChecks, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDeal } from "@/hooks/useDeals";
import {
  useAddMilestone,
  useApproveMilestone,
  useDeleteMilestone,
  useMilestones,
  useRejectMilestone,
  useSubmitMilestone,
} from "@/hooks/useMilestones";
import { useInitializePayment } from "@/hooks/usePayments";
import { useAuthStore } from "@/stores/authStore";
import type { CreateMilestoneInput, Milestone, MilestoneStatus } from "@/types/deals";

const STATUS_STYLES: Record<MilestoneStatus, string> = {
  PENDING: "bg-slate-500/10 text-slate-600",
  IN_PROGRESS: "bg-blue-500/10 text-blue-600",
  SUBMITTED: "bg-amber-500/10 text-amber-600",
  APPROVED: "bg-emerald-500/10 text-emerald-600",
  PAID: "bg-emerald-500/10 text-emerald-700",
};

function AddMilestoneForm({ dealId, nextOrderIndex, onDone }: { dealId: string; nextOrderIndex: number; onDone: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<CreateMilestoneInput>({
    defaultValues: { orderIndex: nextOrderIndex },
  });
  const addMilestone = useAddMilestone(dealId);

  return (
    <Card>
      <CardContent className="py-5">
        <form
          onSubmit={handleSubmit((values) =>
            addMilestone.mutate(
              { ...values, amount: Number(values.amount), orderIndex: Number(values.orderIndex) },
              { onSuccess: onDone }
            )
          )}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" aria-invalid={Boolean(errors.title)} {...register("title", { required: true, minLength: 2 })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={2} {...register("description")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" type="number" step="0.01" aria-invalid={Boolean(errors.amount)} {...register("amount", { required: true, valueAsNumber: true, min: 1 })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" type="date" {...register("dueDate", { required: true })} />
            </div>
          </div>
          {addMilestone.isError && (
            <p className="text-sm text-destructive">Couldn&apos;t add that milestone. Try again.</p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={addMilestone.isPending}>
              {addMilestone.isPending ? "Adding…" : "Add milestone"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function RejectMilestoneForm({ dealId, milestoneId, onDone }: { dealId: string; milestoneId: string; onDone: () => void }) {
  const { register, handleSubmit } = useForm<{ reason: string }>();
  const rejectMilestone = useRejectMilestone(dealId);

  return (
    <form
      onSubmit={handleSubmit((values) =>
        rejectMilestone.mutate({ milestoneId, reason: values.reason }, { onSuccess: onDone })
      )}
      className="mt-2 space-y-2"
    >
      <Textarea
        rows={2}
        placeholder="Why is this being rejected? (10+ characters)"
        {...register("reason", { required: true, minLength: 10 })}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={rejectMilestone.isPending}>
          Confirm reject
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SubmitMilestoneForm({ dealId, milestoneId, onDone }: { dealId: string; milestoneId: string; onDone: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ submissionNote?: string; submissionUrl?: string }>();
  const submitMilestone = useSubmitMilestone(dealId);

  return (
    <form
      onSubmit={handleSubmit((values) => {
        if (!values.submissionNote?.trim() && !values.submissionUrl?.trim()) return;
        submitMilestone.mutate(
          { milestoneId, submissionNote: values.submissionNote, submissionUrl: values.submissionUrl },
          { onSuccess: onDone }
        );
      })}
      className="mt-2 space-y-2"
    >
      <Textarea rows={2} placeholder="Notes for the brand (optional if you add a link)" {...register("submissionNote")} />
      <Input
        placeholder="Link to your work (drive, portfolio, file, etc.)"
        aria-invalid={Boolean(errors.submissionUrl)}
        {...register("submissionUrl")}
      />
      {submitMilestone.isError && (
        <p className="text-sm text-destructive">Add a note and/or a link, then try again.</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitMilestone.isPending}>
          {submitMilestone.isPending ? "Submitting…" : "Submit for approval"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function MilestoneRow({ milestone, dealId, isBrand, isCreator }: {
  milestone: Milestone;
  dealId: string;
  isBrand: boolean;
  isCreator: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const approveMilestone = useApproveMilestone(dealId);
  const deleteMilestone = useDeleteMilestone(dealId);
  const initializePayment = useInitializePayment();

  const handlePay = () => {
    initializePayment.mutate(
      { dealId, milestoneId: milestone.id },
      {
        onSuccess: (result) => {
          if (result.checkoutUrl) window.open(result.checkoutUrl, "_blank", "noopener");
        },
      }
    );
  };

  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{milestone.title}</p>
          {milestone.description && (
            <p className="text-sm text-muted-foreground">{milestone.description}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Due {new Date(milestone.dueDate).toLocaleDateString()}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[milestone.status]}`}>
          {milestone.status.replace("_", " ")}
        </span>
      </div>

      {(milestone.submissionNote || milestone.submissionUrl) &&
        ["SUBMITTED", "APPROVED", "PAID"].includes(milestone.status) && (
          <div className="mt-2 rounded-lg bg-muted/50 p-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground">
              Submitted {milestone.submittedAt ? new Date(milestone.submittedAt).toLocaleString() : ""}
            </p>
            {milestone.submissionNote && (
              <p className="mt-1 text-foreground">{milestone.submissionNote}</p>
            )}
            {milestone.submissionUrl && (
              <a
                href={milestone.submissionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block break-all text-primary underline underline-offset-2"
              >
                {milestone.submissionUrl}
              </a>
            )}
          </div>
        )}

      <div className="mt-2 flex flex-wrap gap-2">
        {isCreator && (milestone.status === "PENDING" || milestone.status === "IN_PROGRESS") && !submitting && (
          <Button size="sm" variant="secondary" onClick={() => setSubmitting(true)}>
            Submit for approval
          </Button>
        )}
        {isBrand && milestone.status === "APPROVED" && (
          <Button size="sm" onClick={handlePay} disabled={initializePayment.isPending}>
            {initializePayment.isPending ? "Starting payment…" : "Pay via Payaza"}
          </Button>
        )}
        {isBrand && milestone.status === "SUBMITTED" && (
          <>
            <Button size="sm" onClick={() => approveMilestone.mutate(milestone.id)} disabled={approveMilestone.isPending}>
              Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setRejecting((v) => !v)}>
              Reject
            </Button>
          </>
        )}
        {isBrand && milestone.status === "PENDING" && (
          <Button size="sm" variant="ghost" onClick={() => deleteMilestone.mutate(milestone.id)} disabled={deleteMilestone.isPending}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Remove
          </Button>
        )}
      </div>

      {submitting && (
        <SubmitMilestoneForm dealId={dealId} milestoneId={milestone.id} onDone={() => setSubmitting(false)} />
      )}
      {rejecting && (
        <RejectMilestoneForm dealId={dealId} milestoneId={milestone.id} onDone={() => setRejecting(false)} />
      )}
      {initializePayment.isError && (
        <p className="mt-2 text-sm text-destructive">
          Payaza couldn&apos;t be reached — check PAYAZA_API_KEY/PAYAZA_BASE_URL in backend/.env.
        </p>
      )}
    </div>
  );
}

export default function MilestonesPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = use(params);
  const user = useAuthStore((s) => s.user);
  const { data: deal } = useDeal(dealId);
  const { data: milestones, isLoading, isError } = useMilestones(dealId);
  const [showForm, setShowForm] = useState(false);

  const isBrand = deal?.brandId === user?.id;
  const isCreator = deal?.creatorId === user?.id;
  const canAdd = isBrand && (deal?.status === "DRAFT" || deal?.status === "NEGOTIATING");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href={`/deals/${dealId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to deal
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Milestones</h1>
          {deal && <p className="mt-1 text-sm text-muted-foreground">{deal.title}</p>}
        </div>
        {canAdd && !showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add milestone
          </Button>
        )}
      </header>

      {showForm && (
        <AddMilestoneForm
          dealId={dealId}
          nextOrderIndex={milestones?.length ?? 0}
          onDone={() => setShowForm(false)}
        />
      )}

      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading milestones…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-rose-500" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Couldn&apos;t load milestones.</p>
          </CardContent>
        </Card>
      )}

      {milestones && milestones.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <ListChecks className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No milestones yet</p>
          </CardContent>
        </Card>
      )}

      {milestones && milestones.length > 0 && (
        <Card className="p-0">
          <div>
            {milestones.map((milestone) => (
              <MilestoneRow
                key={milestone.id}
                milestone={milestone}
                dealId={dealId}
                isBrand={Boolean(isBrand)}
                isCreator={Boolean(isCreator)}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
