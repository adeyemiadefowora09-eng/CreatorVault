"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { AlertCircle, FileText, ListChecks, MessageSquare, Scale, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DealStatusBadge } from "@/components/deals";
import {
  useAcceptDeal,
  useCancelDeal,
  useCompleteDeal,
  useDeal,
  useDeclineDeal,
  useDeleteDeal,
  useProposeDeal,
} from "@/hooks/useDeals";
import { useCreateReview, useDealReviews } from "@/hooks/useReviews";
import { useMessages, useSendMessage } from "@/hooks/useMessages";
import { useAuthStore } from "@/stores/authStore";

function formatAmount(amount: string, currency: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(
    parseFloat(amount) || 0
  );
}

function ReviewForm({ dealId, onDone }: { dealId: string; onDone: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ rating: number; comment: string }>({
    defaultValues: { rating: 5 },
  });
  const createReview = useCreateReview();

  return (
    <form
      onSubmit={handleSubmit((values) =>
        createReview.mutate(
          { dealId, rating: Number(values.rating), comment: values.comment },
          { onSuccess: onDone }
        )
      )}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="rating">Rating (1–5)</Label>
        <select
          id="rating"
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          {...register("rating", { required: true, valueAsNumber: true })}
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="comment">Comment</Label>
        <Textarea
          id="comment"
          rows={3}
          placeholder="How did this deal go? (10+ characters)"
          aria-invalid={Boolean(errors.comment)}
          {...register("comment", { required: true, minLength: 10, maxLength: 500 })}
        />
      </div>
      {createReview.isError && (
        <p className="text-sm text-destructive">Couldn&apos;t submit the review. Try again.</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={createReview.isPending}>
          {createReview.isPending ? "Submitting…" : "Submit review"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function MessageThread({ dealId, currentUserId }: { dealId: string; currentUserId: string | undefined }) {
  const { data: messages, isLoading } = useMessages(dealId);
  const sendMessage = useSendMessage(dealId);
  const { register, handleSubmit, reset } = useForm<{ body: string }>();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Messages
        </CardTitle>
        <CardDescription>Talk directly with the other party on this deal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg bg-muted/30 p-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading messages…</p>}
          {messages && messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No messages yet — say hello to get things moving.
            </p>
          )}
          {messages?.map((m) => {
            const isMine = m.senderId === currentUserId;
            return (
              <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    isMine ? "bg-primary text-primary-foreground" : "bg-background text-foreground"
                  }`}
                >
                  {!isMine && <p className="text-xs font-medium opacity-70">{m.sender.name}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className="mt-1 text-[10px] opacity-60">
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSubmit((values) => {
            if (!values.body.trim()) return;
            sendMessage.mutate(values.body, { onSuccess: () => reset() });
          })}
          className="flex gap-2"
        >
          <Textarea
            rows={1}
            placeholder="Write a message…"
            className="min-h-9 flex-1 resize-none"
            {...register("body", { required: true })}
          />
          <Button type="submit" size="sm" disabled={sendMessage.isPending}>
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
        {sendMessage.isError && (
          <p className="text-sm text-destructive">Couldn&apos;t send that message. Try again.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DealDetailPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = use(params);
  const user = useAuthStore((s) => s.user);
  const { data: deal, isLoading, isError } = useDeal(dealId);
  const { data: reviews } = useDealReviews(dealId);
  const [showReviewForm, setShowReviewForm] = useState(false);

  const proposeDeal = useProposeDeal();
  const acceptDeal = useAcceptDeal();
  const declineDeal = useDeclineDeal();
  const completeDeal = useCompleteDeal();
  const cancelDeal = useCancelDeal();
  const deleteDeal = useDeleteDeal();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Loading deal…</div>
    );
  }

  if (isError || !deal) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-rose-500" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load this deal — it may not exist, or you&apos;re not a party to it.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isBrand = deal.brandId === user?.id;
  const isCreator = deal.creatorId === user?.id;
  const alreadyReviewed = reviews?.some((r) => r.reviewerId === user?.id);
  const anyActionPending =
    proposeDeal.isPending ||
    acceptDeal.isPending ||
    declineDeal.isPending ||
    completeDeal.isPending ||
    cancelDeal.isPending ||
    deleteDeal.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-foreground">{deal.title}</h1>
          <DealStatusBadge status={deal.status} />
        </div>
        <p className="text-sm text-muted-foreground">{deal.description}</p>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Amount</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatAmount(deal.amount, deal.currency)}
          </p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Deadline</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {new Date(deal.deadline).toLocaleDateString()}
          </p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Creator</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{deal.creator.name}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Brand</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{deal.brand.name}</p>
        </div>
      </div>

      {deal.deliverables?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deliverables</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm text-foreground">
              {deal.deliverables.map((d, i) => (
                <li key={i}>
                  {d.title}
                  {d.description ? ` — ${d.description}` : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={`/deals/${dealId}/milestones`}>
          <Button variant="outline" size="sm">
            <ListChecks className="h-4 w-4" aria-hidden="true" />
            Milestones ({deal.milestones.length})
          </Button>
        </Link>
        <Link href={`/deals/${dealId}/contract`}>
          <Button variant="outline" size="sm">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Contract
          </Button>
        </Link>
        <Link href="/disputes">
          <Button variant="outline" size="sm">
            <Scale className="h-4 w-4" aria-hidden="true" />
            Disputes ({deal._count.disputes})
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions</CardTitle>
          <CardDescription>Only the actions valid for your role and this deal&apos;s status are shown.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {isBrand && deal.status === "DRAFT" && (
            <Button size="sm" disabled={anyActionPending} onClick={() => proposeDeal.mutate(dealId)}>
              Propose to creator
            </Button>
          )}
          {isCreator && deal.status === "PROPOSED" && (
            <>
              <Button size="sm" disabled={anyActionPending} onClick={() => acceptDeal.mutate(dealId)}>
                Accept
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={anyActionPending}
                onClick={() => declineDeal.mutate(dealId)}
              >
                Decline
              </Button>
            </>
          )}
          {isBrand && deal.status === "ACTIVE" && (
            <Button size="sm" disabled={anyActionPending} onClick={() => completeDeal.mutate(dealId)}>
              Mark completed
            </Button>
          )}
          {(isBrand || isCreator) &&
            ["DRAFT", "PROPOSED", "NEGOTIATING", "ACTIVE"].includes(deal.status) && (
              <Button
                size="sm"
                variant="ghost"
                disabled={anyActionPending}
                onClick={() => cancelDeal.mutate(dealId)}
              >
                Cancel deal
              </Button>
            )}
          {isBrand && deal.status === "DRAFT" && (
            <Button
              size="sm"
              variant="destructive"
              disabled={anyActionPending}
              onClick={() => deleteDeal.mutate(dealId)}
            >
              Delete
            </Button>
          )}
          {(proposeDeal.isError ||
            acceptDeal.isError ||
            declineDeal.isError ||
            completeDeal.isError ||
            cancelDeal.isError ||
            deleteDeal.isError) && (
            <p className="w-full text-sm text-destructive">
              That action didn&apos;t go through — the deal may have changed status already.
            </p>
          )}
        </CardContent>
      </Card>

      <MessageThread dealId={dealId} currentUserId={user?.id} />

      {deal.status === "COMPLETED" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reviews</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviews?.map((review) => (
              <div key={review.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-medium text-foreground">{review.rating} / 5</p>
                <p className="text-muted-foreground">{review.comment}</p>
              </div>
            ))}
            {reviews?.length === 0 && (
              <p className="text-sm text-muted-foreground">No reviews yet.</p>
            )}
            {!alreadyReviewed && !showReviewForm && (
              <Button size="sm" variant="secondary" onClick={() => setShowReviewForm(true)}>
                Leave a review
              </Button>
            )}
            {showReviewForm && (
              <ReviewForm dealId={dealId} onDone={() => setShowReviewForm(false)} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
