"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { savedThemeSchema } from "@/lib/validation/theme";
import { toast } from "sonner";

interface ThemeColors {
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  card: string;
  cardForeground: string;
  border: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarAccent: string;
}

const DEFAULT_THEME: ThemeColors = {
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

// Preset themes
const PRESETS: Record<string, ThemeColors> = {
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
  "Teal": {
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

function hexToOklch(hex: string): string {
  // Convert hex to RGB
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // Linearize sRGB
  const linearize = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);

  // To OKLab via LMS
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

// ─── Font options ────────────────────────────────────────────────────

const FONT_OPTIONS = [
  { name: "Geist (Default)", value: "default", google: "" },
  { name: "Inter", value: "Inter", google: "Inter:wght@300;400;500;600;700" },
  { name: "Roboto", value: "Roboto", google: "Roboto:wght@300;400;500;700" },
  { name: "Open Sans", value: "Open Sans", google: "Open+Sans:wght@300;400;500;600;700" },
  { name: "Lato", value: "Lato", google: "Lato:wght@300;400;700" },
  { name: "Poppins", value: "Poppins", google: "Poppins:wght@300;400;500;600;700" },
  { name: "Montserrat", value: "Montserrat", google: "Montserrat:wght@300;400;500;600;700" },
  { name: "Source Sans 3", value: "Source Sans 3", google: "Source+Sans+3:wght@300;400;500;600;700" },
  { name: "Nunito", value: "Nunito", google: "Nunito:wght@300;400;500;600;700" },
  { name: "Raleway", value: "Raleway", google: "Raleway:wght@300;400;500;600;700" },
  { name: "DM Sans", value: "DM Sans", google: "DM+Sans:wght@300;400;500;600;700" },
  { name: "Plus Jakarta Sans", value: "Plus Jakarta Sans", google: "Plus+Jakarta+Sans:wght@300;400;500;600;700" },
  { name: "Cabin", value: "Cabin", google: "Cabin:wght@400;500;600;700" },
  { name: "Work Sans", value: "Work Sans", google: "Work+Sans:wght@300;400;500;600;700" },
  { name: "Outfit", value: "Outfit", google: "Outfit:wght@300;400;500;600;700" },
];

function loadGoogleFont(googleParam: string) {
  if (!googleParam) return;
  const id = `google-font-${googleParam.replace(/[^a-z0-9]/gi, "")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${googleParam}&display=swap`;
  document.head.appendChild(link);
}

function applyFont(fontValue: string) {
  const root = document.documentElement;
  if (fontValue === "default") {
    root.style.removeProperty("--font-sans");
    document.body.style.fontFamily = "";
  } else {
    const family = `"${fontValue}", system-ui, sans-serif`;
    root.style.setProperty("--font-sans", family);
    document.body.style.fontFamily = family;
  }
}

const STORAGE_KEY = "rapid-rollout-theme";
const FONT_STORAGE_KEY = "rapid-rollout-font";

export default function ThemePage() {
  // Draft (live, previewed) vs saved (committed to localStorage)
  // state. `theme` is what the user is currently editing and what
  // the CSS vars reflect; `savedTheme` is the last state that was
  // explicitly saved. `isDirty` is derived from the difference.
  const [theme, setTheme] = useState<ThemeColors>(DEFAULT_THEME);
  const [savedTheme, setSavedTheme] = useState<ThemeColors>(DEFAULT_THEME);
  const [activePreset, setActivePreset] = useState("Default");
  const [selectedFont, setSelectedFont] = useState("default");

  // Load saved theme + font
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      let parsedRaw: unknown = null;
      try {
        parsedRaw = JSON.parse(saved);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
      if (parsedRaw) {
        const result = savedThemeSchema.safeParse(parsedRaw);
        if (result.success) {
          const colors = result.data.colors as ThemeColors;
          setTheme(colors);
          setSavedTheme(colors);
          setActivePreset(result.data.preset ?? "Custom");
          applyTheme(colors);
        } else {
          // Corrupted / tampered blob — drop it and start from default.
          localStorage.removeItem(STORAGE_KEY);
          toast.error(
            "Saved theme was invalid and has been reset to default."
          );
        }
      }
    }
    const savedFont = localStorage.getItem(FONT_STORAGE_KEY);
    if (savedFont) {
      setSelectedFont(savedFont);
      const opt = FONT_OPTIONS.find((f) => f.value === savedFont);
      if (opt?.google) loadGoogleFont(opt.google);
      applyFont(savedFont);
    }
  }, []);

  // Dirty flag — cheap JSON.stringify compare is fine for 17 keys.
  const isDirty = useMemo(
    () => JSON.stringify(theme) !== JSON.stringify(savedTheme),
    [theme, savedTheme]
  );

  function applyTheme(colors: ThemeColors) {
    const root = document.documentElement;
    root.style.setProperty("--primary", hexToOklch(colors.primary));
    root.style.setProperty("--primary-foreground", hexToOklch(colors.primaryForeground));
    root.style.setProperty("--secondary", hexToOklch(colors.secondary));
    root.style.setProperty("--secondary-foreground", hexToOklch(colors.secondaryForeground));
    root.style.setProperty("--accent", hexToOklch(colors.accent));
    root.style.setProperty("--accent-foreground", hexToOklch(colors.accentForeground));
    root.style.setProperty("--background", hexToOklch(colors.background));
    root.style.setProperty("--foreground", hexToOklch(colors.foreground));
    root.style.setProperty("--muted", hexToOklch(colors.muted));
    root.style.setProperty("--muted-foreground", hexToOklch(colors.mutedForeground));
    root.style.setProperty("--card", hexToOklch(colors.card));
    root.style.setProperty("--card-foreground", hexToOklch(colors.cardForeground));
    root.style.setProperty("--border", hexToOklch(colors.border));
    root.style.setProperty("--input", hexToOklch(colors.border));
    root.style.setProperty("--sidebar", hexToOklch(colors.sidebar));
    root.style.setProperty("--sidebar-foreground", hexToOklch(colors.sidebarForeground));
    root.style.setProperty("--sidebar-primary", hexToOklch(colors.sidebarPrimary));
    root.style.setProperty("--sidebar-primary-foreground", hexToOklch(colors.primaryForeground));
    root.style.setProperty("--sidebar-accent", hexToOklch(colors.sidebarAccent));
    root.style.setProperty("--sidebar-accent-foreground", hexToOklch(colors.accentForeground));
  }

  // Presets auto-save on click — that's the point of a preset
  // ("known good, apply instantly"), and matches the plan.
  const handlePreset = useCallback((name: string) => {
    const colors = PRESETS[name];
    if (!colors) return;
    setTheme(colors);
    setSavedTheme(colors);
    setActivePreset(name);
    applyTheme(colors);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset: name, colors }));
  }, []);

  // Custom color edits are draft-only — they preview live via
  // applyTheme() but do NOT touch localStorage. The user must
  // click "Save Custom Theme" to commit.
  const handleColorChange = useCallback(
    (key: keyof ThemeColors, value: string) => {
      setTheme((prev) => {
        const updated = { ...prev, [key]: value };
        applyTheme(updated);
        return updated;
      });
      setActivePreset("Custom");
    },
    []
  );

  const handleSaveCustom = useCallback(() => {
    // Re-validate against the schema before writing. Belt-and-
    // suspenders — the color picker should only emit valid
    // hex, but a pasted hex string into the text input could
    // be anything.
    const result = savedThemeSchema.safeParse({
      preset: "Custom",
      colors: theme,
    });
    if (!result.success) {
      toast.error(
        result.error.issues[0]?.message ?? "Invalid theme colors"
      );
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
    setSavedTheme(theme);
    setActivePreset("Custom");
    toast.success("Custom theme saved");
  }, [theme]);

  const handleDiscard = useCallback(() => {
    setTheme(savedTheme);
    applyTheme(savedTheme);
  }, [savedTheme]);

  const handleFontChange = useCallback((fontValue: string) => {
    setSelectedFont(fontValue);
    const opt = FONT_OPTIONS.find((f) => f.value === fontValue);
    if (opt?.google) loadGoogleFont(opt.google);
    applyFont(fontValue);
    localStorage.setItem(FONT_STORAGE_KEY, fontValue);
  }, []);

  const handleReset = useCallback(() => {
    handlePreset("Default");
    handleFontChange("default");
  }, [handlePreset, handleFontChange]);

  const colorFields: { key: keyof ThemeColors; label: string }[] = [
    { key: "primary", label: "Primary (buttons, links)" },
    { key: "primaryForeground", label: "Primary Text" },
    { key: "background", label: "Page Background" },
    { key: "foreground", label: "Page Text" },
    { key: "card", label: "Card Background" },
    { key: "cardForeground", label: "Card Text" },
    { key: "secondary", label: "Secondary" },
    { key: "accent", label: "Accent" },
    { key: "muted", label: "Muted Background" },
    { key: "mutedForeground", label: "Muted Text" },
    { key: "border", label: "Borders" },
    { key: "sidebar", label: "Sidebar Background" },
    { key: "sidebarForeground", label: "Sidebar Text" },
    { key: "sidebarPrimary", label: "Sidebar Active" },
    { key: "sidebarAccent", label: "Sidebar Hover" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Theme & Branding</h1>
        {isDirty && (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            Unsaved changes
          </Badge>
        )}
      </div>

      {/* Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Presets</CardTitle>
          <CardDescription>
            Pick a preset to instantly change the look, or customize individual colors below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PRESETS).map(([name, colors]) => (
              <Button
                key={name}
                variant={activePreset === name ? "default" : "outline"}
                size="sm"
                onClick={() => handlePreset(name)}
                className="gap-2"
              >
                <span
                  className="inline-block h-3 w-3 rounded-full border"
                  style={{ backgroundColor: colors.primary }}
                />
                {name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Font */}
      <Card>
        <CardHeader>
          <CardTitle>Font</CardTitle>
          <CardDescription>
            Choose a font for the entire site. Changes apply instantly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {FONT_OPTIONS.map((f) => (
              <Button
                key={f.value}
                variant={selectedFont === f.value ? "default" : "outline"}
                size="sm"
                className="h-auto py-2 text-left"
                onClick={() => handleFontChange(f.value)}
              >
                <span
                  className="block text-sm"
                  style={{
                    fontFamily:
                      f.value === "default"
                        ? "inherit"
                        : `"${f.value}", sans-serif`,
                  }}
                >
                  {f.name}
                </span>
              </Button>
            ))}
          </div>
          <div className="mt-4 rounded-md border p-4">
            <p className="text-lg font-semibold">
              The quick brown fox jumps over the lazy dog
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              $1,234,567.89 &mdash; 100.0 hrs &mdash; Migration Services Total
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Custom Colors */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Colors</CardTitle>
          <CardDescription>
            Click any color swatch to preview. Changes apply live but are not
            saved until you click <strong>Save Custom Theme</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {colorFields.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <input
                  type="color"
                  value={theme[key]}
                  onChange={(e) => handleColorChange(key, e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border"
                />
                <div className="flex-1">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    className="mt-1 h-7 font-mono text-xs"
                    value={theme[key]}
                    onChange={(e) => handleColorChange(key, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleSaveCustom}
              disabled={!isDirty}
            >
              Save Custom Theme
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDiscard}
              disabled={!isDirty}
            >
              Discard Changes
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              Reset to Default
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button>Primary Button</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>Default Badge</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
          <div className="rounded-md border bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              This is muted text on a muted background, commonly used for
              summary sections and read-only fields.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
