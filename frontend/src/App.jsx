import React, { useState, useEffect, useCallback, useRef } from "react";
import LogoSVG, { LogoutIcon } from "./components/LogoSVG";
import Icon from "./components/Icon";
import { STATUS_LABEL } from "./services/designTokens";
import AppIcon from "./components/AppIcon";
import ChannelPill, { resolveChannelUrl } from "./components/ChannelPill";
import CategoryPopover from "./components/CategoryPopover";
import LoginScreen from "./pages/LoginScreen";
import ChangePasswordScreen from "./pages/ChangePasswordScreen";
import CardMenu from "./components/CardMenu";
import { copyText, parseImage, stripBlackBackground } from "./services/utils";
import { CAT_KEYWORDS } from "./services/categories";
import { fetchCategoriesPublic, fetchIconLibraries, fetchBrandingPublic } from "./services/api";
import { useAuth } from "./hooks/useAuth";
import { useSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import AddAppDialog from "./dialogs/AddAppDialog";
import ImportDialog from "./dialogs/ImportDialog";
import ImportAppsDialog from "./dialogs/ImportAppsDialog";
import UpdateDialog from "./dialogs/UpdateDialog";
import OverrideDialog from "./dialogs/OverrideDialog";
import HistoryDialog from "./dialogs/HistoryDialog";
import QuickEditDialogs from "./dialogs/QuickEditDialogs";
import SettingsDialog from "./dialogs/SettingsDialog";
import UpdateLogDialog from "./dialogs/UpdateLogDialog";
import HostWizard from "./dialogs/HostWizard";

export default function App() {
  // ── Custom hooks ────────────────────────────────────────────────────────────
  const auth = useAuth();
  const theme = useTheme();
  const settingsHook = useSettings(auth.api, (msg, type) => toast(msg, type));

  // Core data
  const [apps, setApps]             = useState([]);
  const [categories, setCategories] = useState([]);
  const categoriesRef = useRef([]);   // always-current ref for autoCategory
  const [cardOrder, setCardOrder]   = useState(() => {
    try { return JSON.parse(localStorage.getItem("dt-card-order") || "[]"); } catch { return []; }
  });
  const [sortMode, setSortMode]     = useState(() => localStorage.getItem("dt-sort") || "custom");

  // UI
  const [loading, setLoading]       = useState(true);
  const [schedulerStatus, setScheduler] = useState(null);

  // Modal
  const [modal, setModal]           = useState(null);
  const [activeApp, setActiveApp]   = useState(null);
  const [imageInput, setImageInput] = useState("");
  const [parsed, setParsed]         = useState(null);
  const [newVersion, setNewVersion] = useState("");
  const [overData, setOverData]     = useState({category:"",custom_icon:"",version_source_url:"",notes:"",install_path:"",container_id:"",app_url:"",host_id:"",service_name:"",auto_update:"off"});
  const [pendingIcon, setPendingIcon]   = useState(null);
  const [showInstallPath, setShowInstallPath] = useState(false);
  const [history, setHistory]           = useState([]);
  const [iconSearch, setIconSearch]     = useState("");
  const [iconResults, setIconResults]   = useState([]);  // [{name,url,source}]
  const [quickImageApp, setQuickImageApp] = useState(null);
  const [quickImageVal, setQuickImageVal] = useState("");
  const [quickPathApp,  setQuickPathApp]  = useState(null);
  const [quickPathVal,  setQuickPathVal]  = useState({install_path:"",container_id:""});
  const [iconLibLoaded, setIconLibLoaded] = useState(false);
  const iconLibRef    = useRef([]);   // full merged icon list, fetched once
  const preSearchIcon = useRef(null); // custom_icon value before search preview

  // Import
  const [composeText, setComposeText] = useState("");
  const [importResult, setImportResult] = useState(null);

  // Filters
  const [filterCat, setFilterCat]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch]         = useState("");

  // Category inline editor
  const [catPopover, setCatPopover] = useState(null); // "new" | cat object
  const [catPopoverAnchor, setCatPopoverAnchor] = useState(null); // key of chip
  const [catDropdown, setCatDropdown] = useState(false); // category dropdown open
  const [catSearch, setCatSearch]     = useState("");    // search within category dropdown
  const catDropRef = useRef(null);

  // DnD
  const dragId    = useRef(null);
  const dragOver  = useRef(null);

  // Misc
  const [checkingAll, setCheckingAll] = useState(false);
  const [notif, setNotif]           = useState(null);
  const iconFileRef = useRef(null);
  const logoFileRef = useRef(null);

  // Agents / hosts
  const [hosts, setHosts]                   = useState([]);
  const [hostModal, setHostModal]           = useState(null);
  const [activeHost, setActiveHost]         = useState(null);
  const [hostWizardStep, setHostWizardStep] = useState(1);
  const [hostForm, setHostForm]             = useState({name:"",ip:"",port:"7777",allowed_base:"/home"});
  const [newToken, setNewToken]             = useState("");
  const [installToken, setInstallToken]     = useState("");
  const [decKey, setDecKey]                 = useState("");
  const [tokenExpiry, setTokenExpiry]       = useState(null);
  const [isPublicIp, setIsPublicIp]         = useState(false);
  const [hostTesting, setHostTesting]       = useState(false);
  const [hostTestMsg, setHostTestMsg]       = useState("");
  const [caReady, setCaReady]               = useState(null); // null=unknown, true=ok, false=error
  const [copiedCurl,   setCopiedCurl]       = useState(false);
  const [copiedToken,  setCopiedToken]      = useState(false);
  const [copiedInstall,setCopiedInstall]    = useState(false);
  const [copiedDecKey, setCopiedDecKey]     = useState(false);
  const [timerTick,    setTimerTick]        = useState(0);
  const [userFingerprint, setUserFingerprint] = useState("");
  const [fpCompared, setFpCompared]         = useState(false);
  const [fpMatch, setFpMatch]               = useState(false);

  // Update log / revert
  const [logModal, setLogModal]             = useState(null); // null | app object
  const [updateLogs, setUpdateLogs]         = useState([]);
  const [revertModal, setRevertModal]       = useState(null); // null | log entry
  const [updatingApp, setUpdatingApp]       = useState(null); // app_id being updated
  const [updateError, setUpdateError]       = useState(null); // {app, message} for troubleshoot dialog

  // ── Resizable column system (percentage-based, boundary drag model) ──────────
  // Columns: application, category, current, latest, status, actions
  // Stored as % of table width. Sum must equal 100.
  // Minimums in px — enforced against actual container width at drag time.
  const COL_KEYS  = ["application","category","current","latest","status","actions"];
  const COL_PCT_DEFAULTS = { application:32, category:12, current:12, latest:12, status:12, actions:20 };
  const COL_PX_MIN = { application:280, category:140, current:130, latest:130, status:140, actions:240 };
  const LS_KEY = "vigil-column-layout-v2";

  const [colPct, setColPct] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (saved && COL_KEYS.every(k => typeof saved[k] === "number")) return saved;
    } catch(_) {}
    return { ...COL_PCT_DEFAULTS };
  });

  const colWrapRef = React.useRef(null);

  const saveColPct = (pct) => {
    setColPct(pct);
    try { localStorage.setItem(LS_KEY, JSON.stringify(pct)); } catch(_) {}
  };

  const resetColPct = () => {
    saveColPct({ ...COL_PCT_DEFAULTS });
  };

  // Auto-fit: expand Application + Actions, compress Category + Status
  const autoFitCols = () => {
    saveColPct({ application:36, category:10, current:12, latest:12, status:10, actions:20 });
  };

  // Build CSS grid template from percentages
  const buildGTC = (pct) =>
    `28px ${COL_KEYS.map(k => `${pct[k]}fr`).join(" ")}`;

  // Boundary drag: dragging the right edge of column at index `idx` 
  // grows/shrinks that column and its right neighbour simultaneously.
  const makeBoundaryHandler = (idx) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const containerEl = colWrapRef.current;
    if (!containerEl) return;
    const containerW = containerEl.getBoundingClientRect().width - 28; // minus drag col
    const startX = e.clientX;
    const keyL = COL_KEYS[idx];
    const keyR = COL_KEYS[idx + 1];
    if (!keyR) return; // no right neighbour for last column
    const startPctL = colPct[keyL];
    const startPctR = colPct[keyR];

    const clamp = (pct, key) => {
      const minPct = (COL_PX_MIN[key] / containerW) * 100;
      return Math.max(minPct, pct);
    };

    const onMove = (mv) => {
      const dx = mv.clientX - startX;
      const dpct = (dx / containerW) * 100;
      let newL = startPctL + dpct;
      let newR = startPctR - dpct;
      // enforce mins — take from the other side
      const minL = (COL_PX_MIN[keyL] / containerW) * 100;
      const minR = (COL_PX_MIN[keyR] / containerW) * 100;
      if (newL < minL) { newR -= (minL - newL); newL = minL; }
      if (newR < minR) { newL -= (minR - newR); newR = minR; }
      setColPct(prev => ({ ...prev, [keyL]: newL, [keyR]: newR }));
    };

    const onUp = (mu) => {
      onMove(mu);
      setColPct(prev => {
        const next = { ...prev };
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch(_) {}
        return next;
      });
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const toast = (msg, type="success") => { setNotif({msg,type}); setTimeout(()=>setNotif(null),3500); };

  // ── Bootstrap: load categories + branding (public, before auth) ───────────
  useEffect(() => {
    (async () => {
      try {
        const cats = await fetchCategoriesPublic();
        setCategories(cats);
        categoriesRef.current = cats;
      } catch(_) {}
      // Load branding from public endpoint so login/change-pw screens
      // show the correct custom logo and accent colour.
      try {
        const branding = await fetchBrandingPublic();
        if (branding) {
          theme.setAppName(branding.app_name || "Vigil");
          theme.setAppAccent(branding.app_accent || "#A0A0B8");
          if (branding.app_logo) {
            stripBlackBackground(branding.app_logo).then(s => theme.setAppLogo(s));
          }
        }
      } catch(_) {}
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data loaders ──────────────────────────────────────────────────────────
  const loadApps = useCallback(async () => {
    try {
      const apps = await auth.api("/apps");
      setApps(apps);
      return apps;
    } catch(_) { return []; }
    finally { setLoading(false); }
  }, [auth.api]);

  const loadCategories = useCallback(async () => {
    try {
      const cats = await auth.api("/categories");
      setCategories(cats);
      categoriesRef.current = cats;
    } catch(_) {}
  }, [auth.api]);

  // Re-categorize any apps still sitting as "uncategorized" after categories load
  const recategorizeExisting = useCallback(async () => {
    // Delegate entirely to backend — reliable, no JS timing issues
    try {
      const result = await auth.api("/apps/recategorize", {method:"POST"});
      if (result && result.updated > 0) {
        setApps(result.apps);
        toast(`Auto-categorized ${result.updated} app(s)`);
        console.log("[Vigil] recategorize:", result.updated, "apps updated");
      }
    } catch(e) {
      console.warn("[Vigil] recategorize failed:", e.message);
    }
  }, [auth.api]);

  const loadHealth = useCallback(async () => {
    try { const d = await auth.api("/health"); setScheduler(d.scheduler); } catch(_) {}
  }, [auth.api]);

  const loadHosts = useCallback(async () => {
    try { const h = await auth.api("/hosts"); setHosts(h); } catch(_) {}
  }, [auth.api]);

  useEffect(() => {
    if (auth.authState !== "app") return;
    (async () => {
      // Load categories first so recategorize has them ready
      const cats = await (async () => {
        try {
          const c = await auth.api("/categories");
          setCategories(c); categoriesRef.current = c; return c;
        } catch(_) { return []; }
      })();
      await loadApps();
      recategorizeExisting();  // backend handles it — no JS timing issues
      loadHealth(); settingsHook.loadSettings().then(branding => {
        if (branding) {
          theme.setAppName(branding.appName);
          if (branding.rawLogo) {
            stripBlackBackground(branding.rawLogo).then(stripped => theme.setAppLogo(stripped));
          } else {
            theme.setAppLogo("");
          }
          // R6/S3: Sync theme preset from backend — guarded to prevent load-loop
          const savedPreset  = settingsHook.settings.theme_preset || "warm-paper";
          const savedAccent  = branding.appAccent;
          const lsPreset     = localStorage.getItem("dt-preset") || "warm-paper";
          const lsAccent     = localStorage.getItem("dt-accent") || "";
          const needsPreset  = savedPreset !== lsPreset;
          const needsAccent  = savedAccent && savedAccent !== lsAccent;
          if ((needsPreset || needsAccent) && typeof theme.changePreset === "function") {
            theme.changePreset(savedPreset, savedAccent);
          } else if (needsAccent) {
            theme.setAppAccent(savedAccent);
          }
        }
      }); loadHosts();
    })();
    // Poll health every 30s AND apps every 60s so UI stays current without F5
    const tHealth = setInterval(loadHealth, 30000);
    const tApps   = setInterval(loadApps,  60000);
    // Also reload apps when the browser tab regains focus (catches background updates)
    const onFocus = () => loadApps();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(tHealth);
      clearInterval(tApps);
      window.removeEventListener("focus", onFocus);
    };
  }, [auth.authState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Category helpers ──────────────────────────────────────────────────────
  const catMap = Object.fromEntries(categories.map(c => [c.key, c]));
  const getCatColor = k => catMap[k]?.color || "#6b6b8a";
  const getCatLabel = k => catMap[k]?.label || (k && k !== "uncategorized" ? k : "Uncategorized");

  function autoCategory(img) {
    const l = img.toLowerCase();
    // 1. Check built-in map first — synchronous, always works
    for (const [key, kws] of Object.entries(CAT_KEYWORDS)) {
      if (kws.some(kw => l.includes(kw))) return key;
    }
    // 2. Then check user-defined DB categories (may not be loaded yet on first render)
    const cats = categoriesRef.current.length ? categoriesRef.current : categories;
    for (const cat of cats) {
      if (cat.keywords && cat.keywords.some(kw => kw && l.includes(kw.toLowerCase()))) return cat.key;
    }
    return "uncategorized";
  }
  const saveCat = async (payload, id) => {
    try {
      if (id) {
        const c = await auth.api(`/categories/${id}`,{method:"PATCH",body:JSON.stringify(payload)});
        setCategories(p => p.map(x => x.id===id ? c : x)); toast("Category updated!");
      } else {
        const c = await auth.api("/categories",{method:"POST",body:JSON.stringify(payload)});
        setCategories(p => [...p, c]); toast(`"${c.label}" created!`);
      }
      setCatPopover(null); setCatPopoverAnchor(null);
    } catch(e) { toast(e.message||"Failed","error"); }
  };

  const deleteCat = async cat => {
    if (!window.confirm(`Delete "${cat.label}"? Apps will move to Uncategorized.`)) return;
    try {
      await auth.api(`/categories/${cat.id}`,{method:"DELETE"});
      setCategories(p => p.filter(c => c.id !== cat.id));
      setApps(p => p.map(a => a.category===cat.key ? {...a,category:"uncategorized"} : a));
      setCatPopover(null); setCatPopoverAnchor(null);
      toast("Deleted","info");
    } catch(e) { toast(e.message||"Failed","error"); }
  };

  // ── Drag and drop ──────────────────────────────────────────────────────────
  const handleDragStart = (e, id) => { dragId.current = id; e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver  = (e, id) => { e.preventDefault(); dragOver.current = id; };
  const handleDrop      = () => {
    setSortMode("custom"); localStorage.setItem("dt-sort","custom");
    if (dragId.current === dragOver.current || !dragId.current) return;
    const orderedIds = getSortedApps().map(a => a.id);
    const from = orderedIds.indexOf(dragId.current);
    const to   = orderedIds.indexOf(dragOver.current);
    if (from === -1 || to === -1) return;
    const next = [...orderedIds];
    next.splice(from, 1);
    next.splice(to, 0, dragId.current);
    setCardOrder(next);
    localStorage.setItem("dt-card-order", JSON.stringify(next));
    dragId.current = null; dragOver.current = null;
  };

  // ── Sort + filter apps ─────────────────────────────────────────────────────
  function getSortedApps() {
    let list = [...apps];
    if (sortMode === "az")     list.sort((a,b) => a.name.localeCompare(b.name));
    else if (sortMode === "za") list.sort((a,b) => b.name.localeCompare(a.name));
    else {
      // custom order
      const order = cardOrder.length ? cardOrder : apps.map(a=>a.id);
      list.sort((a,b) => {
        const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }
    return list;
  }

  const filtered = getSortedApps().filter(a => {
    if (filterCat !== "all" && a.category !== filterCat) return false;
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) &&
        !a.image.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // For compact view: sort by status priority (outdated first, then pinned, unknown, ok, error)
  const STATUS_PRIORITY = { outdated:0, pinned:1, unknown:2, error:3, "up-to-date":4 };
  const filteredCompact = theme.viewMode === "compact"
    ? [...filtered].sort((a,b) => {
        const pa = STATUS_PRIORITY[a.status] ?? 5;
        const pb = STATUS_PRIORITY[b.status] ?? 5;
        return pa !== pb ? pa - pb : 0;
      })
    : filtered;

  // ── App actions ───────────────────────────────────────────────────────────
  const handleInput = v => {
    setImageInput(v);
    try { setParsed(v.trim() ? parseImage(v) : null); } catch { setParsed(null); }
  };

  const addApp = async () => {
    if (!parsed) return;
    try {
      const a = await auth.api("/apps",{method:"POST",body:JSON.stringify({
        image:parsed.image, name:parsed.name, version:parsed.version, category:autoCategory(parsed.image)
      })});
      setApps(p => [a, ...p]); setModal(null); setImageInput(""); setParsed(null); toast(`Added ${parsed.name}!`);
      // Immediately check the new app so status/latest resolve without waiting for the scheduler
      try {
        const checked = await auth.api(`/apps/${a.id}/check`, {method:"POST"});
        setApps(p => p.map(x => x.id===a.id ? checked : x));
      } catch(_) {}
    } catch(e) { toast(e.message||"Error","error"); }
  };

  const importCompose = async () => {
    if (!composeText.trim()) return;
    try {
      const r = await auth.api("/apps/import",{method:"POST",body:JSON.stringify({compose:composeText})});
      setImportResult(r); await loadApps(); toast(`Imported ${r.added.length} app(s)!`);
    } catch(e) { toast(e.message||"Import failed","error"); }
  };

  const exportApps = async () => {
    try {
      const data = await auth.api("/apps/export");
      const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a"); a.href=url; a.download="vigil-export.json"; a.click();
      URL.revokeObjectURL(url); toast("Export downloaded!");
    } catch { toast("Export failed","error"); }
  };

  const updateVersion = async () => {
    if (!activeApp || !newVersion) return;
    try {
      const u = await auth.api(`/apps/${activeApp.id}`,{method:"PATCH",body:JSON.stringify({version:newVersion})});
      setApps(p => p.map(a => a.id===activeApp.id ? u : a)); setModal(null); setNewVersion(""); toast("Updated!");
    } catch { toast("Failed","error"); }
  };

  const openOverride = app => {
    setModal("override"); setActiveApp(app); setPendingIcon(null); setShowInstallPath(false);
    
    loadIconLib(); // fetch icon lists in background if not already loaded
    setOverData({image:app.image||"",name:app.name||"",category:app.category||"uncategorized",custom_icon:app.custom_icon||"",version_source_url:app.version_source_url||"",notes:app.notes||"",install_path:app.install_path||"",container_id:app.container_id||"",app_url:app.app_url||"",host_id:app.host_id||"",service_name:app.service_name||"",auto_update:app.auto_update||"off"});
  };

  // ── Icon library (fetched once, cached in ref) ────────────────────────────────
  // Close category dropdown on outside click
  useEffect(()=>{
    if (!catDropdown) return;
    const h = e => {
      if (catDropRef.current && !catDropRef.current.contains(e.target)) setCatDropdown(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [catDropdown]);

  // ── Countdown timer for install token expiry ───────────────────────────────
  useEffect(()=>{
    if (!tokenExpiry) return;
    const iv = setInterval(()=>setTimerTick(t=>t+1), 1000);
    return ()=>clearInterval(iv);
  }, [tokenExpiry]);

  // ── CA status check (runs when agents tab opens) ───────────────────────────
  useEffect(()=>{
    if (modal==="settings" && settingsHook.settingsTab==="agents" && caReady===null) {
      auth.api("/hosts/ca-fingerprint")
        .then(()=>setCaReady(true))
        .catch(()=>setCaReady(false));
    }
  }, [modal, settingsHook.settingsTab]);

  // ── Global keyboard shortcuts: Enter = save, ESC = close ───────────────────
  useEffect(() => {
    const handler = e => {
      if (!modal) return;
      // Don't intercept inside textareas (let Enter create newlines)
      if (e.target.tagName === "TEXTAREA") return;
      // Don't intercept inside the CategoryPopover inputs
      if (e.target.closest?.(".cat-selector")) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setModal(null);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (modal === "add"      && parsed)                               { addApp(); return; }
        if (modal === "import"   && composeText.trim())                   { importCompose(); return; }
        if (modal === "edit"     && newVersion && newVersion !== activeApp?.version) { updateVersion(); return; }
        if (modal === "override" && activeApp)                            { saveOverride(); return; }
        if (modal === "settings")                                         { settingsHook.saveSettings().then(branding => {
          if (branding) {
            theme.setAppName(branding.appName);
            theme.setAppLogo(branding.strippedLogo);
            theme.setAppAccent(branding.appAccent);
          }
          setModal(null);
        }); return; }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [modal, parsed, composeText, newVersion, activeApp]); // eslint-disable-line

  const loadIconLib = useCallback(async () => {
    if (iconLibRef.current.length > 0) return; // already loaded
    const results = [];
    const addIcons = (files, cdnBase, source) => {
      for (const f of (files || [])) {
        const m = f.match(/\/png\/([^/]+)\.png$/i);
        if (m) results.push({ name: m[1], url: `${cdnBase}/${m[1]}.png`, source });
      }
    };
    try {
      const { dashboard, selfhst } = await fetchIconLibraries();
      if (dashboard)
        addIcons(dashboard.files, "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png", "Dashboard Icons");
      if (selfhst)
        addIcons(selfhst.files, "https://cdn.jsdelivr.net/gh/selfhst/icons/png", "selfh.st");
    } catch(_) {}
    iconLibRef.current = results;
    setIconLibLoaded(true);
  }, []);

  const searchIcons = useCallback((query) => {
    setIconSearch(query);
    if (!query.trim()) {
      // Restore original icon if user clears the search
      if (preSearchIcon.current !== null) {
        setOverData(d => ({...d, custom_icon: preSearchIcon.current}));
        preSearchIcon.current = null;
      }
      setIconResults([]);
      return;
    }
    const q = query.toLowerCase().replace(/[-_.\s]/g, "");
    const scored = iconLibRef.current
      .map(icon => {
        const n = icon.name.toLowerCase().replace(/[-_.]/g, "");
        if (n === q) return { ...icon, score: 3 };
        if (n.startsWith(q)) return { ...icon, score: 2 };
        if (n.includes(q)) return { ...icon, score: 1 };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 60);
    setIconResults(scored);
    // Live preview: instantly show the top result in the icon box
    if (scored.length > 0) {
      setOverData(d => {
        if (preSearchIcon.current === null) preSearchIcon.current = d.custom_icon;
        return {...d, custom_icon: scored[0].url};
      });
    }
  }, []);

  const saveOverride = async () => {
    if (!activeApp) return;
    try {
      // Build patch payload — only include image if it changed
      const patch = {
        category: overData.category,
        custom_icon: overData.custom_icon,
        version_source_url: overData.version_source_url,
        notes: overData.notes,
        install_path: overData.install_path,
        container_id: overData.container_id,
        app_url: overData.app_url,
        host_id: overData.host_id || null,
        service_name: overData.service_name,
        auto_update: overData.auto_update,
      };
      if (overData.image.trim() && overData.image.trim() !== activeApp.image) patch.image = overData.image.trim();
      if (overData.name.trim() && overData.name.trim() !== activeApp.name) patch.name = overData.name.trim();

      let u = await auth.api(`/apps/${activeApp.id}`,{method:"PATCH",body:JSON.stringify(patch)});
      if (pendingIcon) {
        const wi = await auth.api(`/apps/${activeApp.id}/icon`,{method:"POST",body:JSON.stringify({data_uri:pendingIcon})});
        if (wi) u = wi;
      }
      setApps(p => p.map(a => a.id===activeApp.id ? u : a)); setModal(null); toast("Saved!");
      // Always re-check immediately after saving so the card reflects the latest state
      // without the user having to wait for the next scheduled run.
      try {
        const checked = await auth.api(`/apps/${u.id}/check`, {method:"POST"});
        setApps(p => p.map(a => a.id===u.id ? checked : a));
      } catch(_) {}
    } catch { toast("Failed","error"); }
  };

  const handleIconFile = e => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPendingIcon(ev.target.result);
    reader.readAsDataURL(file); e.target.value = "";
  };

  const clearAppIcon = async app => {
    try {
      const u = await auth.api(`/apps/${app.id}/icon`,{method:"POST",body:JSON.stringify({data_uri:""})});
      setApps(p => p.map(a => a.id===app.id ? u : a)); toast("Icon cleared");
    } catch { toast("Failed","error"); }
  };

  const updatePolicy = async (app, policy) => {
    try {
      const u = await auth.api(`/apps/${app.id}`,{method:"PATCH",body:JSON.stringify({notify_policy:policy})});
      setApps(p => p.map(a => a.id===app.id ? u : a));
    } catch { toast("Failed","error"); }
  };

  const snoozeApp = async (app, days) => {
    try {
      const u = await auth.api(`/apps/${app.id}/snooze`,{method:"POST",body:JSON.stringify({days})});
      setApps(p => p.map(a => a.id===app.id ? u : a)); toast(`Snoozed ${days}d`);
    } catch { toast("Failed","error"); }
  };
  const clearSnooze = async app => {
    try { const u=await auth.api(`/apps/${app.id}/snooze`,{method:"DELETE"}); setApps(p=>p.map(a=>a.id===app.id?u:a)); }
    catch { toast("Failed","error"); }
  };
  const ignoreVersion = async app => {
    try { const u=await auth.api(`/apps/${app.id}/ignore`,{method:"POST",body:JSON.stringify({version:app.latest_version})}); setApps(p=>p.map(a=>a.id===app.id?u:a)); toast("Ignored"); }
    catch { toast("Failed","error"); }
  };
  const openHistory = async app => {
    setModal("history"); setActiveApp(app);
    try { setHistory(await auth.api(`/apps/${app.id}/history`)); } catch { setHistory([]); }
  };
  const triggerUpdate = async (app) => {
    // If auto_update is "ask", confirm before proceeding
    if (app.auto_update === "ask" || app.auto_update === "off") {
      const confirmed = window.confirm(
        `Update ${app.name}?\n\n${app.version} → ${app.latest_version}\n\nThis will update the compose file on the remote host and restart the service.`
      );
      if (!confirmed) return;
    }
    setUpdatingApp(app.id);
    setUpdateError(null);
    try {
      const r = await auth.api(`/apps/${app.id}/update`, {method:"POST"});
      setApps(p=>p.map(a=>a.id===app.id?r.app:a));
      toast(`${app.name} updated to ${r.to}`);
    } catch(e) {
      const msg = e.message || "Update failed";
      toast(msg, "error");
      // Store structured error for troubleshoot dialog
      setUpdateError({ app, message: msg });
    }
    setUpdatingApp(null);
  };

  const removeApp = async id => {
    try { await auth.api(`/apps/${id}`,{method:"DELETE"}); setApps(p=>p.filter(a=>a.id!==id)); toast("Removed","info"); }
    catch { toast("Failed","error"); }
  };
  const checkAll = async () => {
    setCheckingAll(true);
    try {
      // Record the moment we trigger — we'll wait until last_run_finished_at is AFTER this
      const clickedAt = new Date().toISOString();
      await auth.api("/check", {method:"POST"});
      // Poll every 3s, up to 90s. Done when backend reports a finished time after our click.
      // Falls back gracefully if backend doesn't support last_run_finished_at (old deploy).
      const deadline = Date.now() + 90000;
      let done = false;
      let polls = 0;
      while (!done && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3000));
        polls++;
        try {
          const h = await auth.api("/health");
          setScheduler(h.scheduler);
          const fin = h.scheduler?.last_run_finished_at;
          // Done if finished timestamp exists and is newer than when we clicked
          if (fin && fin > clickedAt) { done = true; break; }
          // Also done if last_run_at changed AND we've polled enough times (fallback)
          if (polls >= 3 && h.scheduler?.last_run_at && h.scheduler.last_run_at > clickedAt) {
            // Wait one more cycle to let the run actually finish
            await new Promise(r => setTimeout(r, 5000));
            done = true; break;
          }
        } catch(_) {}
      }
      await loadApps();
      toast(done ? "Check complete!" : "Check timed out — reloaded.");
    } catch { toast("Failed","error"); } finally { setCheckingAll(false); }
  };

  const outdated = apps.filter(a=>a.status==="outdated").length;

  // ── Theme ─────────────────────────────────────────────────────────────────
  const C = theme.C;
  const css = theme.css;

  // ── Auth screens ──────────────────────────────────────────────────────────
  if (auth.authState==="loading") return (
    <><style>{css}</style>
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#08080f"}}>
      <span className="spin" style={{fontSize:32,color:theme.appAccent}}>↻</span>
    </div></>
  );
  if (auth.authState==="login")     return <><style>{css}</style><LoginScreen onLogin={auth.handleLogin} appName={theme.appName} appLogo={theme.appLogo} appAccent={theme.appAccent} C={theme.C}/></>;
  if (auth.authState==="change_pw") return <><style>{css}</style><ChangePasswordScreen onDone={auth.handlePwChanged} appName={theme.appName} appLogo={theme.appLogo} appAccent={theme.appAccent} C={theme.C}/></>;


  const schedOk = schedulerStatus?.running && schedulerStatus?.last_run_ok!==false;

  return (
    <><style>{css}</style>
    <input ref={iconFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleIconFile}/>
    <input ref={logoFileRef} type="file" accept="image/*" style={{display:"none"}}
      onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>settingsHook.setSettings(s=>({...s,app_logo:ev.target.result}));r.readAsDataURL(f);e.target.value="";}}/>

    {/* ── Topbar ── */}
    <div className="topbar">
      <div className="logo">
        {theme.appLogo
          ? <img src={theme.appLogo} className="logo-img" alt="logo"/>
          : <div style={{color:C.accent}}><LogoSVG size={84}/></div>}
        <span className="logo-text">{theme.appName}</span>
      </div>
      <input className="search" placeholder="Search apps…" value={search}
        onChange={e=>setSearch(e.target.value)} aria-label="Search apps"/>
      <div className="tr">
        {/* ── 1. Check for updates ── */}
        <button className="btn-check-updates"
          onClick={checkAll} disabled={checkingAll}
          aria-label="Check all apps for updates"
          title={schedulerStatus ? `Last: ${schedulerStatus.last_run_at||"never"} · Next: ${schedulerStatus.next_run_at||"?"}` : "Scheduler status unknown"}>
          <span className={checkingAll?"spin":""} style={{display:"inline-flex",flexShrink:0}}>
            <Icon name="refresh" size={14} color="currentColor"/>
          </span>
          {checkingAll ? "Checking…" : "Check Updates"}
        </button>

        {/* ── Divider ── */}
        <div style={{width:1,height:22,background:C.border,flexShrink:0,margin:"0 2px"}}/>

        {/* ── 2–4. Import / Export ── */}
        <button className="btn btn-g btn-sm" onClick={()=>{setModal("import");setImportResult(null);setComposeText("");}}
          title="Bulk-import services from a docker-compose.yml"><Icon name="upload" size={13}/> Import YML</button>
        <button className="btn btn-g btn-sm" onClick={exportApps}
          title="Export all apps as JSON backup"><Icon name="download" size={13}/> Export</button>
        <button className="btn btn-g btn-sm" onClick={()=>setModal("import-json")}
          title="Restore apps from a Vigil JSON backup"><Icon name="upload" size={13}/> Import JSON</button>

        {/* ── Divider ── */}
        <div style={{width:1,height:22,background:C.border,flexShrink:0,margin:"0 2px"}}/>

        {/* ── 5–6. View toggle ── */}
        <div className="vg" style={{gap:2}}>
          <button className={`ic-btn${theme.viewMode==="grid"?" on":""}`} onClick={()=>theme.changeViewMode("grid")} title="Grid view" aria-label="Grid view">⊞</button>
          <button className={`ic-btn${theme.viewMode==="compact"?" on":""}`} onClick={()=>theme.changeViewMode("compact")} title="Compact table" aria-label="Compact table view">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="0" y="1" width="14" height="2" rx="1"/>
              <rect x="0" y="5" width="14" height="2" rx="1"/>
              <rect x="0" y="9" width="14" height="2" rx="1"/>
              <rect x="0" y="13" width="8" height="1.5" rx=".75"/>
            </svg>
          </button>
        </div>

        {/* ── Divider ── */}
        <div style={{width:1,height:22,background:C.border,flexShrink:0,margin:"0 2px"}}/>

        {/* ── 7. Dark/light toggle ── */}
        <button className="ic-btn" onClick={theme.toggleDark}
          title={theme.darkMode?"Light mode":"Dark mode"}
          aria-label={theme.darkMode?"Switch to light mode":"Switch to dark mode"}>
          {theme.darkMode
            ? <Icon name="sun" size={16}/>
            : <Icon name="moon" size={16}/>
          }
        </button>

        {/* ── 8. Settings ── */}
        <button className="ic-btn"
          onClick={()=>{setModal("settings");settingsHook.setSettingsTab("notifications");}}
          title="Settings" aria-label="Open settings">
          <Icon name="settings" size={16}/>
        </button>

        {/* ── 9. Logout ── */}
        <button className="ic-btn" onClick={auth.handleLogout}
          title={`Sign out (${auth.currentUser?.username})`}
          aria-label="Sign out"
          style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"7px 10px"}}>
          <LogoutIcon size={16}/>
        </button>

        {/* ── Divider ── */}
        <div style={{width:1,height:22,background:C.border,flexShrink:0,margin:"0 2px"}}/>

        {/* ── 10. Add Application ── */}
        <button className="btn-add-app" onClick={()=>setModal("add")}
          title="Track a new Docker image" aria-label="Add new application">
          <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
            width:18,height:18,borderRadius:"50%",background:"#052E16",flexShrink:0}}>
            <Icon name="plus" size={11} color="#F7F3EE"/>
          </span>
          Add Application
        </button>
      </div>
    </div>
    <div className="main">
      {auth.currentUser?.must_change_pw && (
        <div className="warn-banner" role="alert" style={{display:"flex",alignItems:"center",gap:8}}><Icon name="alertTriangle" size={15} style={{flexShrink:0}}/> You're using the default password. Change it in <strong>Settings → Security</strong>.</div>
      )}

      {/* Stats */}
      <div className="stats">
        {[
          {l:"Total",      v:apps.length,                                       c:C.accent,                              f:"all"         },
          {l:"Outdated",   v:outdated,                                          c:C.statusMap.outdated.fg,               f:"outdated"    },
          {l:"Up to Date", v:apps.filter(a=>a.status==="up-to-date").length,    c:C.statusMap["up-to-date"].fg,          f:"up-to-date"  },
          {l:"Unknown",    v:apps.filter(a=>a.status==="unknown").length,        c:C.statusMap.unknown.fg,                f:"unknown"     },
          {l:"Errors",     v:apps.filter(a=>a.status==="error").length,         c:C.statusMap.error.fg,                  f:"error"       },
        ].map(s=>(
          <div className="sc" key={s.l}
            onClick={()=>setFilterStatus(s.f)}
            title={`Filter by ${s.l}`}
            style={{cursor:"pointer",outline:filterStatus===s.f?`2px solid ${s.c}`:"none",outlineOffset:2}}>
            <div className="sv" style={{color:s.c}}>{s.v}</div>
            <div className="sl">{s.l}</div>
          </div>
        ))}
      </div>

      {/* ── Filters bar ────────────────────────────────────────────────── */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>

        {/* ── Left: Status filter pills ── */}
        <div style={{display:"flex",alignItems:"center",gap:4,flex:"0 0 auto",flexWrap:"wrap"}}>
          {[
            {s:"all",       label:"All"},
            {s:"outdated",  label:"Outdated"},
            {s:"up-to-date",label:"OK"},
            {s:"error",     label:"Error"},
            {s:"unknown",   label:"Unknown"},
          ].map(({s,label})=>(
            <button key={s}
              onClick={()=>setFilterStatus(s)}
              style={{
                padding:"5px 13px",borderRadius:999,fontFamily:"'Syne'",fontWeight:700,
                fontSize:11,cursor:"pointer",border:"1px solid",transition:"all .15s",
                textTransform:"uppercase",letterSpacing:".4px",
                ...(filterStatus===s
                  ? {background:C.accent,borderColor:C.accent,color:"#fff"}
                  : {background:"transparent",borderColor:C.border,color:C.muted}),
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Spacer ── */}
        <div style={{flex:1}}/>

        {/* ── Right: Category dropdown ── */}
        <div style={{display:"flex",alignItems:"center",gap:8,flex:"0 0 auto"}}>
          <div className="cat-selector" ref={catDropRef} style={{display:"inline-block"}}>
            <button
              className={`cat-selector-btn${catDropdown?" open":""}${filterCat!=="all"?" active":""}`}
              style={filterCat!=="all"?{"--cat-color":getCatColor(filterCat)}:{}}
              onClick={()=>{setCatDropdown(d=>!d);setCatSearch("");}}>
              {filterCat==="all"
                ? "All categories"
                : <><span style={{width:7,height:7,borderRadius:"50%",background:getCatColor(filterCat),display:"inline-block",flexShrink:0,marginRight:4}}/>{getCatLabel(filterCat)}</>}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
                style={{transform:catDropdown?"rotate(180deg)":"none",transition:"transform .15s",marginLeft:4}}>
                <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>

            {catDropdown && (()=>{
              const btnEl = catDropRef.current?.querySelector(".cat-selector-btn");
              const rect  = btnEl?.getBoundingClientRect() || {left:0,bottom:0};
              const allCats = [
                ...categories,
                ...(apps.some(a=>!a.category||a.category==="uncategorized")
                  ? [{key:"uncategorized",label:"Uncategorized",color:"#6b6b8a",keywords:""}] : [])
              ];
              const q = catSearch.toLowerCase();
              const shown = q ? allCats.filter(c=>c.label.toLowerCase().includes(q)||c.key.toLowerCase().includes(q)) : allCats;
              return (
                <div className="cat-panel"
                  style={{top:rect.bottom+window.scrollY+6,left:rect.left+window.scrollX}}>
                  {allCats.length>5 && (
                    <input className="cat-panel-search" placeholder="Search categories…"
                      autoFocus value={catSearch} onChange={e=>setCatSearch(e.target.value)}
                      onClick={e=>e.stopPropagation()}/>
                  )}
                  <div className="cat-panel-scroll">
                    <div className={`cat-row${filterCat==="all"?" sel":""}`}
                      onClick={()=>{setFilterCat("all");setCatDropdown(false);setCatSearch("");}}>
                      <span className="cat-row-dot" style={{background:C.muted,opacity:.4}}/>
                      All categories
                    </div>
                    {shown.map(cat=>{
                      const count=apps.filter(a=>a.category===cat.key).length;
                      return (
                        <div key={cat.key}
                          className={`cat-row${filterCat===cat.key?" sel":""}`}
                          onContextMenu={e=>{e.preventDefault();if(cat.key!=="uncategorized"){setCatPopover(cat);setCatPopoverAnchor(cat.key);}setCatDropdown(false);}}
                          onClick={()=>{setFilterCat(cat.key);setCatDropdown(false);setCatSearch("");}}>
                          <span className="cat-row-dot" style={{background:cat.color}}/>
                          {cat.label}
                          {count>0&&<span className="cat-row-count">{count}</span>}
                        </div>
                      );
                    })}
                    {shown.length===0&&<div style={{padding:"8px 10px",fontSize:11,color:C.muted}}>No categories found</div>}
                  </div>
                  <div className="cat-panel-footer">
                    <div className="cat-row" style={{color:C.accent}}
                      onClick={()=>{setCatPopover("new");setCatDropdown(false);}}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      Add category
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {filterCat!=="all" && (
            <button onClick={()=>setFilterCat("all")}
              style={{background:"transparent",border:"none",cursor:"pointer",padding:"2px 4px",
                color:C.muted,fontSize:12,lineHeight:1,borderRadius:4,display:"flex",alignItems:"center"}}
              title="Clear category filter"
              onMouseEnter={e=>e.currentTarget.style.color=C.text}
              onMouseLeave={e=>e.currentTarget.style.color=C.muted}>
              <Icon name="x" size={12}/>
            </button>
          )}
        </div>

        {/* ── Divider ── */}
        <div style={{width:1,height:20,background:C.border,flexShrink:0,margin:"0 2px"}}/>

        {/* ── Sort controls ── */}
        <div style={{display:"flex",gap:4,flex:"0 0 auto"}}>
          {[["custom","Custom"],["az","A → Z"],["za","Z → A"]].map(([m,l])=>(
            <button key={m} className={`sort-btn${sortMode===m?" on":""}`}
              title={m==="custom"?"Drag cards to arrange":`Sort ${l}`}
              onClick={()=>{setSortMode(m);localStorage.setItem("dt-sort",m);}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Category popover editors (edit/new) — rendered outside filters bar ── */}
      {catPopover&&catPopover!=="new"&&typeof catPopover==="object"&&(
        <CategoryPopover cat={catPopover} C={theme.C}
          onSave={(payload,id)=>saveCat(payload,id)}
          onDelete={deleteCat}
          onClose={()=>{setCatPopover(null);setCatPopoverAnchor(null);}}/>
      )}
      {catPopover==="new"&&(
        <CategoryPopover cat={null} C={theme.C}
          onSave={(payload)=>saveCat(payload,null)}
          onDelete={()=>{}}
          onClose={()=>setCatPopover(null)}/>
      )}

      {filtered.length===0 && !loading && (
        <div className="empty">
          <div className="ei"><Icon name="box" size={44} color="currentColor" style={{opacity:0.3}}/></div>
          <div className="et">No applications found</div>
          <p style={{marginBottom:22}}>Add a Docker image or import a docker-compose.yml to start tracking.</p>
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            <button className="btn btn-g" onClick={()=>{setModal("import");setImportResult(null);setComposeText("");}}><Icon name="upload" size={14} style={{marginRight:4}}/> Import YML</button>
            <button className="btn btn-g" onClick={()=>setModal("import-json")}><Icon name="upload" size={14} style={{marginRight:4}}/> Import JSON</button>
            <button className="btn btn-p" onClick={()=>setModal("add")}>+ Add App</button>
          </div>
        </div>
      )}

      {/* Grid */}
      {filtered.length>0 && theme.viewMode==="grid" && (
        <div className="grid">
          {filtered.map(app=>{
            const cc=getCatColor(app.category);
            const _st=(C.statusMap&&C.statusMap[app.status])||{fg:C.muted,bg:C.card,border:C.border};
            const sc=_st.fg;
            const isSnoozed=app.snoozed_until&&new Date(app.snoozed_until)>new Date();
            const isIgnored=app.ignored_version&&app.ignored_version===app.latest_version;
            return (
              <div key={app.id} className={`card ${app.status}`}
                draggable
                onDragStart={e=>handleDragStart(e,app.id)}
                onDragOver={e=>{e.preventDefault();e.currentTarget.classList.add("drag-over-card");handleDragOver(e,app.id);}}
                onDragLeave={e=>e.currentTarget.classList.remove("drag-over-card")}
                onDrop={e=>{e.currentTarget.classList.remove("drag-over-card");handleDrop();}}
                onDragEnd={()=>document.querySelectorAll(".drag-over-card").forEach(el=>el.classList.remove("drag-over-card"))}>
                <div className="ch">
                  <div className="drag-handle" title="Drag to reorder" aria-label="Drag to reorder" onMouseDown={e=>e.stopPropagation()}><Icon name="drag" size={14}/></div>
                  <AppIcon name={app.name} image={app.image||""} customIcon={app.custom_icon} iconData={app.icon_data}
                    catColor={cc} clickable onClick={()=>openOverride(app)}/>
                  <div className="ct">
                    <div className="cn">{app.name}</div>
                    <div className="ci"
                      onClick={e=>{e.stopPropagation();setQuickImageApp(app);setQuickImageVal((app.image||"")+(app.version?":"+app.version:""));}}
                      title="Click to edit image string"
                      style={{cursor:"pointer",transition:"color .15s"}}
                      onMouseEnter={e=>e.currentTarget.style.color=C.accent}
                      onMouseLeave={e=>e.currentTarget.style.color=""}>{app.image}{app.version?":"+app.version:""}</div>
                  </div>
                  <div className="sb" style={{background:_st.bg,color:_st.fg,border:`1px solid ${_st.border}`}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:sc,display:"inline-block"}}/>
                    {app.status==="up-to-date"?"OK":app.status==="pinned"?"pinned":app.status}
                  </div>
                </div>
                {app.status==="error"&&app.last_error&&<div className="err-msg">{app.last_error}</div>}
                <div className="cv">
                  <div className="vb"
                    onClick={()=>{setModal("edit");setActiveApp(app);setNewVersion(app.version);}}
                    title="Click to update version"
                    style={{cursor:"pointer",transition:"border-color .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent+"66"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=""}>
                    <div className="vl">Current</div>
                    <div className="vv">{app.version}</div>
                  </div>
                  <div className="vb" style={{...(app.status==="outdated"?{borderColor:(C.statusMap&&C.statusMap.outdated.border)||"#e05c5c44"}:app.status==="pinned"?{borderColor:`${C.border}`}:{}),cursor:app.latest_version?"pointer":"default",transition:"border-color .15s"}} title={app.status==="pinned"?"Tracking a floating tag — latest release shown for reference":app.latest_version?"Click to copy version":undefined}
                    onClick={()=>{ if(app.latest_version && app.latest_version!=="—") { copyText(app.latest_version); toast(`Copied ${app.latest_version}`); }}}
                    onMouseEnter={e=>{ if(app.latest_version) e.currentTarget.style.borderColor=C.accent+"66"; }}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=""}>
                    <div className="vl">Latest</div>
                    <div className="vv" style={{color:
                      app.status==="outdated"  ? (C.statusMap?.outdated?.fg  ||"#e05c5c") :
                      app.status==="up-to-date"? (C.statusMap?.["up-to-date"]?.fg||C.text) :
                      app.status==="error"     ? (C.statusMap?.error?.fg     ||"#e08c3c") :
                      app.status==="unknown"   ? (C.statusMap?.unknown?.fg   ||C.muted)  :
                      app.status==="pinned"    ? C.muted : C.text
                    }}>{app.latest_version||"—"}</div>
                  </div>
                </div>
                <div className="cf">
                  <div className="cf-tags">
                    <span className="tag" style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}40`}}>{getCatLabel(app.category)}</span>
                    {app.detection_channel&&<ChannelPill channel={app.detection_channel} url={resolveChannelUrl(app.detection_channel,app.image,app.version_source_url)}/>}
                    {isSnoozed&&<span className="snooze-badge" title="Snoozed">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        <line x1="9" y1="4" x2="15" y2="4"/><polyline points="9 1 9 4 15 4 15 1"/>
                      </svg>
                    </span>}
                    {isIgnored&&<span className="ignore-badge" title="Ignored">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    </span>}
                  </div>
                  <div className="cf-foot">
                    <span/>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      {app.host_id && app.status==="outdated" && (
                        <button onClick={()=>triggerUpdate(app)} disabled={updatingApp===app.id}
                          title="Update to latest version"
                          style={{background:"transparent",border:"none",cursor:"pointer",
                            padding:"4px 5px",display:"flex",alignItems:"center",borderRadius:6,
                            color:"#1D9E75",transition:"color .15s,background .15s",
                            opacity:updatingApp===app.id?0.5:1}}
                          onMouseEnter={e=>{e.currentTarget.style.color=(C.statusMap&&C.statusMap["up-to-date"].fg)||"#22C55E";e.currentTarget.style.background="#1D9E7514";}}
                          onMouseLeave={e=>{e.currentTarget.style.color="#1D9E75";e.currentTarget.style.background="transparent";}}>
                          {updatingApp===app.id
                            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                          }
                        </button>
                      )}
                      <CardMenu key={app.id} app={app} categories={categories} C={theme.C} api={auth.api} setApps={setApps} setModal={setModal} setSettingsTab={settingsHook.setSettingsTab} setActiveApp={setActiveApp} setUpdateLogs={setUpdateLogs} setLogModal={setLogModal} setQuickPathApp={setQuickPathApp} setQuickPathVal={setQuickPathVal} openOverride={openOverride} openHistory={openHistory} snoozeApp={snoozeApp} clearSnooze={clearSnooze} ignoreVersion={ignoreVersion} removeApp={removeApp}/>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Compact table view ─────────────────────────────────────────── */}
      {filteredCompact.length>0 && theme.viewMode==="compact" && (
        <div className="ct-wrap" ref={colWrapRef}>
          {(()=>{
            const gtc = buildGTC(colPct);
            // Divider rendered between adjacent column headers
            const Divider = ({idx}) => (
              <div
                onMouseDown={makeBoundaryHandler(idx)}
                style={{
                  position:"absolute",right:-3,top:0,bottom:0,
                  width:6,cursor:"col-resize",zIndex:10,
                  display:"flex",alignItems:"center",justifyContent:"center",
                }}
                title="Drag to resize">
                <div style={{
                  width:2,height:"60%",borderRadius:1,
                  background:C.border,opacity:.35,
                  transition:"opacity .12s, background .12s",
                }}
                onMouseEnter={e=>{e.currentTarget.style.opacity=".85";e.currentTarget.style.background=C.accent;}}
                onMouseLeave={e=>{e.currentTarget.style.opacity=".35";e.currentTarget.style.background=C.border;}}
                />
              </div>
            );

            return (
              <>
                {/* ── Header ── */}
                <div style={{
                  display:"grid",gridTemplateColumns:gtc,
                  borderBottom:`1px solid ${C.border}`,background:C.card,
                  borderRadius:"14px 14px 0 0",height:44,alignItems:"center",
                }}>
                  {/* drag col header — no divider */}
                  <div style={{width:28,flexShrink:0}}/>

                  {/* Application */}
                  <div className="ct-th ct-th-app" style={{
                    display:"flex",alignItems:"center",position:"relative",
                    paddingLeft:8,userSelect:"none",
                  }}>
                    <span>Application</span>
                    <Divider idx={0}/>
                  </div>

                  {/* Category */}
                  <div className="ct-th ct-th-cat" style={{
                    display:"flex",alignItems:"center",justifyContent:"center",
                    position:"relative",userSelect:"none",
                  }}>
                    <span>Category</span>
                    <Divider idx={1}/>
                  </div>

                  {/* Current */}
                  <div className="ct-th ct-th-ver" style={{
                    display:"flex",alignItems:"center",justifyContent:"flex-end",
                    position:"relative",paddingRight:14,userSelect:"none",
                  }}>
                    <span>Current</span>
                    <Divider idx={2}/>
                  </div>

                  {/* Latest */}
                  <div className="ct-th ct-th-ver" style={{
                    display:"flex",alignItems:"center",justifyContent:"flex-end",
                    position:"relative",paddingRight:14,userSelect:"none",
                  }}>
                    <span>Latest</span>
                    <Divider idx={3}/>
                  </div>

                  {/* Status */}
                  <div className="ct-th ct-th-status" style={{
                    display:"flex",alignItems:"center",justifyContent:"center",
                    position:"relative",userSelect:"none",
                  }}>
                    <span>Status</span>
                    <Divider idx={4}/>
                  </div>

                  {/* Actions — with Reset + Auto buttons */}
                  <div className="ct-th ct-th-actions" style={{
                    display:"flex",alignItems:"center",justifyContent:"flex-end",
                    gap:4,paddingRight:10,userSelect:"none",
                  }}>
                    <button onClick={autoFitCols}
                      title="Auto-adjust column widths"
                      style={{background:"transparent",border:"none",cursor:"pointer",
                        fontSize:9,color:C.muted,padding:"1px 5px",borderRadius:4,
                        transition:"color .12s",whiteSpace:"nowrap",fontFamily:"'Syne'"}}
                      onMouseEnter={e=>e.currentTarget.style.color=C.accent}
                      onMouseLeave={e=>e.currentTarget.style.color=C.muted}>
                      Auto
                    </button>
                    <button onClick={resetColPct}
                      title="Reset column widths to default"
                      style={{background:"transparent",border:"none",cursor:"pointer",
                        fontSize:9,color:C.muted,padding:"1px 5px",borderRadius:4,
                        transition:"color .12s",whiteSpace:"nowrap",fontFamily:"'Syne'"}}
                      onMouseEnter={e=>e.currentTarget.style.color=C.accent}
                      onMouseLeave={e=>e.currentTarget.style.color=C.muted}>
                      Reset
                    </button>
                    <span>Actions</span>
                  </div>
                </div>

                {/* ── Rows ── */}
                {filteredCompact.map(app=>{
                  const cc         = getCatColor(app.category);
                  const st         = (C.statusMap && C.statusMap[app.status]) || {fg:C.muted,bg:C.card,border:C.border};
                  const isOut      = app.status==="outdated";
                  const isOK       = app.status==="up-to-date";
                  const isPinned   = app.status==="pinned";
                  const latestColor = isOut ? (C.statusMap&&C.statusMap.outdated.fg)||"#e05c5c" : isOK ? (C.statusMap&&C.statusMap["up-to-date"].fg)||"#22C55E" : isPinned ? C.muted : app.status==="unknown" ? (C.statusMap&&C.statusMap.unknown.fg)||C.muted : C.text;
                  return (
                    <div key={app.id}
                      role="row"
                      tabIndex={0}
                      aria-label={`${app.name}, ${STATUS_LABEL[app.status]||app.status}`}
                      className={`ct-tr${isOut?" outdated":""}`}
                      style={{
                        display:"grid",gridTemplateColumns:gtc,
                        boxShadow:isOut?"inset 3px 0 0 #e05c5c":"none",
                        minHeight:56,alignItems:"center",
                        borderBottom:`1px solid ${C.border}`,
                      }}>

                      {/* drag */}
                      <div style={{width:28,flexShrink:0,display:"flex",alignItems:"center",
                        justifyContent:"center",opacity:.3}}>
                        <Icon name="drag" size={13}/>
                      </div>

                      {/* App */}
                      <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0,
                        padding:"0 8px 0 8px",overflow:"hidden"}}>
                        <div style={{flexShrink:0}}>
                          <AppIcon name={app.name} image={app.image||""} customIcon={app.custom_icon} iconData={app.icon_data}
                            catColor={cc} size={28} clickable onClick={()=>openOverride(app)}/>
                        </div>
                        <div style={{minWidth:0,flex:1,overflow:"hidden"}}>
                          <div className="ct-name">{app.name}</div>
                          <div className="ct-img">{app.image}</div>
                        </div>
                      </div>

                      {/* Category */}
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",
                        padding:"0 6px",overflow:"hidden"}}>
                        <span style={{display:"inline-block",maxWidth:"100%",
                          fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:5,
                          background:C.hover,color:C.muted,border:`1px solid ${C.border}`,
                          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                          {getCatLabel(app.category)}
                        </span>
                      </div>

                      {/* Current */}
                      <div style={{textAlign:"right",padding:"0 14px 0 4px",
                        fontFamily:"'Space Mono',monospace",fontSize:12,fontVariantNumeric:"tabular-nums",
                        color:C.muted,cursor:"pointer",whiteSpace:"nowrap",transition:"color .15s",
                        overflow:"hidden"}}
                        onClick={()=>{setModal("edit");setActiveApp(app);setNewVersion(app.version);}}
                        title="Click to edit version"
                        onMouseEnter={e=>e.currentTarget.style.color=C.accent}
                        onMouseLeave={e=>e.currentTarget.style.color=C.muted}>
                        {app.version||"—"}
                      </div>

                      {/* Latest */}
                      <div style={{textAlign:"right",padding:"0 14px 0 4px",
                        fontFamily:"'Space Mono',monospace",fontSize:12,fontVariantNumeric:"tabular-nums",
                        fontWeight:isOut?700:400,color:latestColor,
                        cursor:app.latest_version?"pointer":"default",
                        whiteSpace:"nowrap",overflow:"hidden",transition:"opacity .15s"}}
                        title={app.latest_version?"Click to copy":"No version data"}
                        onClick={()=>{if(app.latest_version){copyText(app.latest_version);toast(`Copied ${app.latest_version}`);}}}
                        onMouseEnter={e=>{if(app.latest_version)e.currentTarget.style.opacity=".65";}}
                        onMouseLeave={e=>e.currentTarget.style.opacity=""}>
                        {app.latest_version||"—"}
                      </div>

                      {/* Status */}
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",
                        padding:"0 6px",overflow:"hidden"}}>
                        <span style={{display:"inline-flex",alignItems:"center",gap:4,flexShrink:0,
                          fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",
                          padding:"2px 8px",borderRadius:999,whiteSpace:"nowrap",
                          background:st.bg,color:st.fg,border:`1px solid ${st.border}`}}>
                          <span style={{width:5,height:5,borderRadius:"50%",background:st.fg,flexShrink:0}}/>
                          {STATUS_LABEL[app.status]||app.status}
                        </span>
                      </div>

                      {/* Actions */}
                      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",
                        gap:1,paddingRight:8,overflow:"visible",flexShrink:0}}>

                        <button className={`ic-action${app.host_id&&isOut?" deploy":""}`}
                          title={app.host_id&&isOut?`Deploy update for ${app.name}`:"No update available"}
                          disabled={!app.host_id||!isOut||updatingApp===app.id}
                          style={{opacity:(!app.host_id||!isOut)?0.25:updatingApp===app.id?0.5:1}}
                          onClick={()=>{if(app.host_id&&isOut)triggerUpdate(app);}}>
                          <Icon name="cloudUp" size={13}/>
                        </button>

                        <button className="ic-action"
                          title={`Check ${app.name} now`}
                          onClick={async()=>{try{const u=await auth.api(`/apps/${app.id}/check`,{method:"POST"});setApps(p=>p.map(a=>a.id===app.id?u:a));}catch{toast("Check failed","error");}}}>
                          <Icon name="refresh" size={13}/>
                        </button>

                        {app.host_id && (
                          <button className="ic-action"
                            title="Update history"
                            onClick={async()=>{const logs=await auth.api(`/apps/${app.id}/logs`);setUpdateLogs(logs);setLogModal(app);}}>
                            <Icon name="history" size={13}/>
                          </button>
                        )}

                        <CardMenu key={`bell-${app.id}`} app={app} categories={categories} C={theme.C} api={auth.api}
                          setApps={setApps} setModal={setModal} setSettingsTab={settingsHook.setSettingsTab}
                          setActiveApp={setActiveApp} setUpdateLogs={setUpdateLogs} setLogModal={setLogModal}
                          setQuickPathApp={setQuickPathApp} setQuickPathVal={setQuickPathVal}
                          openOverride={openOverride} openHistory={openHistory}
                          snoozeApp={snoozeApp} clearSnooze={clearSnooze} ignoreVersion={ignoreVersion} removeApp={removeApp}/>
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}
    </div>


    {/* ══ Modals ════════════════════════════════════════════════════════════ */}

    {/* Add */}
    <AddAppDialog
      open={modal==="add"} onClose={()=>{setModal(null);setImageInput("");setParsed(null);}} C={theme.C}
      imageInput={imageInput} handleInput={handleInput} parsed={parsed} addApp={addApp}
      getCatLabel={getCatLabel} getCatColor={getCatColor} autoCategory={autoCategory}
    />

    {/* Import docker-compose.yml */}
    <ImportDialog
      open={modal==="import"} onClose={()=>setModal(null)} C={theme.C}
      composeText={composeText} setComposeText={setComposeText} importResult={importResult} importCompose={importCompose}
    />

    {/* Import JSON backup */}
    <ImportAppsDialog
      open={modal==="import-json"} onClose={()=>setModal(null)} C={theme.C}
      api={auth.api} setApps={setApps} toast={toast}
    />

    {/* Edit version */}
    <UpdateDialog
      open={modal==="edit"} onClose={()=>setModal(null)}
      activeApp={activeApp} newVersion={newVersion} setNewVersion={setNewVersion} updateVersion={updateVersion}
    />

    {/* Customise */}
    <OverrideDialog
      open={modal==="override"} onClose={()=>setModal(null)} C={theme.C}
      activeApp={activeApp} overData={overData} setOverData={setOverData}
      pendingIcon={pendingIcon} setPendingIcon={setPendingIcon} iconSearch={iconSearch}
      iconFileRef={iconFileRef} clearAppIcon={clearAppIcon}
      showInstallPath={showInstallPath} setShowInstallPath={setShowInstallPath}
      categories={categories} hosts={hosts} getCatColor={getCatColor}
      saveOverride={saveOverride}
      onManageHosts={()=>{setModal("settings");settingsHook.setSettingsTab("agents");}}
    />

    {/* Quick image edit */}
    <QuickEditDialogs
      api={auth.api} setApps={setApps} toast={toast} C={theme.C}
      quickImageApp={quickImageApp} setQuickImageApp={setQuickImageApp}
      quickImageVal={quickImageVal} setQuickImageVal={setQuickImageVal}
      quickPathApp={quickPathApp} setQuickPathApp={setQuickPathApp}
      quickPathVal={quickPathVal} setQuickPathVal={setQuickPathVal}
    />

    {/* History */}
    <HistoryDialog open={modal==="history"} onClose={()=>setModal(null)} activeApp={activeApp} history={history} C={theme.C}/>

    {/* Settings */}
    <SettingsDialog
      open={modal==="settings"} onClose={()=>setModal(null)} C={theme.C} api={auth.api} toast={toast}
      settingsTab={settingsHook.settingsTab} setSettingsTab={settingsHook.setSettingsTab}
      settings={settingsHook.settings} setSettings={settingsHook.setSettings} saveSettings={async () => {
        const branding = await settingsHook.saveSettings();
        if (branding) {
          theme.setAppName(branding.appName);
          theme.setAppLogo(branding.strippedLogo);
          theme.setAppAccent(branding.appAccent);
        }
        setModal(null);
      }}
      schedulerStatus={schedulerStatus}

      showChatId={settingsHook.showChatId} setShowChatId={settingsHook.setShowChatId}
      tgTesting={settingsHook.tgTesting} setTgTesting={settingsHook.setTgTesting} tgTestMsg={settingsHook.tgTestMsg} setTgTestMsg={settingsHook.setTgTestMsg}
      telegramSet={settingsHook.telegramSet} clearTelegram={settingsHook.clearTelegram}

      logoFileRef={logoFileRef} setAppAccent={theme.setAppAccent} changePreset={theme.changePreset} toggleDark={theme.toggleDark}

      currentUser={auth.currentUser} setCurrentUser={auth.setCurrentUser}
      cuForm={auth.cuForm} setCuForm={auth.setCuForm} cuError={auth.cuError} submitChangeUsername={auth.submitChangeUsername}
      cpForm={auth.cpForm} setCpForm={auth.setCpForm} cpError={auth.cpError} submitChangePw={auth.submitChangePw}

      regenPw={auth.regenPw} setRegenPw={auth.setRegenPw}
      totpError={auth.totpError} setTotpError={auth.setTotpError}
      totpDisablePw={auth.totpDisablePw} setTotpDisablePw={auth.setTotpDisablePw}
      totpLoading={auth.totpLoading} setTotpLoading={auth.setTotpLoading}
      totpSetup={auth.totpSetup} setTotpSetup={auth.setTotpSetup}
      totpConfirmCode={auth.totpConfirmCode} setTotpConfirmCode={auth.setTotpConfirmCode}
      backupCodes={auth.backupCodes} setBackupCodes={auth.setBackupCodes}

      hosts={hosts} setHosts={setHosts} caReady={caReady}
      hostTesting={hostTesting} setHostTesting={setHostTesting} hostTestMsg={hostTestMsg} setHostTestMsg={setHostTestMsg}
      setActiveHost={setActiveHost} setHostForm={setHostForm} setHostWizardStep={setHostWizardStep} setNewToken={setNewToken} setHostModal={setHostModal}
      setInstallToken={setInstallToken} setDecKey={setDecKey} setTokenExpiry={setTokenExpiry} setIsPublicIp={setIsPublicIp}
    />

    {notif && (
      <div className="toast">
        <span style={{color:notif.type==="error"?"#e05c5c":notif.type==="info"?C.accent:(C.statusMap&&C.statusMap["up-to-date"].fg)||"#22C55E"}}>
          {notif.type==="error" ? <Icon name="x" size={14}/> : notif.type==="info" ? <Icon name="info" size={14}/> : <Icon name="check" size={14}/>}
        </span>
        {notif.msg}
      </div>
    )}

    {/* ══ Update log modal ══════════════════════════════════════════════════ */}
    <UpdateLogDialog
      C={theme.C} api={auth.api} toast={toast} setApps={setApps}
      logModal={logModal} setLogModal={setLogModal}
      updateLogs={updateLogs} setUpdateLogs={setUpdateLogs}
      revertModal={revertModal} setRevertModal={setRevertModal}
    />

    {/* ══ Add host wizard modal ═════════════════════════════════════════════ */}
    <HostWizard
      hostModal={hostModal} onClose={()=>setHostModal(null)}
      api={auth.api} toast={toast} setHosts={setHosts} C={theme.C}
      hostWizardStep={hostWizardStep} setHostWizardStep={setHostWizardStep}
      hostForm={hostForm} setHostForm={setHostForm}
      activeHost={activeHost} setActiveHost={setActiveHost}
      newToken={newToken} setNewToken={setNewToken}
      installToken={installToken} setInstallToken={setInstallToken}
      decKey={decKey} setDecKey={setDecKey}
      tokenExpiry={tokenExpiry} setTokenExpiry={setTokenExpiry}
      isPublicIp={isPublicIp} setIsPublicIp={setIsPublicIp}
      copiedCurl={copiedCurl} setCopiedCurl={setCopiedCurl}
      copiedToken={copiedToken} setCopiedToken={setCopiedToken}
      copiedInstall={copiedInstall} setCopiedInstall={setCopiedInstall}
      copiedDecKey={copiedDecKey} setCopiedDecKey={setCopiedDecKey}
      timerTick={timerTick}
      userFingerprint={userFingerprint} setUserFingerprint={setUserFingerprint}
      fpCompared={fpCompared} setFpCompared={setFpCompared}
      fpMatch={fpMatch} setFpMatch={setFpMatch}
    />

    {/* ── Update Error Dialog ──────────────────────────────────────────────── */}
    {updateError && (()=>{
      const errMsg  = updateError.message || "Update failed";
      const agentIp   = updateError.app?.host_ip   || "AGENT_IP";
      const agentPort = updateError.app?.host_port  || "7777";
      const composePath = updateError.app?.install_path
        ? `${updateError.app.install_path}/docker-compose.yml`
        : "/path/to/docker-compose.yml";

      const CopyBtn = ({text}) => (
        <button
          onClick={()=>{ copyText(text); toast("Copied","info"); }}
          style={{
            background:"transparent",border:"none",cursor:"pointer",
            padding:"2px 6px",fontSize:9,color:C.muted,borderRadius:4,
            transition:"color .12s",flexShrink:0,fontFamily:"'Syne'",
          }}
          onMouseEnter={e=>e.currentTarget.style.color=C.accent}
          onMouseLeave={e=>e.currentTarget.style.color=C.muted}
          title="Copy">
          copy
        </button>
      );

      const Cmd = ({cmd}) => (
        <div style={{position:"relative",marginTop:6}}>
          <pre style={{
            background:C.input,border:`1px solid ${C.border}`,borderRadius:6,
            padding:"7px 40px 7px 10px",margin:0,
            fontFamily:"'Space Mono',monospace",fontSize:11,color:C.text,
            overflowX:"auto",whiteSpace:"pre",lineHeight:1.55,
          }}>{cmd}</pre>
          <div style={{position:"absolute",top:3,right:3}}>
            <CopyBtn text={cmd}/>
          </div>
        </div>
      );

      const Step = ({n, title, cmd, expected, ifFailed}) => (
        <details style={{background:C.card,border:`1px solid ${C.border}`,
          borderRadius:9,overflow:"hidden",marginBottom:8}}
          open={n===1}>
          <summary style={{
            display:"flex",alignItems:"center",gap:8,padding:"10px 14px",
            cursor:"pointer",listStyle:"none",userSelect:"none",
          }}>
            <span style={{
              width:18,height:18,borderRadius:"50%",background:C.hover,
              border:`1px solid ${C.border}`,display:"inline-flex",alignItems:"center",
              justifyContent:"center",fontSize:10,fontWeight:700,color:C.muted,flexShrink:0,
            }}>{n}</span>
            <span style={{fontSize:13,fontWeight:600,color:C.text}}>{title}</span>
          </summary>
          <div style={{padding:"0 14px 12px 14px"}}>
            <Cmd cmd={cmd}/>
            {expected && (
              <div style={{fontSize:11,color:(C.statusMap&&C.statusMap["up-to-date"].fg)||"#22C55E",marginTop:6}}>
                <span style={{fontWeight:700}}>Expected: </span>{expected}
              </div>
            )}
            {ifFailed && (
              <div style={{marginTop:8,borderTop:`1px solid ${C.border}`,paddingTop:8}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",
                  letterSpacing:".5px",color:"#e05c5c",marginBottom:4}}>If failed:</div>
                <Cmd cmd={ifFailed}/>
              </div>
            )}
          </div>
        </details>
      );

      return (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setUpdateError(null)}>
          <div className="modal" style={{maxWidth:560,maxHeight:"88vh",overflowY:"auto"}}>
            {/* Close button */}
            <button className="modal-close" onClick={()=>setUpdateError(null)}
              title="Close" aria-label="Close">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
              </svg>
            </button>

            {/* Part 3: Error block — only the error text, no extra title */}
            <div style={{
              background:"#e05c5c0c",border:"1px solid #e05c5c33",
              borderRadius:9,padding:"12px 14px",marginBottom:20,marginTop:4,
            }}>
              <div style={{fontSize:13,color:"#e05c5c",lineHeight:1.6,wordBreak:"break-word"}}>
                {errMsg}
              </div>
            </div>

            {/* Part 4: Smart resolution steps */}
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",
              letterSpacing:".7px",color:C.muted,marginBottom:12}}>
              Resolution Steps
            </div>

            <Step n={1}
              title="Verify agent is running"
              cmd={`systemctl status vigil-agent`}
              expected="active (running)"
              ifFailed={`sudo systemctl restart vigil-agent

# If still failing, check logs:
journalctl -u vigil-agent -n 50`}
            />

            <Step n={2}
              title="Verify network connectivity"
              cmd={`ping -c 3 ${agentIp}
curl http://${agentIp}:${agentPort}/health`}
              expected="Replies received / HTTP 200"
              ifFailed={`# If ping fails:
#   → Verify IP address: ${agentIp}
#   → Check firewall rules on the remote host

# If curl fails:
#   → Verify agent port (default 7777)
#   → sudo systemctl restart vigil-agent`}
            />

            <Step n={3}
              title="Verify Docker permissions"
              cmd={`groups`}
              expected="docker appears in the groups list"
              ifFailed={`# If 'docker' is missing:
sudo usermod -aG docker vigil-agent
sudo systemctl restart vigil-agent

# If docker is in groups but docker ps fails:
docker ps
sudo systemctl restart docker`}
            />

            <Step n={4}
              title="Verify compose file access"
              cmd={`docker compose -f ${composePath} config`}
              expected="Configuration loads without errors"
              ifFailed={`# If file not found — check the install path is set correctly.
# In Vigil: edit the app card → install path.

# If permission denied:
ls -la ${composePath}
chown vigil-agent:vigil-agent ${composePath}`}
            />

            <Step n={5}
              title="Reset agent completely"
              cmd={`sudo systemctl stop vigil-agent
docker ps -aq | xargs -r docker stop
docker system prune -af
sudo systemctl restart docker
sudo systemctl start vigil-agent`}
              expected="Agent healthy after restart"
              ifFailed={`# If still failing, proceed to reinstall (Step 6).`}
            />

            <Step n={6}
              title="Reinstall agent"
              cmd={`# Remove existing agent
sudo systemctl stop vigil-agent
sudo rm -rf /opt/vigil-agent

# Reinstall using the token from Settings → Agents
# Then follow the installer prompts.

sudo systemctl start vigil-agent`}
              expected="Agent reconnects within 30 seconds"
              ifFailed={null}
            />

            <div style={{
              marginTop:10,padding:"9px 12px",borderRadius:7,
              background:"#e0c43c0c",border:"1px solid #e0c43c2a",
              fontSize:11,color:"#e0c43c",lineHeight:1.5,
            }}>
              Reinstalling the agent does not remove your application data. Vigil settings and tracked apps are stored on the Vigil server, not the agent.
            </div>

            <div className="ma" style={{marginTop:18}}>
              <button className="btn btn-secondary" onClick={()=>setUpdateError(null)}>Close</button>
              <button className="btn btn-primary"
                disabled={updatingApp===updateError.app.id}
                onClick={()=>{ setUpdateError(null); triggerUpdate(updateError.app); }}>
                {updatingApp===updateError.app.id ? "Retrying…" : "Retry update"}
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
