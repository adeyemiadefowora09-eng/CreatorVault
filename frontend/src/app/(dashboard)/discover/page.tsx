"use client";

import { useState } from "react";
import { Check, Copy, Search, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUsers } from "@/hooks/useUsers";
import { useAuthStore } from "@/stores/authStore";
import type { FullUser, UserRole } from "@/types/user";

function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70"
    >
      {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
      {copied ? "Copied" : "Copy ID"}
    </button>
  );
}

function UserCard({ person }: { person: FullUser }) {
  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{person.name}</p>
            <p className="text-xs text-muted-foreground">
              Trust score: {person.trustScore} / 100
            </p>
          </div>
          <CopyIdButton id={person.id} />
        </div>

        {person.bio && <p className="text-sm text-muted-foreground">{person.bio}</p>}

        {person.role === "CREATOR" && person.creatorProfile && (
          <div className="flex flex-wrap gap-1">
            {person.creatorProfile.categories.map((c) => (
              <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {c}
              </span>
            ))}
          </div>
        )}

        {person.role === "BRAND" && person.brandProfile?.companyName && (
          <p className="text-xs text-muted-foreground">
            {person.brandProfile.companyName}
            {person.brandProfile.industry ? ` · ${person.brandProfile.industry}` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DiscoverPage() {
  const user = useAuthStore((s) => s.user);
  const defaultRole: UserRole = user?.role === "BRAND" ? "CREATOR" : "BRAND";
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [search, setSearch] = useState("");
  const { data: people, isLoading, isError } = useUsers({ role, search: search || undefined });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Discover</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find someone to work with, copy their ID to start a deal, then message them directly from that deal&apos;s page.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {(["CREATOR", "BRAND"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                role === r
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {r === "CREATOR" ? "Creators" : "Brands"}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search by name or email…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load results. Try again.
          </CardContent>
        </Card>
      )}

      {people && people.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Users className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No one found</p>
            <p className="text-sm text-muted-foreground">Try a different search, or check back later.</p>
          </CardContent>
        </Card>
      )}

      {people && people.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {people.map((person) => (
            <UserCard key={person.id} person={person} />
          ))}
        </div>
      )}
    </div>
  );
}
