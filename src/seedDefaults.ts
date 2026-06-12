/**
 * Mirrors `D:\Slate\android\app\src\main\java\com\slate\app\data\SeedDefaults.kt`.
 * Every newly created board pre-fills with these 4 columns.
 */
export const BOARD_COLORS = {
  BLUE: "#5B8DEF",
  TEAL: "#1FB8A8",
  AMBER: "#F5A623",
  CORAL: "#E76F6F",
} as const;

export const COLUMN_COLORS = {
  URGENT: "#D64545",
  PLANNED: "#E0A23C",
  BACKLOG: "#6B7280",
  WAITING: "#7C5CD3",
} as const;

export interface DefaultColumn {
  name: string;
  color: string;
}

export const DEFAULT_COLUMNS: DefaultColumn[] = [
  { name: "דחוף", color: COLUMN_COLORS.URGENT },
  { name: "מתוכנן", color: COLUMN_COLORS.PLANNED },
  { name: "רשימת משימות", color: COLUMN_COLORS.BACKLOG },
  { name: "ממתין", color: COLUMN_COLORS.WAITING },
];

/** Default brand amber used when no color is chosen. */
export const DEFAULT_BOARD_COLOR = "#E08A3C";

export interface DefaultBoard {
  name: string;
  color: string;
}

/**
 * The 4 boards seeded on first sign-in. Mirrors the Android `DEFAULT_BOARDS`
 * list in `SeedDefaults.kt`. Each board gets the full `DEFAULT_COLUMNS` set.
 */
export const DEFAULT_BOARDS: DefaultBoard[] = [
  { name: "עבודה", color: BOARD_COLORS.BLUE },
  { name: "אישי", color: BOARD_COLORS.TEAL },
  { name: "פיננסי", color: BOARD_COLORS.AMBER },
  { name: "בית", color: BOARD_COLORS.CORAL },
];
