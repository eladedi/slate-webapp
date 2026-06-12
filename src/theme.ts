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
  // Surfaces
  background: "#fff8f5",
  surface: "#ffffff",
  surfaceLow: "#fff1e7",
  surfaceContainer: "#feeadb",
  surfaceHigh: "#f8e5d6",
  surfaceVariant: "#f2dfd0",
  sidebar: "#fff1e7",

  // Text
  onSurface: "#231a11",
  onSurfaceVariant: "#55433b",
  outline: "#88736a",
  outlineVariant: "#dbc1b7",

  // Primary (Terracotta)
  primary: "#94451d",
  primaryContainer: "#b35d33",
  onPrimary: "#ffffff",
  primaryFixed: "#ffdbcd",

  // Secondary (Sage)
  secondary: "#4c653e",
  secondaryContainer: "#cdecba",
  onSecondary: "#ffffff",

  // Tertiary (Ochre)
  tertiary: "#7a5500",
  tertiaryContainer: "#996c04",

  // Status
  error: "#ba1a1a",
  onError: "#ffffff",
  errorContainer: "#ffdad6",
  success: "#4c653e",

  // Urgency (matches mobile §17 urgency tokens for the marked-urgent surface)
  urgencyUrgent: "#d64545",
  urgencyUrgentTint: "#ffe9e0",

  // Interaction
  hover: "#f8e5d6",
  selected: "#feeadb",
  scrim: "rgba(58,47,37,0.35)",

  // Type
  fontBody: "'Heebo','Inter',system-ui,sans-serif",
  fontSerif: "'Noto Serif Hebrew','Noto Serif',serif",

  // Shape
  radiusSm: 6,
  radius: 8,
  radiusMd: 12,
  radiusLg: 16,

  // Elevation
  shadowSoft: "0 1px 2px rgba(58,47,37,0.05)",
  shadowRaised: "0 2px 8px rgba(58,47,37,0.08)",
  shadowPopover: "0 6px 20px rgba(58,47,37,0.10)",
  shadowModal: "0 16px 48px rgba(58,47,37,0.16)",
};

const darkTokens: Theme = {
  // Surfaces — warm near-black palette so the terracotta accents stay legible
  background: "#1a1410",
  surface: "#241c17",
  surfaceLow: "#2b211b",
  surfaceContainer: "#33271f",
  surfaceHigh: "#3a2d24",
  surfaceVariant: "#473529",
  sidebar: "#1f1813",

  // Text
  onSurface: "#f2e6dc",
  onSurfaceVariant: "#cdbcb0",
  outline: "#a08c7e",
  outlineVariant: "#5a443a",

  // Primary (Terracotta — lifted to stay vivid on dark)
  primary: "#e08a3c",
  primaryContainer: "#b35d33",
  onPrimary: "#1a1410",
  primaryFixed: "#ffdbcd",

  // Secondary (Sage — lifted)
  secondary: "#9fbb7a",
  secondaryContainer: "#4c653e",
  onSecondary: "#1a1410",

  // Tertiary
  tertiary: "#e0a23c",
  tertiaryContainer: "#996c04",

  // Status
  error: "#ffb4ab",
  onError: "#690005",
  errorContainer: "#93000a",
  success: "#9fbb7a",

  urgencyUrgent: "#ff7a6f",
  urgencyUrgentTint: "#3d201c",

  hover: "#3a2d24",
  selected: "#33271f",
  scrim: "rgba(0,0,0,0.55)",

  fontBody: lightTokens.fontBody,
  fontSerif: lightTokens.fontSerif,

  radiusSm: lightTokens.radiusSm,
  radius: lightTokens.radius,
  radiusMd: lightTokens.radiusMd,
  radiusLg: lightTokens.radiusLg,

  shadowSoft: "0 1px 2px rgba(0,0,0,0.30)",
  shadowRaised: "0 2px 8px rgba(0,0,0,0.40)",
  shadowPopover: "0 6px 20px rgba(0,0,0,0.50)",
  shadowModal: "0 16px 48px rgba(0,0,0,0.60)",
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
