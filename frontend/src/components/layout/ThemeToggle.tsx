"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/themeStore";

/**
 * A simple two-way light/dark switch (not a three-way "system" picker —
 * that's still available by clearing localStorage, but a plain toggle is
 * what most people expect from a sidebar/topbar icon). Reads the
 * *resolved* preference so a first-time "system" visitor sees the icon
 * matching what's actually on screen, and clicking always picks the
 * opposite of that rather than cycling through "system" again.
 *
 * `mounted` guards against a hydration mismatch: matchMedia is only safe
 * to read client-side, so the icon renders a neutral placeholder on the
 * server/first paint and swaps in the real one right after mount — same
 * trick the inline script in layout.tsx uses to avoid a flash of the
 * wrong theme.
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  useEffect(() => setMounted(true), []);

  const isDark =
    mounted &&
    (preference === "dark" ||
      (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setPreference(isDark ? "light" : "dark")}
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}
