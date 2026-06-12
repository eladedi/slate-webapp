import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Slate "Desert Study" design tokens.
 * Light is the canonical palette (matches `DESIGN_SYSTEM.md`); dark mirrors
 * the structure with warm-near-black surfaces. Brand accents (terracotta,
 * sage, ochre) and status colors are shared between modes — they read well
 * against either background.
 *
 * Use the active variant via `useTheme()` (returns the same shape as `t`),
 * or the standalone `t` export for static contexts (callers that haven't
 * been migrated yet — these will look fine in light mode and "almost right"
 * in dark mode until they're swapped).
 */

const lightTokens: Theme = {
  // Surfaces — paper white + neutral grays. No warm cream fills anywhere.
  background: "#fafaf9",
  surface: "#ffffff",
  surfaceLow: "#f5f5f4",
  surfaceContainer: "#f5f5f4",
  surfaceHigh: "#ebe9e7",
  surfaceVariant: "#e7e5e4",
  sidebar: "#fafaf9",

  // Text — near-black + true muted gray (not warm brown).
  onSurface: "#1c1917",
  onSurfaceVariant: "#44403c",
  outline: "#78716c",
  outlineVariant: "#e7e5e4",

  // Primary (Terracotta — accent only; never used as a background fill)
  primary: "#94451d",
  primaryContainer: "#a85a2c",
  onPrimary: "#ffffff",
  primaryFixed: "#ffdbcd",

  // Secondary (cool sage for success states / weekly badge)
  secondary: "#15803d",
  secondaryContainer: "#dcfce7",
  onSecondary: "#ffffff",

  // Tertiary (legacy — rarely referenced)
  tertiary: "#7a5500",
  tertiaryContainer: "#996c04",

  // Status
  error: "#dc2626",
  onError: "#ffffff",
  errorContainer: "#fee2e2",
  success: "#15803d",

  urgencyUrgent: "#dc2626",
  urgencyUrgentTint: "#fef2f2",

  // Interaction
  hover: "#f5f5f4",
  selected: "#f5f5f4",
  scrim: "rgba(0,0,0,0.4)",

  // Type — sans only. Serif dropped for the Linear-minimal pass.
  fontBody: "'Inter','Heebo',system-ui,-apple-system,sans-serif",
  fontSerif: "'Inter','Heebo',system-ui,-apple-system,sans-serif",

  // Shape — slightly sharper than before.
  radiusSm: 6,
  radius: 8,
  radiusMd: 10,
  radiusLg: 14,

  // Elevation — flat by default; only dialogs / modals / popovers carry weight.
  shadowSoft: "none",
  shadowRaised: "0 1px 2px rgba(28,25,23,0.04)",
  shadowPopover: "0 4px 16px rgba(28,25,23,0.08)",
  shadowModal: "0 24px 56px rgba(28,25,23,0.14)",
};

const darkTokens: Theme = {
  // Surfaces — near-pure dark + neutral charcoal. Stays out of the way.
  background: "#0a0a0a",
  surface: "#171717",
  surfaceLow: "#1f1f1f",
  surfaceContainer: "#1f1f1f",
  surfaceHigh: "#2e2e2e",
  surfaceVariant: "#262626",
  sidebar: "#0a0a0a",

  // Text
  onSurface: "#f5f5f4",
  onSurfaceVariant: "#d6d3d1",
  outline: "#a3a3a3",
  outlineVariant: "#262626",

  // Primary (Terracotta lifted for dark contrast)
  primary: "#e08a3c",
  primaryContainer: "#a85a2c",
  onPrimary: "#1c1917",
  primaryFixed: "#ffdbcd",

  // Secondary (cool green)
  secondary: "#4ade80",
  secondaryContainer: "#14532d",
  onSecondary: "#0a0a0a",

  // Tertiary (legacy)
  tertiary: "#e0a23c",
  tertiaryContainer: "#996c04",

  // Status
  error: "#f87171",
  onError: "#450a0a",
  errorContainer: "#450a0a",
  success: "#4ade80",

  urgencyUrgent: "#f87171",
  urgencyUrgentTint: "#1c0e0e",

  hover: "#1f1f1f",
  selected: "#262626",
  scrim: "rgba(0,0,0,0.7)",

  fontBody: lightTokens.fontBody,
  fontSerif: lightTokens.fontSerif,

  radiusSm: lightTokens.radiusSm,
  radius: lightTokens.radius,
  radiusMd: lightTokens.radiusMd,
  radiusLg: lightTokens.radiusLg,

  shadowSoft: "none",
  shadowRaised: "0 1px 2px rgba(0,0,0,0.50)",
  shadowPopover: "0 4px 16px rgba(0,0,0,0.5)",
  shadowModal: "0 24px 56px rgba(0,0,0,0.7)",
};

export interface Theme {
  background: string;
  surface: string;
  surfaceLow: string;
  surfaceContainer: string;
  surfaceHigh: string;
  surfaceVariant: string;
  sidebar: string;

  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;

  primary: string;
  primaryContainer: string;
  onPrimary: string;
  primaryFixed: string;

  secondary: string;
  secondaryContainer: string;
  onSecondary: string;

  tertiary: string;
  tertiaryContainer: string;

  error: string;
  onError: string;
  errorContainer: string;
  success: string;

  urgencyUrgent: string;
  urgencyUrgentTint: string;

  hover: string;
  selected: string;
  scrim: string;

  fontBody: string;
  fontSerif: string;

  radiusSm: number;
  radius: number;
  radiusMd: number;
  radiusLg: number;

  shadowSoft: string;
  shadowRaised: string;
  shadowPopover: string;
  shadowModal: string;
}

/** Legacy static export — light mode tokens. Components that haven't been
 *  migrated to `useTheme()` keep importing this and look correct in light. */
export const t: Theme = lightTokens;

/** Per-board accent dots (warm, muted, distinct). Used by board pickers. */
export const BOARD_ACCENTS = [
  "#94451d",
  "#4c653e",
  "#7a5500",
  "#6e84a3",
  "#8a6a86",
  "#4f8c84",
];

// -------------------- Theme mode + context --------------------

export type ThemeMode = "system" | "light" | "dark";
const STORAGE_KEY = "slate.themeMode";

function loadStoredMode(): ThemeMode {
  const raw = (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY)) || "";
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

function resolveActiveMode(mode: ThemeMode): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

interface ThemeCtx {
  theme: Theme;
  mode: ThemeMode;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: lightTokens,
  mode: "system",
  isDark: false,
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeRaw] = useState<ThemeMode>(loadStoredMode);
  const [active, setActive] = useState<"light" | "dark">(() => resolveActiveMode(mode));

  // Track system preference; only matters when mode === "system".
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setActive(resolveActiveMode(mode));
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, [mode]);

  function setMode(m: ThemeMode) {
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
    setModeRaw(m);
  }

  const value = useMemo<ThemeCtx>(
    () => ({
      theme: active === "dark" ? darkTokens : lightTokens,
      mode,
      isDark: active === "dark",
      setMode,
    }),
    [mode, active],
  );

  // Expose to CSS for the few rules in index.css (body bg, etc).
  useEffect(() => {
    document.documentElement.dataset.theme = active;
    document.documentElement.style.colorScheme = active;
  }, [active]);

  return createElement(ThemeContext.Provider, { value }, children);
}

/** Active theme + mode controls. */
export function useTheme(): ThemeCtx {
  return useContext(ThemeContext);
}
