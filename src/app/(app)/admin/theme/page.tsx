"use client";

import { useState, useEffect, useCallback } from "react";
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

const STORAGE_KEY = "rapid-rollout-theme";

export default function ThemePage() {
  const [theme, setTheme] = useState<ThemeColors>(DEFAULT_THEME);
  const [activePreset, setActivePreset] = useState("Default");

  // Load saved theme
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setTheme(parsed.colors);
        setActivePreset(parsed.preset ?? "Custom");
        applyTheme(parsed.colors);
      } catch {
        // ignore
      }
    }
  }, []);

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

  const handlePreset = useCallback((name: string) => {
    const colors = PRESETS[name];
    if (!colors) return;
    setTheme(colors);
    setActivePreset(name);
    applyTheme(colors);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset: name, colors }));
  }, []);

  const handleColorChange = useCallback(
    (key: keyof ThemeColors, value: string) => {
      const updated = { ...theme, [key]: value };
      setTheme(updated);
      setActivePreset("Custom");
      applyTheme(updated);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ preset: "Custom", colors: updated })
      );
    },
    [theme]
  );

  const handleReset = useCallback(() => {
    handlePreset("Default");
  }, [handlePreset]);

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
      <h1 className="text-2xl font-bold">Theme & Branding</h1>

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

      {/* Custom Colors */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Colors</CardTitle>
          <CardDescription>
            Click any color swatch to pick a custom color. Changes apply instantly and persist across sessions.
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
          <div className="mt-4">
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
