"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useRegister, type RegisterInput } from "@/hooks/useAuth";

export default function RegisterPage() {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterInput>({ defaultValues: { role: "CREATOR" } });
  const registerAccount = useRegister();
  const role = watch("role");

  const onSubmit = (values: RegisterInput) => {
    registerAccount.mutate(values);
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>Join CreatorVault as a Creator or a Brand.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>I am a…</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={role === "CREATOR" ? "default" : "outline"}
                onClick={() => setValue("role", "CREATOR")}
              >
                Creator
              </Button>
              <Button
                type="button"
                variant={role === "BRAND" ? "default" : "outline"}
                onClick={() => setValue("role", "BRAND")}
              >
                Brand
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              placeholder="Jane Doe"
              aria-invalid={Boolean(errors.name)}
              {...register("name", {
                required: "Name is required",
                minLength: { value: 2, message: "Name must be at least 2 characters" },
              })}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              aria-invalid={Boolean(errors.email)}
              {...register("email", { required: "Email is required" })}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              aria-invalid={Boolean(errors.password)}
              {...register("password", {
                required: "Password is required",
                minLength: { value: 8, message: "Password must be at least 8 characters" },
              })}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          {registerAccount.isError && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Couldn&apos;t create your account. That email may already be in use.</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={registerAccount.isPending}>
            {registerAccount.isPending ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
