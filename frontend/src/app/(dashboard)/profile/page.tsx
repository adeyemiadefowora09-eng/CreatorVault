"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useMe,
  useUpdateBrandProfile,
  useUpdateCreatorProfile,
  useUpdateProfile,
} from "@/hooks/useProfile";
import type { UpdateBrandProfileInput, UpdateCreatorProfileInput, UpdateProfileInput } from "@/types/user";

function GeneralProfileForm({
  defaults,
}: {
  defaults: UpdateProfileInput;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput>({ defaultValues: defaults });
  const updateProfile = useUpdateProfile();

  useEffect(() => {
    reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults.name, defaults.bio, defaults.country, defaults.avatarUrl]);

  const onSubmit = (values: UpdateProfileInput) => updateProfile.mutate(values);

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>Your name, bio, and where you&apos;re based.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              aria-invalid={Boolean(errors.name)}
              {...register("name", { required: "Name is required" })}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" rows={3} placeholder="A short bio…" {...register("bio")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <Input id="country" placeholder="e.g. Nigeria" {...register("country")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="avatarUrl">Avatar URL</Label>
            <Input
              id="avatarUrl"
              placeholder="https://…"
              aria-invalid={Boolean(errors.avatarUrl)}
              {...register("avatarUrl")}
            />
          </div>

          <FormStatus
            isPending={updateProfile.isPending}
            isSuccess={updateProfile.isSuccess}
            isError={updateProfile.isError}
            disabled={!isDirty}
          />
        </form>
      </CardContent>
    </Card>
  );
}

function CreatorProfileForm({ defaults }: { defaults: UpdateCreatorProfileInput }) {
  const { register, handleSubmit, formState: { isDirty } } = useForm<{
    categories: string;
    portfolioUrl?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    bankName?: string;
  }>({
    defaultValues: {
      categories: (defaults.categories ?? []).join(", "),
      portfolioUrl: defaults.portfolioUrl ?? "",
      bankAccountName: defaults.bankAccountName ?? "",
      bankAccountNumber: defaults.bankAccountNumber ?? "",
      bankName: defaults.bankName ?? "",
    },
  });
  const updateCreatorProfile = useUpdateCreatorProfile();

  const onSubmit = (values: {
    categories: string;
    portfolioUrl?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    bankName?: string;
  }) => {
    updateCreatorProfile.mutate({
      categories: values.categories
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      portfolioUrl: values.portfolioUrl || undefined,
      bankAccountName: values.bankAccountName || undefined,
      bankAccountNumber: values.bankAccountNumber || undefined,
      bankName: values.bankName || undefined,
    });
  };

  const hasBankDetails = Boolean(defaults.bankAccountNumber && defaults.bankName);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Creator profile</CardTitle>
        <CardDescription>Shown to brands considering you for a deal.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="categories">Categories</Label>
            <Input id="categories" placeholder="Fashion, Tech, Comedy…" {...register("categories")} />
            <p className="text-xs text-muted-foreground">Comma-separated.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="portfolioUrl">Portfolio URL</Label>
            <Input id="portfolioUrl" placeholder="https://…" {...register("portfolioUrl")} />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Payout bank details</p>
              <p className="text-xs text-muted-foreground">
                {hasBankDetails
                  ? "Where your milestone earnings are withdrawn to. Update anytime."
                  : "Required before you can request a payout on the Payments page."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bankAccountName">Account name</Label>
              <Input id="bankAccountName" placeholder="As it appears on your bank account" {...register("bankAccountName")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bankAccountNumber">Account number</Label>
                <Input id="bankAccountNumber" placeholder="0123456789" {...register("bankAccountNumber")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bankName">Bank name</Label>
                <Input id="bankName" placeholder="e.g. GTBank" {...register("bankName")} />
              </div>
            </div>
          </div>

          <FormStatus
            isPending={updateCreatorProfile.isPending}
            isSuccess={updateCreatorProfile.isSuccess}
            isError={updateCreatorProfile.isError}
            disabled={!isDirty}
          />
        </form>
      </CardContent>
    </Card>
  );
}

function BrandProfileForm({ defaults }: { defaults: UpdateBrandProfileInput }) {
  const {
    register,
    handleSubmit,
    formState: { isDirty },
  } = useForm<UpdateBrandProfileInput>({ defaultValues: defaults });
  const updateBrandProfile = useUpdateBrandProfile();

  const onSubmit = (values: UpdateBrandProfileInput) => updateBrandProfile.mutate(values);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand profile</CardTitle>
        <CardDescription>Shown to creators considering a deal with you.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="companyName">Company name</Label>
            <Input id="companyName" {...register("companyName")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="industry">Industry</Label>
            <Input id="industry" {...register("industry")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="website">Website</Label>
            <Input id="website" placeholder="https://…" {...register("website")} />
          </div>

          <FormStatus
            isPending={updateBrandProfile.isPending}
            isSuccess={updateBrandProfile.isSuccess}
            isError={updateBrandProfile.isError}
            disabled={!isDirty}
          />
        </form>
      </CardContent>
    </Card>
  );
}

function FormStatus({
  isPending,
  isSuccess,
  isError,
  disabled,
}: {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" disabled={isPending || disabled}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
      {isSuccess && (
        <span className="flex items-center gap-1 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Saved
        </span>
      )}
      {isError && (
        <span className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          Couldn&apos;t save
        </span>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { data: me, isLoading, isError } = useMe();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How you appear to the other side of a deal.
        </p>
      </header>

      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading your profile…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-rose-500" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load your profile. Refresh the page to try again.
            </p>
          </CardContent>
        </Card>
      )}

      {me && (
        <>
          <GeneralProfileForm
            defaults={{
              name: me.name,
              bio: me.bio ?? "",
              country: me.country ?? "",
              avatarUrl: me.avatarUrl ?? "",
            }}
          />

          {me.role === "CREATOR" && (
            <CreatorProfileForm
              defaults={{
                categories: me.creatorProfile?.categories ?? [],
                portfolioUrl: me.creatorProfile?.portfolioUrl ?? "",
                bankAccountName: me.creatorProfile?.bankAccountName ?? "",
                bankAccountNumber: me.creatorProfile?.bankAccountNumber ?? "",
                bankName: me.creatorProfile?.bankName ?? "",
              }}
            />
          )}

          {me.role === "BRAND" && (
            <BrandProfileForm
              defaults={{
                companyName: me.brandProfile?.companyName ?? "",
                industry: me.brandProfile?.industry ?? "",
                website: me.brandProfile?.website ?? "",
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
