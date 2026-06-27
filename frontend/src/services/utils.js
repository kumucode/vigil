// ── Pure utility helpers shared across the app ────────────────────────────────

// Copy text to clipboard with HTTP fallback
export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(() => _copyFallback(text));
  }
  _copyFallback(text);
}

function _copyFallback(text) {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(el);
  el.select();
  try { document.execCommand("copy"); } catch(_) {}
  document.body.removeChild(el);
}

// Strip near-black pixels from a base64 image (canvas-based)
export function stripBlackBackground(dataUrl, threshold=60) {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith("data:image/")) return resolve(dataUrl);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < d.data.length; i += 4) {
        const r = d.data[i], g = d.data[i+1], b = d.data[i+2];
        const sum = r + g + b;
        if (sum < threshold * 3) {
          d.data[i+3] = Math.min(255, Math.max(0, Math.round((sum - threshold) * 4)));
        }
      }
      ctx.putImageData(d, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function _hexToRgba(hex, a) {
  const clean = (hex||"#A0A0B8").replace("#","");
  const full  = clean.length===3 ? clean.split("").map(c=>c+c).join("") : clean;
  const r = parseInt(full.slice(0,2),16), g = parseInt(full.slice(2,4),16), b = parseInt(full.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

export function _contrastOn(hex) {
  const clean = (hex||"#A0A0B8").replace("#","");
  const full  = clean.length===3 ? clean.split("").map(c=>c+c).join("") : clean;
  const r = parseInt(full.slice(0,2),16)/255, g = parseInt(full.slice(2,4),16)/255, b = parseInt(full.slice(4,6),16)/255;
  const lum = 0.2126*r + 0.7152*g + 0.0722*b;
  return lum > 0.45 ? "#111" : "#fff";
}

// Lighten/darken a hex colour by a fraction (0..1). Returns "#rrggbb".
function _adjust(hex, amt) {
  const clean = (hex||"#000000").replace("#","");
  const full  = clean.length===3 ? clean.split("").map(c=>c+c).join("") : clean;
  let r = parseInt(full.slice(0,2),16), g = parseInt(full.slice(2,4),16), b = parseInt(full.slice(4,6),16);
  if (amt >= 0) { r += (255-r)*amt; g += (255-g)*amt; b += (255-b)*amt; }
  else          { r += r*amt;       g += g*amt;       b += b*amt; }
  const h = v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
export function _lighten(hex, frac) { return _adjust(hex,  Math.abs(frac)); }
export function _darken(hex, frac)  { return _adjust(hex, -Math.abs(frac)); }

export const STATUS_COLORS = {
  "up-to-date": "#3ce08c",
  outdated: "#e05c5c",
  error: "#e08c3c",
  unknown: "#a78bfa",
  pinned: "#6b6b8a"
};

// Segments that are too generic to use as the app name
const GENERIC_SEGS = new Set(["server","app","backend","frontend","service","worker",
  "api","main","core","base","daemon","agent","proxy","client","web","container",
  "documentserver","community","ce","ee","oss","latest","stable","release",
  "official","public","open","hub","node","data","manager","controller"]);

export function parseImage(raw) {
  const t=raw.trim(), ci=t.lastIndexOf(":"), si=t.lastIndexOf("/");
  const image   = ci>si&&ci!==-1 ? t.slice(0,ci) : t;
  const version = ci>si&&ci!==-1 ? t.slice(ci+1) : "latest";
  const parts = image.split("/");
  let name = parts[parts.length-1];
  if (GENERIC_SEGS.has(name.toLowerCase()) && parts.length > 1) {
    name = parts[parts.length-2];
    if (name.includes(".")) name = parts[parts.length-1];
  }
  return { image, version, name };
}

// ── Custom CSS template (Settings → Appearance "Load template") ───────────────
export const CSS_TEMPLATE = `/* ═══════════════════════════════════════════
   Vigil — Custom CSS Template
   Uncomment sections you want to change.
   Use browser DevTools (F12) to inspect names.
   ═══════════════════════════════════════════ */

/* ── Accent / brand colour ───────────────── */
/* .btn-p { background: #e05c5c !important; box-shadow: none !important; }
   .logo-text { color: #e05c5c !important; }
   .logo-dot  { background: #e05c5c !important; } */

/* ── Card style ──────────────────────────── */
/* .card { background: #1e1e30 !important; border-radius: 4px !important; } */

/* ── Topbar ──────────────────────────────── */
/* .topbar { background: #0a0a1a !important; border-bottom-color: #A0A0B8 !important; } */

/* ── Font size ───────────────────────────── */
/* body { font-size: 15px !important; } */

/* ── Hide scheduler dot ──────────────────── */
/* .sched-dot { display: none !important; } */
`;
