// ─────────────────────────────────────────────────────────────
// Custom Google Font registry
// ─────────────────────────────────────────────────────────────
// Phase 2.8 — shared font metadata so the root layout can emit
// a server-side <link rel="stylesheet"> for the user's chosen
// font when the browser sends a `rapid-rollout-font` cookie,
// eliminating the FOUT that happened when theme-loader.tsx
// appended the Google Fonts link post-hydration.
//
// The theme page writes this cookie (alongside the existing
// localStorage entry) whenever the user picks a font, so the
// next navigation gets the font server-rendered.
// ─────────────────────────────────────────────────────────────

export const FONT_COOKIE_NAME = "rapid-rollout-font";

// Keep this map in sync with the FONT_OPTIONS array in
// src/app/(app)/admin/theme/page.tsx — both render the same set.
export const GOOGLE_FONT_PARAMS: Record<string, string> = {
  Inter: "Inter:wght@300;400;500;600;700",
  Roboto: "Roboto:wght@300;400;500;700",
  "Open Sans": "Open+Sans:wght@300;400;500;600;700",
  Lato: "Lato:wght@300;400;700",
  Poppins: "Poppins:wght@300;400;500;600;700",
  Montserrat: "Montserrat:wght@300;400;500;600;700",
  "Source Sans 3": "Source+Sans+3:wght@300;400;500;600;700",
  Nunito: "Nunito:wght@300;400;500;600;700",
  Raleway: "Raleway:wght@300;400;500;600;700",
  "DM Sans": "DM+Sans:wght@300;400;500;600;700",
  "Plus Jakarta Sans": "Plus+Jakarta+Sans:wght@300;400;500;600;700",
  Cabin: "Cabin:wght@400;500;600;700",
  "Work Sans": "Work+Sans:wght@300;400;500;600;700",
  Outfit: "Outfit:wght@300;400;500;600;700",
};

export function googleFontUrl(param: string): string {
  return `https://fonts.googleapis.com/css2?family=${param}&display=swap`;
}
