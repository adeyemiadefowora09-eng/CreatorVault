/**
 * src/stores/themeStore.ts
 *
 * Light/dark theme preference, persisted to localStorage (same pattern as
 * authStore). No next-themes dependency — this project's globals.css
 * already keys dark mode off a plain `.dark` class on <html>
 * (`@custom-variant dark (&:is(.dark *));`), so this store just decides
 * when that class is present and keeps the choice remembered.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "light" | "dark" | "system";

interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

function systemPrefersDark() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Adds/removes the `.dark` class on <html> to match the resolved theme. */
export function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") return;
  const isDark = preference === "dark" || (preference === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", isDark);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: "system",
      setPreference: (preference) => {
        applyTheme(preference);
        set({ preference });
      },
    }),
    {
      name: "creatorvault-theme",
      onRehydrateStorage: () => (state) => {
        // Re-apply on load, since the inline script in layout.tsx only
        // prevents flash-of-wrong-theme before hydration — this keeps the
        // class in sync once zustand has actually read localStorage.
        if (state) applyTheme(state.preference);
      },
    }
  )
);
