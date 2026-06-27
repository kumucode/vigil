import React from "react";

/**
 * LogoSVG — Vigil's adaptive shield+eye icon.
 *
 * Uses `currentColor` for all strokes/fills so it automatically
 * inherits the accent color from a parent wrapper div:
 *   <div style={{color: C.accent}}><LogoSVG size={52}/></div>
 *
 * This makes the logo responsive to theme changes without re-renders.
 */
export default function LogoSVG({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* Shield outline */}
      <path
        d="M50 6 L90 21 L90 53 C90 76 72 91 50 97 C28 91 10 76 10 53 L10 21 Z"
        strokeWidth="5"
        opacity="0.9"
      />
      {/* Eye almond shape */}
      <path
        d="M22 50 C30 37 70 37 78 50 C70 63 30 63 22 50 Z"
        strokeWidth="4"
        opacity="0.85"
      />
      {/* Iris */}
      <circle
        cx="50"
        cy="50"
        r="10"
        fill="currentColor"
        stroke="none"
        opacity="0.9"
      />
      {/* Inner pupil (darker) */}
      <circle
        cx="50"
        cy="50"
        r="5"
        fill="white"
        stroke="none"
        opacity="0.22"
      />
      {/* Highlight glint */}
      <circle
        cx="55"
        cy="45"
        r="3.5"
        fill="white"
        stroke="none"
        opacity="0.45"
      />
    </svg>
  );
}

export function LogoutIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}
