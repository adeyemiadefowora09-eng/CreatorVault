/**
 * src/stores/uiStore.ts
 *
 * Ephemeral, non-persisted UI state shared across the dashboard:
 * sidebar collapse state, the currently open global dialog, and a
 * lightweight toast queue. Kept separate from authStore so UI churn
 * never triggers auth-related re-renders.
 */

import { create } from "zustand";

export type DialogId =
  | "contract-upload"
  | "deal-guardian-report"
  | "trust-score-info"
  | null;

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "warning" | "destructive";
}

interface UIState {
  // Sidebar
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Global dialog (only one open at a time)
  activeDialog: DialogId;
  openDialog: (id: DialogId) => void;
  closeDialog: () => void;

  // Toasts
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;

  // Global "is something loading" flag for full-page overlays
  isPageLoading: boolean;
  setPageLoading: (value: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  activeDialog: null,
  openDialog: (id) => set({ activeDialog: id }),
  closeDialog: () => set({ activeDialog: null }),

  toasts: [],
  pushToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }],
    })),
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  isPageLoading: false,
  setPageLoading: (value) => set({ isPageLoading: value }),
}));
