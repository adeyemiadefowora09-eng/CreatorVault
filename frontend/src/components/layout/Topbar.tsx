"use client";

import { LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useLogout } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export function Topbar() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <div />
      <div className="flex items-center gap-3">
        {user && (
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-foreground">{user.name}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {user.role.toLowerCase()}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Log out"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}
