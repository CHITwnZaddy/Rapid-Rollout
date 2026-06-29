import type { ThemeColors } from "@/lib/validation/theme";

export type FontOption = {
  name: string;
  value: string;
  google: string;
};

export const THEME_STORAGE_KEY = "rapid-rollout-theme";
export const FONT_STORAGE_KEY = "rapid-rollout-font";
export const FONT_COOKIE_NAME = FONT_STORAGE_KEY;

export const DEFAULT_THEME: ThemeColors = {
  primary: "#171717",
  primaryForeground: "#fafafa",
  secondary: "#f5f5f5",
  secondaryForeground: "#171717",
  accent: "#f5f5f5",
  accentForeground: "#171717",
  background: "#ffffff",
  foreground: "#171717",
  muted: "#f5f5f5",
  mutedForeground: "#737373",
  card: "#ffffff",
  cardForeground: "#171717",
  border: "#e5e5e5",
  sidebar: "#fafafa",
  sidebarForeground: "#171717",
  sidebarPrimary: "#171717",
  sidebarAccent: "#f5f5f5",
};

export const THEME_PRESETS: Record<string, ThemeColors> = {
  Default: DEFAULT_THEME,
  "Ocean Blue": {
    ...DEFAULT_THEME,
    primary: "#1e40af",
    primaryForeground: "#ffffff",
    sidebarPrimary: "#1e40af",
    accent: "#dbeafe",
    accentForeground: "#1e3a8a",
    sidebarAccent: "#dbeafe",
  },
  "Forest Green": {
    ...DEFAULT_THEME,
    primary: "#166534",
    primaryForeground: "#ffffff",
    sidebarPrimary: "#166534",
    accent: "#dcfce7",
    accentForeground: "#14532d",
    sidebarAccent: "#dcfce7",
  },
  "Royal Purple": {
    ...DEFAULT_THEME,
    primary: "#6d28d9",
    primaryForeground: "#ffffff",
    sidebarPrimary: "#6d28d9",
    accent: "#ede9fe",
    accentForeground: "#4c1d95",
    sidebarAccent: "#ede9fe",
  },
  "Warm Red": {
    ...DEFAULT_THEME,
    primary: "#b91c1c",
    primaryForeground: "#ffffff",
    sidebarPrimary: "#b91c1c",
    accent: "#fee2e2",
    accentForeground: "#7f1d1d",
    sidebarAccent: "#fee2e2",
  },
  Teal: {
    ...DEFAULT_THEME,
    primary: "#0d9488",
    primaryForeground: "#ffffff",
    sidebarPrimary: "#0d9488",
    accent: "#ccfbf1",
    accentForeground: "#134e4a",
    sidebarAccent: "#ccfbf1",
  },
  "Dark Mode": {
    primary: "#e5e5e5",
    primaryForeground: "#171717",
    secondary: "#262626",
    secondaryForeground: "#fafafa",
    accent: "#262626",
    accentForeground: "#fafafa",
    background: "#0a0a0a",
    foreground: "#fafafa",
    muted: "#262626",
    mutedForeground: "#a3a3a3",
    card: "#171717",
    cardForeground: "#fafafa",
    border: "#262626",
    sidebar: "#171717",
    sidebarForeground: "#fafafa",
    sidebarPrimary: "#3b82f6",
    sidebarAccent: "#262626",
  },
};

export const FONT_OPTIONS: FontOption[] = [
  { name: "Geist (Default)", value: "default", google: "" },
  { name: "Inter", value: "Inter", google: "Inter:wght@300;400;500;600;700" },
  { name: "Roboto", value: "Roboto", google: "Roboto:wght@300;400;500;700" },
  {
    name: "Open Sans",
    value: "Open Sans",
    google: "Open+Sans:wght@300;400;500;600;700",
  },
  { name: "Lato", value: "Lato", google: "Lato:wght@300;400;700" },
  {
    name: "Poppins",
    value: "Poppins",
    google: "Poppins:wght@300;400;500;600;700",
  },
  {
    name: "Montserrat",
    value: "Montserrat",
    google: "Montserrat:wght@300;400;500;600;700",
  },
  {
    name: "Source Sans 3",
    value: "Source Sans 3",
    google: "Source+Sans+3:wght@300;400;500;600;700",
  },
  {
    name: "Nunito",
    value: "Nunito",
    google: "Nunito:wght@300;400;500;600;700",
  },
  {
    name: "Raleway",
    value: "Raleway",
    google: "Raleway:wght@300;400;500;600;700",
  },
  {
    name: "DM Sans",
    value: "DM Sans",
    google: "DM+Sans:wght@300;400;500;600;700",
  },
  {
    name: "Plus Jakarta Sans",
    value: "Plus Jakarta Sans",
    google: "Plus+Jakarta+Sans:wght@300;400;500;600;700",
  },
  { name: "Cabin", value: "Cabin", google: "Cabin:wght@400;500;600;700" },
  {
    name: "Work Sans",
    value: "Work Sans",
    google: "Work+Sans:wght@300;400;500;600;700",
  },
  { name: "Outfit", value: "Outfit", google: "Outfit:wght@300;400;500;600;700" },
];

