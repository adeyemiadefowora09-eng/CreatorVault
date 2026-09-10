"use client";

import { useState } from "react";
import Link from "next/link";
import { useFieldArray, useForm } from "react-hook-form";
import { AlertCircle, Handshake, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DealCard } from "@/components/deals";
import { useCreateDeal, useDeals } from "@/hooks/useDeals";
import { useAuthStore } from "@/stores/authStore";
import type { CreateDealInput } from "@/types/deals";

const STATUS_FILTERS = [
  { value: undefined, label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "PROPOSED", label: "Proposed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "DISPUTED", label: "Disputed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

function CreateDealForm({ onDone }: { onDone: () => void }) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateDealInput>({
    defaultValues: { currency: "NGN", deliverables: [{ title: "" }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "deliverables" });
  const createDeal = useCreateDeal();

  const onSubmit = (values: CreateDealInput) => {
    createDeal.mutate(
      { ...values, amount: Number(values.amount) },
      { onSuccess: onDone }
    );
  };

  return (
    <Card>
      <CardContent className="py-5">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="creatorId">Creator&apos;s user ID</Label>
            <Input
              id="creatorId"
              placeholder="UUID of the creator you're proposing this deal to"
              aria-invalid={Boolean(errors.creatorId)}
              {...register("creatorId", { required: "Creator ID is required" })}
            />
            <p className="text-xs text-muted-foreground">
              Find one on the{" "}
              <Link href="/discover" className="underline">
                Discover
              </Link>{" "}
              page and use the Copy ID button.
            </p>
            {errors.creatorId && (
              <p className="text-sm text-destructive">{errors.creatorId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              aria-invalid={Boolean(errors.title)}
              {...register("title", { required: "Title is required", minLength: 3 })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={3}
              aria-invalid={Boolean(errors.description)}
              {...register("description", { required: "Description is required", minLength: 10 })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                aria-invalid={Boolean(errors.amount)}
                {...register("amount", { required: "Amount is required", valueAsNumber: true, min: 1 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" {...register("currency")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deadline">Deadline</Label>
            <Input id="deadline" type="date" {...register("deadline", { required: "Deadline is required" })} />
          </div>

          <div className="space-y-2">
            <Label>Deliverables</Label>
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  placeholder={`Deliverable ${index + 1}`}
                  {...register(`deliverables.${index}.title` as const, { required: true })}
                />
                {fields.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ title: "" })}>
              Add deliverable
            </Button>
          </div>

          {createDeal.isError && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Couldn&apos;t create the deal. Check the creator ID and try again.</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={createDeal.isPending}>
              {createDeal.isPending ? "Creating…" : "Create deal"}
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

export default function DealsPage() {
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["value"]>(undefined);
  const [showForm, setShowForm] = useState(false);
  const { data: deals, isLoading, isError } = useDeals({ status });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Deals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every deal you&apos;re a party to, as creator or brand.
          </p>
        </div>
        {user?.role === "BRAND" && !showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New deal
          </Button>
        )}
      </header>

      {showForm && <CreateDealForm onDone={() => setShowForm(false)} />}

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.label}
            onClick={() => setStatus(filter.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              status === filter.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading deals…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-rose-500" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load your deals. Refresh the page to try again.
            </p>
          </CardContent>
        </Card>
      )}

      {deals && deals.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Handshake className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No deals here yet</p>
            <p className="text-sm text-muted-foreground">
              {user?.role === "BRAND"
                ? "Start one with the button above."
                : "Deals a brand proposes to you will show up here."}
            </p>
          </CardContent>
        </Card>
      )}

      {deals && deals.length > 0 && (
        <div className="space-y-2">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} currentUserId={user?.id} />
          ))}
        </div>
      )}
    </div>
  );
}
