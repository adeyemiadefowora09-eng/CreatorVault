"use client";

import { AlertCircle, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useLogout } from "@/hooks/useAuth";
import { useMe } from "@/hooks/useProfile";

export default function SettingsPage() {
  const { data: me, isLoading, isError } = useMe();
  const logout = useLogout();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Account and security.</p>
      </header>

      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-rose-500" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load your account. Refresh the page to try again.
            </p>
          </CardContent>
        </Card>
      )}

      {me && (
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>To change your name, bio, or avatar, use the Profile page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Email" value={me.email} />
            <Row label="Role" value={me.role.charAt(0) + me.role.slice(1).toLowerCase()} />
            <Row label="Member since" value={new Date(me.createdAt).toLocaleDateString()} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>Sign out of CreatorVault on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {logout.isPending ? "Logging out…" : "Log out"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>
            Password changes and notification preferences aren&apos;t wired up to the backend yet —
            no endpoint exists for either, so nothing would actually be saved. Rather than fake it,
            this section is intentionally left out until that&apos;s built.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
