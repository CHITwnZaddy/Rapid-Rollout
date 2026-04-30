# Admin: Theme

> **Route:** `/admin/theme`  
> **Module:** Admin  
> **Generated:** 2026-04-30

## Overview

Lets admins **preview and persist UI theming** (colors + font) in the **browser localStorage** — not stored in Postgres. Applies CSS variables live for preview.

## Layout

Cards for:

- Preset theme picker (`THEME_PRESETS`).
- Custom color inputs per semantic token (`ThemeColors`).
- Font family selector (`FONT_OPTIONS`) with Google Font loading when needed (`loadGoogleFont`, `getGoogleFontParam`).
- Actions: save / reset per implementation (buttons at bottom of cards).

## State model

- **Draft theme** vs **last saved** theme — dirty detection prevents silent loss.
- Invalid JSON in storage is removed and defaults restored.

## Validation

`savedThemeSchema` validates persisted structure before applying.

## Interactions

### Load

- Reads `THEME_STORAGE_KEY` and `FONT_STORAGE_KEY` from `localStorage` on mount.

### Save

- Writes validated JSON; toast feedback (`toast` from sonner).

### Apply preview

- `applyThemeColors` / `applyFont` mutate CSS variables immediately.

## API dependencies

None to Supabase — optional network fetch to **Google Fonts** CDN when selecting a webfont.

## Page relationships

- Affects entire client UI appearance after reload for same browser profile.

## Business rules

- Theme is **per-browser**, not per-user account — clearing browser data resets styling.
