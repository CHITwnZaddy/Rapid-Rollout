"use client";

import { useEffect } from "react";
import {
  applyFont,
  applyThemeColors,
  FONT_STORAGE_KEY,
  getGoogleFontParam,
  loadGoogleFont,
  THEME_STORAGE_KEY,
} from "@/lib/theme";
import { savedThemeSchema } from "@/lib/validation/theme";

export function ThemeLoader() {
  useEffect(() => {
    // Load colors — validate the saved blob before applying.
    // A corrupted or tampered localStorage entry used to crash
    // every page that mounts <ThemeLoader />; now we drop the
    // bad value and fall through to the default theme.
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
          applyThemeColors(result.data.colors);
        } else {
          // Invalid saved theme — nuke it so we don't keep failing.
          localStorage.removeItem(THEME_STORAGE_KEY);
          console.warn(
            "[ThemeLoader] Dropped invalid saved theme:",
            result.error.issues[0]?.message
          );
        }
      }
    }

    // Load font
    const savedFont = localStorage.getItem(FONT_STORAGE_KEY);
    if (savedFont && savedFont !== "default") {
      const googleParam = getGoogleFontParam(savedFont);
      if (googleParam) loadGoogleFont(googleParam);
      applyFont(savedFont);
    }
  }, []);

  return null;
}
