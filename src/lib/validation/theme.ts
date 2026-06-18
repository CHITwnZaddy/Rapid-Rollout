import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Theme validation
// ─────────────────────────────────────────────────────────────
// Saved themes come from localStorage, so validate the shape before
// applying any persisted colors to the app shell.
// ─────────────────────────────────────────────────────────────

// #rrggbb — 6-digit hex only. The theme page's <input type="color">
// always emits this shape, so anything else is corruption.
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color");

export const themeColorsSchema = z.object({
  primary: hexColor,
  primaryForeground: hexColor,
  secondary: hexColor,
  secondaryForeground: hexColor,
  accent: hexColor,
  accentForeground: hexColor,
  background: hexColor,
  foreground: hexColor,
  muted: hexColor,
  mutedForeground: hexColor,
  card: hexColor,
  cardForeground: hexColor,
  border: hexColor,
  sidebar: hexColor,
  sidebarForeground: hexColor,
  sidebarPrimary: hexColor,
  sidebarAccent: hexColor,
});

export const savedThemeSchema = z.object({
  preset: z.string().default("Custom"),
  colors: themeColorsSchema,
});

export type ThemeColors = z.infer<typeof themeColorsSchema>;
export type SavedTheme = z.infer<typeof savedThemeSchema>;
