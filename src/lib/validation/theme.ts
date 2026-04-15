import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Theme validation
// ─────────────────────────────────────────────────────────────
// Phase 1.6 — the theme page persists the user's custom theme
// to localStorage as JSON. On load we previously did a raw
// `JSON.parse(saved)` followed by `setTheme(parsed.colors)`,
// which would crash the admin page (and every page using
// <ThemeLoader />) if localStorage was ever corrupted or
// tampered with. Validate the shape before applying.
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
