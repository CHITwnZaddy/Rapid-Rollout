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
import {
  applyFont,
  applyThemeColors,
  DEFAULT_THEME,
  FONT_OPTIONS,
  FONT_STORAGE_KEY,
  getGoogleFontParam,
  loadGoogleFont,
  THEME_PRESETS,
  THEME_STORAGE_KEY,
} from "@/lib/theme";
import { savedThemeSchema, type ThemeColors } from "@/lib/validation/theme";
import { toast } from "sonner";

export default function ThemePage() {
  // Draft (live, previewed) vs saved (committed to localStorage)
  // state. `theme` is what the user is currently editing and what
  // the CSS vars reflect; `savedTheme` is the last state that was
  // explicitly saved. `isDirty` is derived from the difference.
  const [theme, setTheme] = useState<ThemeColors>(DEFAULT_THEME);
  const [savedTheme, setSavedTheme] = useState<ThemeColors>(DEFAULT_THEME);
  const [activePreset, setActivePreset] = useState("Default");
  const [selectedFont, setSelectedFont] = useState("default");

  const applyTheme = useCallback((colors: ThemeColors) => {
    applyThemeColors(colors);
  }, []);

  // Load saved theme + font
  useEffect(() => {
    let nextTheme: ThemeColors | null = null;
    let nextPreset = "Default";
    let invalidThemeMessage: string | null = null;

    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved) {
      let parsedRaw: unknown = null;
      try {
        parsedRaw = JSON.parse(saved);
      } catch {
        localStorage.removeItem(THEME_STORAGE_KEY);
      }
      if (parsedRaw) {
        const result = savedThemeSchema.safeParse(parsedRaw);
        if (result.success) {
          nextTheme = result.data.colors as ThemeColors;
          nextPreset = result.data.preset ?? "Custom";
        } else {
          // Corrupted / tampered blob — drop it and start from default.
          localStorage.removeItem(THEME_STORAGE_KEY);
          invalidThemeMessage = "Saved theme was invalid and has been reset to default.";
        }
      }
    }

    const savedFont = localStorage.getItem(FONT_STORAGE_KEY);

    queueMicrotask(() => {
      if (nextTheme) {
        setTheme(nextTheme);
        setSavedTheme(nextTheme);
        setActivePreset(nextPreset);
        applyTheme(nextTheme);
      }
      if (invalidThemeMessage) {
        toast.error(invalidThemeMessage);
      }
      if (savedFont) {
        setSelectedFont(savedFont);
        const opt = FONT_OPTIONS.find((f) => f.value === savedFont);
        if (opt?.google) loadGoogleFont(opt.google);
        applyFont(savedFont);
      }
    });
  }, [applyTheme]);

  // Dirty flag — cheap JSON.stringify compare is fine for 17 keys.
  const isDirty = useMemo(
    () => JSON.stringify(theme) !== JSON.stringify(savedTheme),
    [theme, savedTheme]
  );

  // Presets auto-save on click — that's the point of a preset
  // ("known good, apply instantly"), and matches the plan.
  const handlePreset = useCallback((name: string) => {
    const colors = THEME_PRESETS[name];
    if (!colors) return;
    setTheme(colors);
    setSavedTheme(colors);
    setActivePreset(name);
    applyTheme(colors);
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ preset: name, colors })
    );
  }, [applyTheme]);

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
    [applyTheme]
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
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(result.data));
    setSavedTheme(theme);
    setActivePreset("Custom");
    toast.success("Custom theme saved");
  }, [theme]);

  const handleDiscard = useCallback(() => {
    setTheme(savedTheme);
    applyTheme(savedTheme);
  }, [applyTheme, savedTheme]);

  const handleFontChange = useCallback((fontValue: string) => {
    setSelectedFont(fontValue);
    const googleParam = getGoogleFontParam(fontValue);
    if (googleParam) loadGoogleFont(googleParam);
    applyFont(fontValue);
    localStorage.setItem(FONT_STORAGE_KEY, fontValue);
    // Phase 2.8 — also write a cookie so the root layout can
    // server-render the Google Font <link> on the next navigation,
    // eliminating the FOUT that happened when ThemeLoader used to
    // append the link post-hydration. Path=/ so every route sees
    // it; 1-year expiry since this is a stable personalization.
    document.cookie = `${FONT_STORAGE_KEY}=${encodeURIComponent(fontValue)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
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
            {Object.entries(THEME_PRESETS).map(([name, colors]) => (
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
