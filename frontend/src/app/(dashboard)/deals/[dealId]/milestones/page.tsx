"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, ListChecks, Plus, ShieldCheck, Trash2 } from "lucide-react";

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
<<<<<<< HEAD
import { useInitializePayment, usePayments, usePaymentMode } from "@/hooks/usePayments";
import { FundingPanel } from "@/components/payments/FundingPanel";
=======
import { PayButton } from "@/components/payments";
>>>>>>> 9c15709e71866d0d287652bd5fa6ab5f84e07faf
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
<<<<<<< HEAD
  const initializePayment = useInitializePayment();
  const { data: paymentMode } = usePaymentMode();
  const { data: payments } = usePayments();

  // The live (not expired/failed) escrow payment for this milestone, if any. The paying brand gets the
  // virtual-account details back, so the transfer instructions survive a page refresh.
  const activePayment = payments?.find(
    (p) => p.milestoneId === milestone.id && ["PENDING", "COMPLETED", "REVIEW"].includes(p.status)
  );
  const escrow = milestone.escrowStatus ?? "UNFUNDED";
  const [justStarted, setJustStarted] = useState<typeof activePayment>(undefined);
  const awaitingTransfer = activePayment?.status === "PENDING" ? activePayment : justStarted;
  const canFund =
    isBrand && escrow === "UNFUNDED" && !awaitingTransfer && milestone.status !== "PAID" &&
    paymentMode?.enabled !== false;

  const handleFund = () => {
    initializePayment.mutate({ dealId, milestoneId: milestone.id }, {
      onSuccess: (r) => setJustStarted({ ...r.payment, virtualAccount: r.virtualAccount } as typeof activePayment),
    });
  };
=======

  const isEscrowFunded = milestone.payment?.status === "COMPLETED" || milestone.status === "IN_PROGRESS";
  const isApprovedOrPaid = milestone.status === "APPROVED" || milestone.status === "PAID";

>>>>>>> 9c15709e71866d0d287652bd5fa6ab5f84e07faf

  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{milestone.title}</p>
            {isEscrowFunded && !isApprovedOrPaid && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                <ShieldCheck className="h-3 w-3" />
                Escrow Secured
              </span>
            )}
          </div>
          {milestone.description && (
            <p className="text-sm text-muted-foreground">{milestone.description}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Due {new Date(milestone.dueDate).toLocaleDateString()} · ₦{Number(milestone.amount).toLocaleString()}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[milestone.status]}`}>
          {milestone.status === "PAID"
            ? "Escrow Released"
            : milestone.status === "IN_PROGRESS"
            ? "Escrow Funded"
            : milestone.status.replace("_", " ")}
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

<<<<<<< HEAD
      <div className="mt-2 flex flex-wrap gap-2">
        {escrow === "FUNDED" && (
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
            Funded — held in escrow
          </span>
        )}
        {isCreator && escrow === "UNFUNDED" && milestone.status !== "PAID" && (
          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600">
            {awaitingTransfer ? "Brand is funding this milestone" : "Waiting for the brand to fund escrow"}
          </span>
        )}
        {isCreator && escrow === "FUNDED" && (milestone.status === "PENDING" || milestone.status === "IN_PROGRESS") && !submitting && (
          <Button size="sm" variant="secondary" onClick={() => setSubmitting(true)}>
            Submit for approval
          </Button>
        )}
        {canFund && (
          <Button size="sm" onClick={handleFund} disabled={initializePayment.isPending}>
            {initializePayment.isPending ? "Preparing bank details…" : "Fund escrow"}
          </Button>
        )}
=======
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* BRAND ESCROW ACTIONS */}
        {isBrand && !isEscrowFunded && !isApprovedOrPaid && (
          <PayButton
            dealId={dealId}
            milestoneId={milestone.id}
            label={`Fund Escrow (₦${Number(milestone.amount).toLocaleString()})`}
            icon={<ShieldCheck className="mr-1.5 h-4 w-4" />}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          />
        )}

>>>>>>> 9c15709e71866d0d287652bd5fa6ab5f84e07faf
        {isBrand && milestone.status === "SUBMITTED" && (
          <>
            <Button
              size="sm"
              onClick={() => approveMilestone.mutate(milestone.id)}
              disabled={approveMilestone.isPending}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {approveMilestone.isPending ? "Releasing funds…" : "Approve & Release Funds"}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setRejecting((v) => !v)}>
              Reject
            </Button>
          </>
        )}

        {isBrand && milestone.status === "PENDING" && !isEscrowFunded && (
          <Button size="sm" variant="ghost" onClick={() => deleteMilestone.mutate(milestone.id)} disabled={deleteMilestone.isPending}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Remove
          </Button>
        )}

        {/* CREATOR ESCROW ACTIONS */}
        {isCreator && isEscrowFunded && (milestone.status === "PENDING" || milestone.status === "IN_PROGRESS") && !submitting && (
          <Button size="sm" variant="secondary" onClick={() => setSubmitting(true)} className="border border-blue-500/20 bg-blue-50 text-blue-700 hover:bg-blue-100">
            Submit Deliverables
          </Button>
        )}

        {isCreator && !isEscrowFunded && milestone.status === "PENDING" && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600">
            <Clock className="h-3.5 w-3.5" />
            Awaiting brand escrow funding before you begin work.
          </p>
        )}
      </div>

      {submitting && (
        <SubmitMilestoneForm dealId={dealId} milestoneId={milestone.id} onDone={() => setSubmitting(false)} />
      )}
      {rejecting && (
        <RejectMilestoneForm dealId={dealId} milestoneId={milestone.id} onDone={() => setRejecting(false)} />
      )}
<<<<<<< HEAD
      {isBrand && awaitingTransfer?.virtualAccount && (
        <FundingPanel payment={awaitingTransfer} sandbox={Boolean(paymentMode?.sandbox)} />
      )}
      {initializePayment.isError && (
        <p className="mt-2 text-sm text-destructive">
          Couldn&apos;t start funding. The deal must be active and payments enabled; try again shortly.
        </p>
      )}
=======
>>>>>>> 9c15709e71866d0d287652bd5fa6ab5f84e07faf
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

<<<<<<< HEAD
      {paymentMode && paymentMode.mode === "sandbox" && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Sandbox mode: funding uses Payaza&apos;s test environment. No real money moves.</span>
        </div>
      )}
      {paymentMode && paymentMode.mode === "disabled" && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Payments are switched off on this server.</span>
        </div>
      )}

=======
>>>>>>> 9c15709e71866d0d287652bd5fa6ab5f84e07faf
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
