"use client";

import { useEffect } from "react";

function hexToOklch(hex: string): string {
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

const VARS: [string, string][] = [
  ["--primary", "primary"],
  ["--primary-foreground", "primaryForeground"],
  ["--secondary", "secondary"],
  ["--secondary-foreground", "secondaryForeground"],
  ["--accent", "accent"],
  ["--accent-foreground", "accentForeground"],
  ["--background", "background"],
  ["--foreground", "foreground"],
  ["--muted", "muted"],
  ["--muted-foreground", "mutedForeground"],
  ["--card", "card"],
  ["--card-foreground", "cardForeground"],
  ["--border", "border"],
  ["--input", "border"],
  ["--sidebar", "sidebar"],
  ["--sidebar-foreground", "sidebarForeground"],
  ["--sidebar-primary", "sidebarPrimary"],
  ["--sidebar-primary-foreground", "primaryForeground"],
  ["--sidebar-accent", "sidebarAccent"],
  ["--sidebar-accent-foreground", "accentForeground"],
];

export function ThemeLoader() {
  useEffect(() => {
    const saved = localStorage.getItem("rapid-rollout-theme");
    if (!saved) return;
    try {
      const { colors } = JSON.parse(saved);
      if (!colors) return;
      const root = document.documentElement;
      for (const [cssVar, key] of VARS) {
        if (colors[key]) {
          root.style.setProperty(cssVar, hexToOklch(colors[key]));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  return null;
}
