/**
 * services/designTokens.js — Vigil Design System v2.7
 *
 * Single source of truth for spacing, radii, status colours, focus rings,
 * and button variants. Import in components instead of hardcoding values.
 */

// ── Spacing scale (px) ────────────────────────────────────────────────────────
export const SPACE = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 36,
};

// ── Border radii ──────────────────────────────────────────────────────────────
export const RADIUS = {
  sm:   6,
  md:   9,
  lg:   14,
  xl:   18,
  pill: 999,
};

// Status colors live in useTheme.js C.statusMap (mode-aware single source)
// Status to short display label
export const STATUS_LABEL = {
  "up-to-date": "OK",
  "outdated":   "Outdated",
  "pinned":     "Pinned",
  "unknown":    "Unknown",
  "error":      "Error",
};

// ── Focus ring ────────────────────────────────────────────────────────────────
export const FOCUS_RING = (accentColor = "#6c63ff") =>
  `0 0 0 2px ${accentColor}66`;

// ── Button variant styles (returns inline style object) ───────────────────────
export const BTN = {
  primary:   (accent) => ({
    background: accent,
    color: "#fff",
    border: "none",
    boxShadow: `0 0 14px ${accent}44`,
  }),
  secondary: (C) => ({
    background: C.card,
    color: C.text,
    border: `1px solid ${C.border}`,
  }),
  danger:    () => ({
    background: "#e05c5c14",
    color: "#e05c5c",
    border: "1px solid #e05c5c2a",
  }),
  ghost:     (C) => ({
    background: "transparent",
    color: C.muted,
    border: `1px solid ${C.border}`,
  }),
};

// ── Typography size scale ─────────────────────────────────────────────────────
export const TYPE = {
  xs:   { fontSize: 10, lineHeight: 1.4 },
  sm:   { fontSize: 11, lineHeight: 1.5 },
  base: { fontSize: 13, lineHeight: 1.6 },
  md:   { fontSize: 14, lineHeight: 1.6 },
  lg:   { fontSize: 16, lineHeight: 1.5 },
  xl:   { fontSize: 20, lineHeight: 1.4 },
  xxl:  { fontSize: 24, lineHeight: 1.3 },
};
