import { useState } from "react";
import { _hexToRgba, _contrastOn, _lighten, _darken } from "../services/utils";

// ── Preset registry ───────────────────────────────────────────────────────────
export const THEME_PRESETS = {
  "warm-paper": { dark: false, accent: "#964B07", label: "Warm Vintage",  desc: "Warm cream base with bronze accent. Ideal for daily use." },
  "nordic":     { dark: false, accent: "#4C566A", label: "Nordic",        desc: "Clean cool-gray palette with slate accent." },
  "slate":      { dark: false, accent: "#3B78B5", label: "Slate",         desc: "Fresh slate-blue light theme. Crisp and professional." },
  "carbon":     { dark: true,  accent: "#A0A0A0", label: "Carbon",        desc: "Dark charcoal system. Switches to dark mode automatically." },
  "midnight":   { dark: true,  accent: "#7C6FCD", label: "Midnight",      desc: "Deep blue-black with indigo accent. Rich and immersive." },
};

export function useTheme() {
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("dt-dark") !== "false"
  );
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem("dt-view") || "grid"
  );
  const [appName,   setAppName]   = useState("Vigil");
  const [appLogo,   setAppLogo]   = useState("");
  const [appAccent, setAppAccent] = useState(
    () => localStorage.getItem("dt-accent") ||
          (localStorage.getItem("dt-dark") === "false" ? "#964B07" : "#A0A0B8")
  );
  const [themePreset, setThemePreset] = useState(
    () => localStorage.getItem("dt-preset") || "warm-paper"
  );

  const toggleDark = () => {
    setDarkMode(d => {
      const nextDark = !d;
      localStorage.setItem("dt-dark", String(nextDark));
      const preset  = localStorage.getItem("dt-preset") || "warm-paper";
      const meta    = THEME_PRESETS[preset] || THEME_PRESETS["warm-paper"];
      let newPreset = preset;
      if (meta.dark !== nextDark) {
        newPreset = nextDark ? "carbon" : "warm-paper";
        localStorage.setItem("dt-preset", newPreset);
        setThemePreset(newPreset);
      }
      const newMeta = THEME_PRESETS[newPreset] || THEME_PRESETS["warm-paper"];
      localStorage.setItem("dt-accent", newMeta.accent);
      setAppAccent(newMeta.accent);
      return nextDark;
    });
  };

  const changeViewMode = v => { setViewMode(v); localStorage.setItem("dt-view", v); };
  const changeAccent   = v => { setAppAccent(v); localStorage.setItem("dt-accent", v); };
  const changePreset   = (p, accent) => {
    const meta           = THEME_PRESETS[p] || THEME_PRESETS["warm-paper"];
    const resolvedAccent = accent || meta.accent;
    localStorage.setItem("dt-preset", p);
    localStorage.setItem("dt-accent", resolvedAccent);
    setThemePreset(p);
    setAppAccent(resolvedAccent);
    const currentlyDark = localStorage.getItem("dt-dark") !== "false";
    if (meta.dark !== currentlyDark) {
      localStorage.setItem("dt-dark", String(meta.dark));
      setDarkMode(meta.dark);
    }
  };

  const _accent      = appAccent || "#A0A0B8";
  const _storedPreset = themePreset;

  // ── DARK PALETTE ─────────────────────────────────────────────────────────
  const _buildDark = p => {
    const isMid    = p === "midnight";
    const _bg      = isMid ? "#050812" : "#08080f";
    const _surface = isMid ? "#0C1120" : "#10101c";
    const _card    = isMid ? "#111828" : "#181826";
    const _border  = isMid ? "#1A2438" : "#252538";
    const _text    = isMid ? "#CDD8EC" : "#eeeef8";
    const _muted   = isMid ? "#6882A8" : "#9090b8";
    const _hover   = isMid ? "#182240" : "#1e1e30";
    const _alt     = isMid ? "#0E1828" : "#10101c";
    const _input   = isMid ? "#0A1020" : "#0e0e1a";
    const _header  = isMid ? "#03060E" : "#060610";
    // ── BUTTON SYSTEM (dark) ──────────────────────────────────────────────
    // Primary keeps the translucent accent treatment in dark themes (reads
    // well on near-black surfaces); explicit hover/active states.
    const _pBg     = _hexToRgba(_accent, 0.16);
    const _pTxt    = _lighten(_accent, 0.25);
    const _pBorder = _hexToRgba(_accent, 0.40);
    const _pHover  = _hexToRgba(_accent, 0.26);
    const _pActive = _hexToRgba(_accent, 0.34);
    // Danger / remove
    const _dnBg     = "rgba(170,74,68,.20)";
    const _dnTxt    = "#E8B6B2";
    const _dnBorder = "#AA4A44";
    const _dnHover  = "rgba(170,74,68,.32)";
    // Close
    const _clBg     = _hexToRgba(_muted, 0.18);
    const _clTxt    = _muted;
    const _clBorder = _hexToRgba(_muted, 0.45);
    // Test
    const _tsBg     = _hexToRgba("#185FA5", 0.22);
    const _tsTxt    = "#7FB0E0";
    const _tsBorder = "#185FA5";
    const _tsHover  = _hexToRgba("#185FA5", 0.34);
    // Icon action = accent at 55% (never gray)
    const _iconAction = _hexToRgba(_accent, 0.55);
    return {
      bg:_bg, surface:_surface, card:_card, border:_border,
      text:_text, muted:_muted, accent:_accent, header:_header,
      glow:_hexToRgba(_accent, 0.22),
      hover:_hover, alt:_alt, input:_input,
      onAccent: _contrastOn(_accent),
      // Buttons — primary
      btnPrimBg:_pBg, btnPrimText:_pTxt, btnPrimBorder:_pBorder,
      btnPrimHoverBg:_pHover, btnPrimActiveBg:_pActive,
      btnSecBg:_card, btnSecText:_muted,
      // Buttons — danger / remove
      btnDangerBg:_dnBg, btnDangerText:_dnTxt, btnDangerBorder:_dnBorder, btnDangerHoverBg:_dnHover,
      // Buttons — close
      btnCloseBg:_clBg, btnCloseText:_clTxt, btnCloseBorder:_clBorder, btnCloseOpacity:"1", btnCloseHoverBg:"#3D4758", btnCloseHoverText:"#ffffff",
      // Buttons — test
      btnTestBg:_tsBg, btnTestText:_tsTxt, btnTestBorder:_tsBorder, btnTestHoverBg:_tsHover, btnTestHoverText:_tsTxt,
      btnSuccessBg:"rgba(47,107,79,0.25)", btnSuccessText:"#6dba8a", btnSuccessBorder:"rgba(109,186,138,0.35)", btnSuccessHoverBg:"rgba(47,107,79,0.42)",
      btnGhost:_card,
      btnBlueBg:_tsBg, btnBlueText:_tsTxt, btnBlueBorder:_tsBorder,
      checkBg:"transparent", checkBorder:_border, checkText:_muted,
      scBorder:_border, toastBg:_card, toastBorder:_border, toastText:_text,
      rowOdd:_surface, rowEven:_alt, rowHover:_hover,
      navOn:_hexToRgba(_accent, 0.11), navOnText:_accent,
      // Icon colors — accent-derived
      iconAction:_iconAction, iconSubtle:_hexToRgba(_accent, 0.35),
      iconPrimary:_text, iconSecondary:_hexToRgba(_text, 0.82),
      // Add App button
      addBg:"rgba(56,190,118,.09)", addBorder:"rgba(56,190,118,.64)", addHoverBg:"rgba(56,190,118,.15)",
      // Green glow — suppressed in dark (status colours handle their own glow)
      successGlow:"",
      // Status map — single source of truth across ALL views.
      // OK green = #22C55E (the Compact Table value) everywhere.
      statusMap:{
        "up-to-date":{ fg:"#22C55E",  bg:"rgba(34,197,94,.10)",    border:"rgba(34,197,94,.22)"   },
        "outdated":  { fg:"#e05c5c",  bg:"rgba(224,92,92,.08)",    border:"rgba(224,92,92,.25)"   },
        "pinned":    { fg:"#8b8bb0",  bg:"#6b6b8a18",              border:"#6b6b8a40"             },
        "unknown":   { fg:"#a78bfa",  bg:"#a78bfa14",              border:"#a78bfa33"             },
        "error":     { fg:"#e08c3c",  bg:"rgba(224,140,60,.08)",   border:"rgba(224,140,60,.25)"  },
      },
      nordSaveBg:"", nordSaveText:"", nordSaveBorder:"",
    };
  };

  // ── LIGHT PALETTE ─────────────────────────────────────────────────────────
  const _buildLight = p => {
    const isWarm   = p === "warm-paper";
    const isNordic = p === "nordic";
    const isSlate  = p === "slate";

    // Surface grid
    const _bg      = isNordic ? "#ECEFF4" : isSlate ? "#F0F4F8" : "#F3EEE8";
    const _surface = isNordic ? "#E5E9F0" : isSlate ? "#E6EBF2" : "#ECE4DC";
    const _card    = isNordic ? "#D8DEE9" : isSlate ? "#DAE1EB" : "#E5DDD5";
    const _border  = isNordic ? "#A8B3C0" : isSlate ? "#BEC9D6" : "#B8A99C";
    const _text    = isNordic ? "#1E2330" : isSlate ? "#1A2535" : "#362C23";
    const _muted   = isNordic ? "#3D4758" : isSlate ? "#506070" : "#5E5349";
    const _hover   = isNordic ? "#D0D9E4" : isSlate ? "#D0DAE6" : "#DDD2C7";
    const _alt     = isNordic ? "#E0E5EE" : isSlate ? "#DDE3EC" : "#E9E2DA";
    const _input   = isNordic ? "#D8DEE9" : isSlate ? "#DAE1EB" : "#E8E1D9";
    const _header  = isNordic ? "#CDD3DF" : isSlate ? "#CDD6E2" : "#DDD5CC";
    const _rowOdd  = _surface;
    const _rowEven = isNordic ? "#ECEFF4" : isSlate ? "#F0F4F8" : "#F1EBE5";
    const _rowHov  = _hover;

    // Danger palette per preset (status badges, not buttons)
    const _dBg  = isNordic ? "#FBECEC" : isSlate ? "#FAECED" : "#F2DDD8";
    const _dTx  = isNordic ? "#BF616A" : isSlate ? "#B85060" : "#B54F4A";
    const _dBd  = isNordic ? "#F0C4C7" : isSlate ? "#EDB8C2" : "#E0B0AA";

    // Success — unified: OK green = #22C55E (Compact Table source of truth).
    // Light themes use a darker readable variant of the SAME hue for text,
    // but the canonical token value (used by table/list/dashboard) is #22C55E.
    const _okFg = "#1E9E54";          // accessible green on light surfaces, same hue family
    const _okBg = "rgba(34,197,94,.12)";
    const _okBd = "rgba(34,197,94,.34)";

    // ── PRIMARY BUTTON SYSTEM (light, solid) ─────────────────────────────
    // Warm:  base #964B07 lightened 30%, text cream, hover/pressed darker
    // Nordic: #4C566A at 65% opacity, white text, hover solid
    // Slate: base #3B78B5 lightened 30%, white text, hover/pressed darker
    const _warmPrim    = "#964B07";
    const _slateBase   = "#3B78B5";
    const _slatePurple = "#7C6FA8";

    // ── PRIMARY / SAVE ────────────────────────────────────────────────────
    const _pBg     = isWarm ? "rgba(150,75,7,0.75)"       : isNordic ? "#3D4758"                : _lighten(_slateBase,0.30);
    const _pTxt    = isWarm ? "#F5EBDD"                   : "#ffffff";
    const _pBorder = isWarm ? "#964B07"                   : isNordic ? "#3D4758"                : _slateBase;
    const _pHover  = isWarm ? "rgba(150,75,7,0.90)"       : isNordic ? _lighten("#3D4758",0.15) : _darken(_lighten(_slateBase,0.30),0.10);
    const _pActive = isWarm ? "rgba(150,75,7,1.0)"        : isNordic ? _lighten("#3D4758",0.08) : _darken(_lighten(_slateBase,0.30),0.15);

    // ── TEST ─────────────────────────────────────────────────────────────
    const _tsBg       = isWarm   ? "rgba(74,111,165,0.7)"        : isNordic ? "rgba(49,80,122,0.35)"       : _hexToRgba(_lighten(_slatePurple,0.40),0.80);
    const _tsTxt      = isWarm   ? "#F5EBDD"                     : isNordic ? "#31507A"                   : _darken(_slatePurple,0.18);
    const _tsBorder   = isWarm   ? "#4A6FA5"                     : isNordic ? "#31507A"                   : _slatePurple;
    const _tsHover    = isWarm   ? "rgba(74,111,165,0.9)"        : isNordic ? "rgba(49,80,122,0.9)"       : _hexToRgba(_lighten(_slatePurple,0.28),0.90);
    const _tsHoverTxt = isNordic ? "#ffffff" : _tsTxt;

    // ── DANGER / REMOVE ───────────────────────────────────────────────────
    const _dnBg     = isWarm ? "rgba(143,63,59,0.6)"  : isNordic ? "rgba(170,74,68,0.70)"  : _hexToRgba("#AA4A44",0.55);
    const _dnTxt    = "#F5EBDD";
    const _dnBorder = isWarm ? "#8F3F3B"              : "#AA4A44";
    const _dnHover  = isWarm ? "rgba(143,63,59,0.9)"  : isNordic ? "rgba(170,74,68,0.9)"   : _hexToRgba("#AA4A44",0.78);

    // ── SUCCESS / CONFIRM (btn-success) ───────────────────────────────────
    const _sucBg     = isWarm ? "rgba(31,90,58,0.6)"   : isNordic ? "rgba(47,107,79,0.70)"  : _hexToRgba("#2F6B4F",0.55);
    const _sucTxt    = "#F5EBDD";
    const _sucBorder = isWarm ? "#1F5A3A"              : "#2F6B4F";
    const _sucHover  = isWarm ? "rgba(31,90,58,0.9)"   : isNordic ? "rgba(47,107,79,0.9)"   : _hexToRgba("#2F6B4F",0.78);

    // ── CLOSE ─────────────────────────────────────────────────────────────
    const _clBg        = isWarm ? "rgba(61,71,88,0.75)" : _hexToRgba("#3D4758",0.20);
    const _clTxt       = isWarm ? "#F5EBDD"              : "#3D4758";
    const _clBorder    = "#3D4758";
    const _clOpacity   = isNordic ? "0.7" : "1";
    const _clHoverBg   = "rgba(61,71,88,0.9)";
    const _clHoverText = isWarm ? "#F5EBDD" : "#ffffff";

    const _iconAction = _hexToRgba(_accent, 0.55);

    return {
      bg:_bg, surface:_surface, card:_card, border:_border,
      text:_text, muted:_muted, accent:_accent, header:_header,
      glow:_hexToRgba(_accent, 0.10),
      hover:_hover, alt:_alt, input:_input,
      onAccent:"#ffffff",
      // Buttons — primary
      btnPrimBg:_pBg, btnPrimText:_pTxt, btnPrimBorder:_pBorder,
      btnPrimHoverBg:_pHover, btnPrimActiveBg:_pActive,
      btnSecBg:_card, btnSecText:_text,
      // Buttons — danger / remove
      btnDangerBg:_dnBg, btnDangerText:_dnTxt, btnDangerBorder:_dnBorder, btnDangerHoverBg:_dnHover,
      // Buttons — close
      btnCloseBg:_clBg, btnCloseText:_clTxt, btnCloseBorder:_clBorder, btnCloseOpacity:_clOpacity, btnCloseHoverBg:_clHoverBg, btnCloseHoverText:_clHoverText,
      // Buttons — test
      btnTestBg:_tsBg, btnTestText:_tsTxt, btnTestBorder:_tsBorder, btnTestHoverBg:_tsHover, btnTestHoverText:_tsHoverTxt,
      btnSuccessBg:_sucBg, btnSuccessText:_sucTxt, btnSuccessBorder:_sucBorder, btnSuccessHoverBg:_sucHover,
      btnGhost:_card,
      btnBlueBg:_tsBg, btnBlueText:_tsTxt, btnBlueBorder:_tsBorder,
      checkBg:_card, checkBorder:_border, checkText:_text,
      scBorder:_border, toastBg:_text, toastBorder:_border, toastText:_bg,
      rowOdd:_rowOdd, rowEven:_rowEven, rowHover:_rowHov,
      navOn:  isNordic ? "#D8DEE9" : isSlate ? "#DAE1EB" : "#F3EEE8",
      navOnText:_accent,
      // Icon colors
      iconAction:_iconAction, iconSubtle:_hexToRgba(_accent, 0.35),
      iconPrimary:_text, iconSecondary:_hexToRgba(_text, 0.82),
      // Add App button
      addBg:"rgba(5,46,22,.53)", addBorder:"rgba(5,46,22,.64)", addHoverBg:"rgba(5,46,22,.62)",
      // Green glow — only in light themes, boosted for visibility
      successGlow:"0 0 18px rgba(34,197,94,.25)",
      // Status map — identical tokens used by ALL views (grid, list, table, dashboard)
      statusMap:{
        "up-to-date":{ fg:_okFg, bg:_okBg,   border:_okBd },
        "outdated":  { fg:_dTx,  bg:_dBg,    border:_dBd  },
        "pinned":    { fg:"#756D95", bg:"rgba(117,109,149,.08)", border:"#C8C4D8" },
        "unknown":   { fg:_muted,   bg:"rgba(0,0,0,.04)",        border:_border   },
        "error":     { fg:"#B05020", bg:"rgba(176,80,32,.08)", border:"rgba(176,80,32,.28)" },
      },
      // Nordic "Save" dark override (legacy compat)
      nordSaveBg:"", nordSaveText:"", nordSaveBorder:"",
    };
  };

  // ── Build C ───────────────────────────────────────────────────────────────
  const C = darkMode ? _buildDark(_storedPreset) : _buildLight(_storedPreset);

  // ── Full CSS string ───────────────────────────────────────────────────────
  const _shadow = darkMode ? "rgba(0,0,0,.35)" : "rgba(60,45,30,.10)";
  const _btnBW  = darkMode ? "1px" : "2px";   // bold borders in light themes

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    *,*::before,*::after{box-sizing:border-box}
    body{background:${C.bg};color:${C.text};min-height:100vh;transition:background .3s,color .3s;font-family:Inter,system-ui,-apple-system,sans-serif;font-size:14px;font-weight:450;line-height:1.55;-webkit-font-smoothing:antialiased}
    ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:${C.surface}}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
    @keyframes su{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
    @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.35)}}
    @keyframes si{from{transform:translateX(80px);opacity:0}to{transform:translateX(0);opacity:1}}
    @keyframes sp{to{transform:rotate(360deg)}}

    /* ── TOPBAR ── */
    .topbar{position:sticky;top:0;z-index:100;background:${C.header};border-bottom:1px solid ${C.border};padding:0 20px;display:flex;align-items:center;gap:10px;min-height:72px;padding-block:10px;box-shadow:0 2px 14px ${_shadow}}
    .logo{font-family:'Space Mono',monospace;font-weight:700;font-size:15px;color:${C.accent};display:flex;align-items:center;gap:8px;flex-shrink:0;user-select:none;line-height:1.5}
    .logo-text{color:${C.accent}}
    .logo-dot{width:8px;height:8px;background:${C.accent};border-radius:50%;box-shadow:0 0 10px ${C.glow};animation:pulse 2s ease-in-out infinite}
    .logo-img{height:52px;width:52px;object-fit:contain;border-radius:6px}
    .search{flex:1;max-width:300px;background:${C.input};border:1px solid ${C.border};border-radius:8px;padding:8px 13px;font-family:'Syne';font-size:13.5px;color:${C.text};outline:none;transition:border-color .2s}
    .search:focus{border-color:${C.accent}}.search::placeholder{color:${C.muted}}
    .tr{display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:nowrap}
    .sched-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;cursor:help}

    /* ── BUTTONS ── */
    .btn{font-family:'Syne';font-weight:600;font-size:14px;border-radius:8px;padding:14px 18px;cursor:pointer;transition:background .15s,border-color .15s,transform .1s,box-shadow .15s;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;line-height:1.5;border:1px solid ${C.border};background:${C.card};color:${C.text};min-width:fit-content}
    .btn:disabled{opacity:.42;cursor:not-allowed}
    .btn-sm{padding:7px 12px;font-size:12px;border-radius:7px}

    /* Primary — theme-aware (Save Changes, Upload Logo, Regenerate Agent Token) */
    .btn-primary,.btn-green,.btn-p,.btn-save{background:${C.btnPrimBg};color:${C.btnPrimText};border:${_btnBW} solid ${C.btnPrimBorder};box-shadow:0 1px 3px ${_shadow}}
    .btn-primary:hover,.btn-green:hover,.btn-p:hover,.btn-save:hover{background:${C.btnPrimHoverBg};color:${C.btnPrimText};transform:translateY(-1px)}
    .btn-primary:active,.btn-green:active,.btn-p:active,.btn-save:active{background:${C.btnPrimActiveBg};transform:translateY(0)}
    .btn-primary:disabled,.btn-green:disabled,.btn-p:disabled,.btn-save:disabled{opacity:.42;cursor:not-allowed;transform:none}

    /* Close — bold border #3D4758, 20% translucent bg; Nordic at 70% opacity */
    /* Close buttons — hover uses #3D4758 solid */
    .btn-secondary,.btn-cancel,.btn-close{background:${C.btnCloseBg};color:${C.btnCloseText};border:${_btnBW} solid ${C.btnCloseBorder};opacity:${C.btnCloseOpacity||'1'}}
    .btn-secondary:hover,.btn-cancel:hover,.btn-close:hover{background:${C.btnCloseHoverBg||"#3D4758"};color:${C.btnCloseHoverText||"#fff"};border-color:#3D4758;opacity:1}
    .btn-g{background:${C.btnGhost};color:${C.text};border:1px solid ${C.border}}
    .btn-g:hover{border-color:${C.accent};color:${C.accent}}

    /* Danger / Remove (global) */
    .btn-danger,.btn-d{background:${C.btnDangerBg};color:${C.btnDangerText};border:1px solid ${C.btnDangerBorder}}
    .btn-danger:hover,.btn-d:hover{background:${C.btnDangerHoverBg};border-color:${C.btnDangerBorder}}
    .btn-w{background:#e0c43c14;color:#b8951f;border:1px solid #e0c43c44}.btn-w:hover{background:#e0c43c22;border-color:#e0c43c}
    /* Username / form-action buttons (Change Username, Change Password) — universal steel blue */
    .btn-g.btn-warn-hover:hover{border-color:#3B6EA8!important;color:#3B6EA8!important;background:rgba(59,110,168,.10)!important}
    .btn-g.btn-danger-hover:hover{border-color:${C.btnDangerBorder}!important;color:${C.btnDangerBorder}!important;background:${C.btnDangerBg}!important}

    /* Test buttons */
    .btn-blue,.btn-test{background:${C.btnTestBg};color:${C.btnTestText};border:${_btnBW} solid ${C.btnTestBorder}}
    .btn-blue:hover,.btn-test:hover{background:${C.btnTestHoverBg};color:${C.btnTestHoverText||C.btnTestText};transform:translateY(-1px)}
    .btn-blue:disabled,.btn-test:disabled{opacity:.42;cursor:not-allowed;transform:none}

    /* Success / Confirm */
    .btn-success{background:${C.btnSuccessBg};color:${C.btnSuccessText};border:${_btnBW} solid ${C.btnSuccessBorder}}
    .btn-success:hover{background:${C.btnSuccessHoverBg};color:${C.btnSuccessText};transform:translateY(-1px)}
    .btn-success:disabled{opacity:.42;cursor:not-allowed;transform:none}

    .btn-check-updates{font-family:'Syne';font-weight:600;font-size:13px;display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:8px;cursor:pointer;transition:all .15s;white-space:nowrap;line-height:1.5;background:${C.checkBg};color:${C.checkText};border:1px solid ${C.checkBorder};min-height:44px;min-width:fit-content}
    .btn-check-updates:hover{border-color:${C.accent};color:${C.accent}}
    .btn-check-updates:disabled{opacity:.45;cursor:not-allowed}
    .btn-add-app{font-family:'Syne';font-weight:600;font-size:14px;display:inline-flex;align-items:center;gap:8px;padding:9px 18px;border-radius:12px;cursor:pointer;transition:all .15s;white-space:nowrap;line-height:1.5;background:${C.addBg};color:#F7F3EE;border:1px solid ${C.addBorder};min-height:44px;min-width:fit-content}
    .btn-add-app:hover{background:${C.addHoverBg};transform:translateY(-1px)}
    .btn-add-app:active{background:${C.addBg};filter:brightness(.9);transform:none}

    /* ── ICON ACTIONS — accent-derived, never gray ── */
    .ic-action{background:transparent;border:none;cursor:pointer;padding:5px;display:flex;align-items:center;border-radius:5px;color:${C.iconAction};transition:color .12s,background .12s;flex-shrink:0}
    .ic-action:hover{color:${C.accent};background:${C.hover}}
    .ic-action.deploy{color:#1D9E75}.ic-action.deploy:hover{color:#3ce08c;background:#1D9E7514}
    .ic-action.del:hover{color:#e05c5c;background:#e05c5c14}
    .ic-btn{background:${C.card};border:1px solid ${C.border};border-radius:8px;padding:7px 10px;cursor:pointer;font-size:15px;transition:all .18s;color:${C.text};opacity:.65;line-height:1;display:inline-flex;align-items:center;justify-content:center}
    .ic-btn:hover{border-color:${C.accent};color:${C.accent}}.ic-btn.on{background:${C.accent}22;border-color:${C.accent};color:${C.accent}}
    .vg{display:flex;gap:2px}

    /* ── LAYOUT ── */
    .main{max-width:1600px;margin:0 auto;padding:24px 20px}
    .stats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:20px}
    .sc{background:${C.surface};border:1px solid ${C.border};border-top:3px solid ${C.border};border-radius:18px;padding:24px;min-height:110px;transition:all .2s;cursor:pointer;user-select:none;display:flex;flex-direction:column;justify-content:center}
    .sc:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(60,45,30,.07)}
    .sv{font-size:44px;font-weight:700;line-height:1;margin-bottom:6px}
    .sl{font-size:14px;color:${C.muted};text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-top:4px}

    /* ── TOOLBAR / CHIPS ── */
    .toolbar{display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap}
    .fg{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
    .chip-wrap{position:relative;display:inline-block}
    .chip{font-family:'Syne';font-size:11px;font-weight:700;padding:5px 12px;border-radius:999px;border:1px solid ${C.border};background:${C.card};color:${C.muted};cursor:pointer;transition:all .18s;text-transform:uppercase;letter-spacing:.5px;display:inline-flex;align-items:center;gap:5px}
    .chip.on{background:${C.accent};border-color:${C.accent};color:#fff}.chip.on-all{background:${C.hover};border-color:${C.muted}55;color:${C.text};font-weight:800}.chip.on-all:hover{border-color:${C.muted};color:${C.text}}.chip:hover:not(.on){border-color:${C.accent};color:${C.accent}}
    .chip-add{font-family:'Syne';font-size:11px;font-weight:700;padding:5px 10px;border-radius:999px;border:1px dashed ${C.border};background:transparent;color:${C.muted};cursor:pointer;transition:all .18s;display:inline-flex;align-items:center;gap:4px}
    .chip-add:hover{border-color:${C.accent};color:${C.accent}}
    .cat-selector{position:relative;display:inline-block}
    .cat-selector-btn{font-family:'Syne';font-size:11px;font-weight:700;padding:5px 12px;border-radius:999px;border:1px solid ${C.border};background:${C.card};color:${C.muted};cursor:pointer;transition:all .18s;text-transform:uppercase;letter-spacing:.5px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
    .cat-selector-btn:hover,.cat-selector-btn.open{border-color:${C.accent};color:${C.accent}}
    .cat-selector-btn.active{border-color:var(--cat-color,${C.accent});color:var(--cat-color,${C.accent})}
    .cat-panel{position:fixed;z-index:2000;background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:6px;min-width:220px;max-width:280px;box-shadow:0 8px 32px rgba(0,0,0,.45);animation:fadeIn .12s ease}
    .cat-panel-search{width:100%;box-sizing:border-box;background:${C.input};border:1px solid ${C.border};border-radius:7px;color:${C.text};font-family:'Syne';font-size:11px;font-weight:600;padding:6px 10px;outline:none;margin-bottom:4px}
    .cat-panel-search:focus{border-color:${C.accent}}
    .cat-panel-scroll{max-height:240px;overflow-y:auto}
    .cat-row{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;cursor:pointer;font-family:'Syne';font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;transition:background .12s;color:${C.text}}
    .cat-row:hover{background:${C.hover}}.cat-row.sel{background:${C.accent}18;color:${C.accent}}
    .cat-row-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .cat-row-count{margin-left:auto;font-size:10px;color:${C.muted};font-weight:600}
    .cat-panel-footer{border-top:1px solid ${C.border};margin-top:4px;padding-top:4px}
    .div{width:1px;height:20px;background:${C.border};flex-shrink:0}
    .sort-btn{font-family:'Syne';font-size:11px;font-weight:700;padding:5px 11px;border-radius:8px;border:1px solid ${C.border};background:${C.card};color:${C.text};opacity:.7;cursor:pointer;transition:all .18s;display:inline-flex;align-items:center;gap:4px}
    .sort-btn.on{color:${C.accent};border-color:${C.accent};background:${C.accent}12}

    /* ── GRID CARDS ── */
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:13px}
    .card{background:${C.surface};border:1px solid ${C.border};border-radius:14px;padding:20px;transition:all .22s;position:relative}
    .card:active{cursor:grabbing}
    .card:hover{border-color:${C.accent}55;transform:translateY(-2px);box-shadow:0 6px 26px ${C.glow}}
    .card.outdated{border-color:${C.statusMap.outdated.border}}
    .card.outdated:hover{border-color:${C.statusMap.outdated.fg};box-shadow:0 6px 16px ${C.statusMap.outdated.border}}
    .card.up-to-date{border-color:${C.statusMap["up-to-date"].border}}
    .card.up-to-date:hover{border-color:${C.statusMap["up-to-date"].fg};box-shadow:${C.successGlow||`0 6px 16px ${C.statusMap["up-to-date"].bg}`};transform:translateY(-2px)}
    .card.pinned{border-color:${C.statusMap.pinned.border}}.card.pinned:hover{border-color:${C.statusMap.pinned.fg};transform:translateY(-2px)}
    .card.unknown{border-color:${C.statusMap.unknown.border}}.card.unknown:hover{border-color:${C.statusMap.unknown.fg};transform:translateY(-2px)}
    .card.error{border-color:${C.statusMap.error.border}}.card.error:hover{border-color:${C.statusMap.error.fg};box-shadow:0 6px 16px ${C.statusMap.error.border}}
    .card.drag-over{border-color:${C.accent};border-style:dashed;opacity:.7}
    .ch{display:flex;align-items:center;gap:10px;margin-bottom:12px}
    .ct{flex:1;min-width:0}
    .cn{font-size:15.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px;line-height:1.45}
    .ci{font-size:12px;color:${C.muted};font-family:'Space Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    /* Status badge — shared semantic token, same rendering everywhere */
    .sb{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:4px 10px;border-radius:999px;flex-shrink:0;white-space:nowrap}

    /* ── COMPACT TABLE ── */
    .ct-wrap{background:${C.surface};border:1px solid ${C.border};border-radius:14px;overflow:hidden;width:100%;min-width:0}
    .ct-wrap-grid{width:100%;overflow-x:auto}
    .ct-thead{background:${C.card};border-radius:14px 14px 0 0}
    .ct-th{font-size:12.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${C.muted};padding:10px 12px;min-height:44px;white-space:nowrap;border-bottom:1px solid ${C.border};vertical-align:middle}
    .ct-th-app{text-align:left;padding-left:10px}.ct-th-cat{text-align:center}.ct-th-ver{text-align:right}.ct-th-status{text-align:center}.ct-th-actions{text-align:right;padding-right:10px}
    .ct-tr{border-bottom:1px solid ${C.border};transition:background .1s;cursor:default;min-height:72px}
    .ct-tr:last-child{border-bottom:none}
    .ct-tr:nth-child(odd){background:${C.rowOdd}}.ct-tr:nth-child(even){background:${C.rowEven}}
    .ct-tr:hover{background:${C.rowHover}}
    .ct-tr:focus{outline:2px solid ${C.accent}55;outline-offset:-2px}
    .ct-tr.outdated{box-shadow:inset 3px 0 0 ${C.statusMap.outdated.fg}}
    .ct-td{padding:10px 12px;min-height:56px;vertical-align:middle;overflow:visible}
    .ct-td-drag{width:28px;padding:0 4px;text-align:center;opacity:.35}.ct-td-app{padding-left:10px}.ct-td-cat{text-align:center}
    .ct-td-ver{text-align:right;font-family:'Space Mono',monospace;font-size:13.5px;font-variant-numeric:tabular-nums;white-space:nowrap;padding-right:12px}
    .ct-td-status{text-align:center;white-space:nowrap}.ct-td-actions{text-align:right;padding-right:10px;white-space:nowrap}
    .ct-name{font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${C.text};line-height:1.4}
    .ct-img{font-size:13px;color:${C.muted};font-family:'Space Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
    .ct-h{display:none}.ct-hc{display:none}.ct-r{display:none}.ct-cat{display:none}.ct-ver{display:none}.ct-dot{display:none}

    /* ── VERSION BOXES ── */
    .cv{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:11px}
    .vb{background:${C.surface};border:1px solid ${C.border};border-radius:8px;padding:10px 12px}
    .vl{font-size:11px;color:${C.muted};text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px;line-height:1.5}
    .vv{font-family:'Space Mono',monospace;font-size:14.5px;font-weight:700;line-height:1.45}
    .cf{display:flex;flex-direction:column;gap:5px;margin-top:4px}
    .cf-tags{display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-height:18px}
    .cf-foot{display:flex;align-items:center;justify-content:space-between;min-height:22px}
    .tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:3px 8px;border-radius:6px;white-space:nowrap;overflow:visible;max-width:100%}
    .ts{font-size:12px;color:${C.muted}}
    .drag-handle{color:${C.muted};cursor:grab;font-size:13px;padding:0 3px;user-select:none;opacity:.4;transition:opacity .15s;line-height:1;display:flex;align-items:center}
    .drag-handle:hover{opacity:1}.card:hover .drag-handle{opacity:.7}
    .drag-over-card{outline:2px dashed ${C.accent};outline-offset:-2px}
    .err-msg{font-size:10px;color:#e08c3c;background:#e08c3c12;border:1px solid #e08c3c22;border-radius:6px;padding:5px 8px;margin-bottom:9px;font-family:'Space Mono',monospace;word-break:break-all}

    /* ── LIST VIEW ── */
    .list-wrap{background:${C.surface};border:1px solid ${C.border};border-radius:14px;overflow:hidden}
    .list-wrap tbody tr:last-child{border-bottom:none}
    .list-wrap tbody tr:focus{outline:2px solid ${C.accent}55;outline-offset:-1px}
    .lh{display:grid;grid-template-columns:20px 2fr 0.85fr 1fr 1fr 1fr auto;padding:9px 14px 9px 10px;border-bottom:1px solid ${C.border};background:${C.card};border-radius:14px 14px 0 0}
    .lhc{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${C.muted};text-align:center}
    .lr{display:grid;grid-template-columns:20px 2fr 0.85fr 1fr 1fr 1fr auto;padding:11px 14px 11px 10px;border-bottom:1px solid ${C.border};align-items:center;transition:background .14s}
    .lr:last-child{border-bottom:none;border-radius:0 0 14px 14px}.lr:nth-child(even){background:${C.alt}}.lr:hover{background:${C.hover}}
    .lai{display:flex;align-items:center;gap:10px;min-width:0}
    .ln{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .limg{font-size:12px;color:${C.muted};font-family:'Space Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lc{font-family:'Space Mono',monospace;font-size:12px;text-align:center}
    .la{display:flex;gap:5px;justify-content:flex-end}

    /* ── DROPDOWNS ── */
    .dd-wrap{position:relative;display:inline-block;isolation:isolate}
    .dd-menu{position:absolute;right:0;top:calc(100% + 4px);background:${C.surface};border:1px solid ${C.border};border-radius:10px;padding:5px;min-width:178px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,.45);animation:fadeIn .15s ease}
    .dd-item{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:7px;font-size:13.5px;font-weight:550;cursor:pointer;transition:background .14s;color:${C.text};white-space:nowrap;line-height:1.5}
    .dd-item:hover{background:${C.hover}}.dd-item.danger{color:#e05c5c}.dd-item.danger:hover{background:#e05c5c18}
    .dd-sep{height:1px;background:${C.border};margin:4px 0}
    .dd-lbl{padding:4px 10px 2px;font-size:10px;color:${C.muted};font-weight:700;text-transform:uppercase;letter-spacing:.5px}

    /* ── OVERLAYS / MODALS ── */
    .ov{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(5px);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
    .modal{background:${C.surface};border:1px solid ${C.border};border-radius:18px;padding:36px 32px 28px;width:100%;max-width:500px;animation:su .2s ease;max-height:90vh;overflow-y:auto;box-shadow:0 16px 48px rgba(60,45,30,.14)}
    .modal-lg{max-width:820px}
    .sw{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(5px);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
    .sw-panel{background:${C.surface};border:1px solid ${C.border};border-radius:24px;width:clamp(1100px,86vw,1800px);height:clamp(850px,88vh,94vh);display:grid;grid-template-columns:260px 1fr;grid-template-rows:auto 1fr auto;overflow:hidden;animation:su .2s ease;box-shadow:0 24px 80px rgba(0,0,0,.14)}
    .sw-header{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;padding:22px 32px 20px;border-bottom:1px solid ${C.border};background:${C.surface}}
    .sw-title{font-size:24px;font-weight:800;color:${C.text};line-height:1.35;letter-spacing:-.3px}
    .sw-body{display:contents}
    .sw-sidebar{grid-row:2;border-right:1px solid ${C.border};padding:28px 16px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;min-height:0;background:${C.alt}}
    .sw-nav{display:flex;align-items:center;padding:18px 22px 22px;border-radius:12px;cursor:pointer;font-family:'Syne';font-size:18px;font-weight:600;line-height:1.65;color:${C.muted};border:none;background:transparent;text-align:left;width:100%;transition:background .15s,color .15s;min-height:64px;overflow:visible;letter-spacing:.01em;box-sizing:border-box;white-space:normal;word-break:normal}
    .sw-nav:hover{background:${C.hover};color:${C.text}}
    .sw-nav.on{background:${C.navOn};color:${C.navOnText};font-weight:700;box-shadow:0 2px 12px rgba(0,0,0,.18),inset 0 0 0 1px rgba(0,0,0,.06)}
    .sw-dot{display:none}
    .sw-content{grid-row:2;overflow-y:auto;padding:40px 48px;min-width:0}
    .sw-footer{grid-column:1/-1;display:flex;align-items:center;justify-content:flex-end;gap:16px;padding:22px 36px;min-height:80px;border-top:1px solid ${C.border}}
    .mt{font-size:22px;font-weight:800;margin-bottom:24px;line-height:1.5;padding:8px 0 12px;overflow:visible;position:relative;z-index:1}
    .modal-header{position:relative;padding-right:40px;margin-bottom:24px}
    .modal-header .mt{margin-bottom:0;padding:0}
    .modal-close{position:absolute;top:10px;right:10px;width:22px;height:22px;border:none;background:transparent;color:${C.muted};cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:background .12s,color .12s,opacity .12s;padding:0;flex-shrink:0;opacity:.7}
    .modal-close:hover{background:${C.hover};color:${C.text};opacity:.95}.modal-close:focus-visible{outline:2px solid ${C.accent};outline-offset:2px}

    /* ── FORM ELEMENTS ── */
    .fg2{margin-bottom:28px}
    .fl{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${C.text};opacity:.92;margin-bottom:14px;display:block;line-height:1.6;padding-bottom:4px}
    .fi{width:100%;background:${C.input};border:1px solid ${C.border};border-radius:10px;padding:17px 18px;font-family:'Space Mono',monospace;font-size:15px;color:${C.text};outline:none;transition:border-color .2s;line-height:1.5;box-sizing:border-box;min-height:54px}
    .fi:focus{border-color:${C.accent}}.fi::placeholder{color:${C.muted};opacity:.62}.fi:disabled{opacity:.55}
    .fi-ta{resize:vertical;min-height:150px;font-size:14px;padding:18px 18px;line-height:1.6}
    .fs{width:100%;background:${C.input};border:1px solid ${C.border};border-radius:9px;padding:14px 14px;font-family:'Syne';font-size:14px;color:${C.text};outline:none;cursor:pointer;appearance:none;min-height:50px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6b8a' d='M6 8L1 3h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}
    .fs:focus{border-color:${C.accent}}
    .fh{font-size:13.5px;color:${C.muted};margin-top:10px;line-height:1.6;opacity:.85}
    .prev{background:${C.card};border:1px solid ${C.border};border-radius:9px;padding:13px;margin-top:10px}
    .pr{display:flex;align-items:center;gap:9px;font-size:12.5px;margin-bottom:5px}.pr:last-child{margin:0}
    .pk{color:${C.muted};font-size:10px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;width:70px;flex-shrink:0}
    .pv{font-family:'Space Mono',monospace;font-size:11.5px}
    .ma{display:flex;gap:9px;justify-content:flex-end;margin-top:18px}
    .stabs{display:flex;gap:4px;margin-bottom:18px;background:${C.card};padding:5px;border-radius:10px;flex-wrap:nowrap;overflow-x:auto}
    .stab{flex:1;min-width:fit-content;padding:11px 12px;display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;font-size:13px;font-weight:700;border-radius:8px;cursor:pointer;transition:all .18s;color:${C.text};opacity:.78;border:none;background:transparent;font-family:'Syne';line-height:1.6;min-height:46px}
    .stab.on{background:${C.accent};color:#fff}

    /* ── STATUS & MISC ── */
    .warn-banner{background:#e0c43c18;border:1px solid #e0c43c44;border-radius:8px;padding:10px 14px;font-size:12.5px;color:#e0c43c;margin-bottom:16px;display:flex;align-items:center;gap:8px}
    .sec-b{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#3ce08c;background:#3ce08c14;border:1px solid #3ce08c2a;border-radius:6px;padding:4px 10px;margin-bottom:14px}
    .tok-row{display:flex;align-items:center;justify-content:space-between;background:${C.card};border:1px solid ${C.border};border-radius:9px;padding:11px 14px;margin-bottom:14px}
    .tok-y{color:#3ce08c;font-size:13px;font-weight:600}.tok-n{color:${C.muted};font-size:13px}
    .brand-preview{background:${C.card};border:1px solid ${C.border};border-radius:9px;padding:14px;margin-bottom:14px;display:flex;align-items:center;gap:12px}
    .css-editor{width:100%;background:${C.input};border:1px solid ${C.border};border-radius:9px;padding:12px 14px;font-family:'Space Mono',monospace;font-size:11.5px;color:${C.text};outline:none;resize:vertical;min-height:190px;transition:border-color .2s;tab-size:2}
    .css-editor:focus{border-color:${C.accent}}
    .icon-upload-area{display:flex;align-items:center;gap:14px;background:${C.card};border:1px solid ${C.border};border-radius:9px;padding:12px 14px;margin-bottom:14px}
    .icon-upload-hint{font-size:11px;color:${C.muted};line-height:1.5;margin-bottom:5px}
    .hist-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid ${C.border}}
    .hist-row:last-child{border-bottom:none}
    .hist-bump{font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 7px;border-radius:5px}
    .ir-added{color:#3ce08c;font-size:12px;margin-bottom:5px;font-weight:600}
    .ir-skip{color:${C.muted};font-size:11px}
    .import-result{background:${C.card};border:1px solid ${C.border};border-radius:9px;padding:13px;margin-top:10px}
    .ch-info{background:${C.card};border:1px solid ${C.border};border-radius:9px;padding:12px 14px;margin-bottom:14px}
    .snooze-badge{font-size:11px;font-weight:600;color:#e0c43c;background:#e0c43c18;border:1px solid #e0c43c33;border-radius:5px;padding:3px 6px;display:inline-flex;align-items:center}
    .ignore-badge{font-size:11px;font-weight:600;color:${C.muted};background:${C.surface};border:1px solid ${C.border};border-radius:5px;padding:3px 6px;display:inline-flex;align-items:center}
    .empty{text-align:center;padding:70px 24px;color:${C.muted}}
    .ei{font-size:44px;margin-bottom:13px}.et{font-size:20px;font-weight:700;color:${C.text};margin-bottom:8px}
    .spin{animation:sp 1s linear infinite;display:inline-block}
    .toast{position:fixed;bottom:22px;right:22px;z-index:300;background:${C.toastBg};border:1px solid ${C.toastBorder};border-radius:11px;padding:11px 17px;font-size:13.5px;font-weight:600;color:${C.toastText};box-shadow:0 8px 28px rgba(0,0,0,.32);animation:si .22s ease;display:flex;align-items:center;gap:9px}
    .err-inline{background:#e05c5c18;border:1px solid #e05c5c44;border-radius:8px;padding:9px 12px;font-size:13px;color:#e05c5c;margin-bottom:14px}
    .diag-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid ${C.border}40}
    .diag-row:last-child{border-bottom:none}
    .diag-key{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${C.muted};width:80px;flex-shrink:0}
    .diag-val{font-family:'Space Mono',monospace;font-size:11.5px;color:${C.text};flex:1;min-width:0;word-break:break-all}
    .diag-ok{color:#3ce08c}.diag-err{color:#e05c5c}.diag-warn{color:#e0c43c}.diag-unknown{color:${C.muted}}
    .update-err-box{background:#e05c5c0c;border:1px solid #e05c5c33;border-radius:10px;padding:14px 16px;margin-bottom:16px}
    .update-err-title{font-size:13px;font-weight:700;color:#e05c5c;margin-bottom:6px;display:flex;align-items:center;gap:7px}
    .update-err-msg{font-size:12.5px;color:${C.text};line-height:1.6}
    :focus-visible{outline:2px solid ${C.accent};outline-offset:2px;border-radius:4px}
    button:focus-visible,a:focus-visible,[tabindex]:focus-visible{outline:2px solid ${C.accent};outline-offset:2px}
    @media(max-width:900px){.stats{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:1fr}.lh{display:none}.lr{grid-template-columns:1fr auto}.ct-wrap table{font-size:10px}}
  `;

  return {
    darkMode, toggleDark,
    viewMode, changeViewMode,
    appName, setAppName,
    appLogo, setAppLogo,
    appAccent, setAppAccent, changeAccent,
    themePreset, setThemePreset, changePreset,
    C, css,
  };
}