const fontGoogleParams = Object.fromEntries(
  FONT_OPTIONS.filter((option) => option.google).map((option) => [
    option.value,
    option.google,
  ])
) as Record<string, string>;

const THEME_CSS_VARS: Array<{ cssVar: string; colorKey: keyof ThemeColors }> = [
  { cssVar: "--primary", colorKey: "primary" },
  { cssVar: "--primary-foreground", colorKey: "primaryForeground" },
  { cssVar: "--secondary", colorKey: "secondary" },
  { cssVar: "--secondary-foreground", colorKey: "secondaryForeground" },
  { cssVar: "--accent", colorKey: "accent" },
  { cssVar: "--accent-foreground", colorKey: "accentForeground" },
  { cssVar: "--background", colorKey: "background" },
  { cssVar: "--foreground", colorKey: "foreground" },
  { cssVar: "--muted", colorKey: "muted" },
  { cssVar: "--muted-foreground", colorKey: "mutedForeground" },
  { cssVar: "--card", colorKey: "card" },
  { cssVar: "--card-foreground", colorKey: "cardForeground" },
  { cssVar: "--border", colorKey: "border" },
  { cssVar: "--sidebar", colorKey: "sidebar" },
  { cssVar: "--sidebar-foreground", colorKey: "sidebarForeground" },
  { cssVar: "--sidebar-primary", colorKey: "sidebarPrimary" },
  {
    cssVar: "--sidebar-primary-foreground",
    colorKey: "primaryForeground",
  },
  { cssVar: "--sidebar-accent", colorKey: "sidebarAccent" },
  {
    cssVar: "--sidebar-accent-foreground",
    colorKey: "accentForeground",
  },
];

export function getGoogleFontParam(fontValue: string): string | undefined {
  return fontGoogleParams[fontValue];
}

// Allowlist gate for the font cookie. The cookie is client-writable, and its
// value is interpolated into a server-rendered <style> in the root layout, so
// an unchecked value is an XSS vector. Only values that match a known
// FONT_OPTIONS entry (and are not the "default" sentinel) are allowed through;
// everything else, including injection payloads, resolves to null.
export function resolveSafeFont(
  cookieValue: string | null | undefined
): string | null {
  if (!cookieValue || cookieValue === "default") {
    return null;
  }
  const match = FONT_OPTIONS.find((option) => option.value === cookieValue);
  return match ? match.value : null;
}

export function googleFontUrl(param: string): string {
  return `https://fonts.googleapis.com/css2?family=${param}&display=swap`;
}

export function loadGoogleFont(googleParam: string) {
  if (!googleParam) return;
  const id = `google-font-${googleParam.replace(/[^a-z0-9]/gi, "")}`;
  if (document.getElementById(id)) return;

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = googleFontUrl(googleParam);
  document.head.appendChild(link);
}

export function applyFont(fontValue: string) {
  const root = document.documentElement;
  if (fontValue === "default") {
    root.style.removeProperty("--font-sans");
    document.body.style.fontFamily = "";
    return;
  }

  const family = `"${fontValue}", system-ui, sans-serif`;
  root.style.setProperty("--font-sans", family);
  document.body.style.fontFamily = family;
}

export function hexToOklch(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const linearize = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);

  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bOk = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  const C = Math.sqrt(a * a + bOk * bOk);
  let h = (Math.atan2(bOk, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${h.toFixed(1)})`;
}

export function applyThemeColors(colors: ThemeColors) {
  const root = document.documentElement;
  for (const { cssVar, colorKey } of THEME_CSS_VARS) {
    root.style.setProperty(cssVar, hexToOklch(colors[colorKey]));
  }
  root.style.setProperty("--input", hexToOklch(colors.border));
}
