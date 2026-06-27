import { useState, useRef } from "react";

/**
 * ImportAppsDialog — JSON backup restore flow.
 *
 * Flow:
 *   1. User clicks "Import JSON" → file picker opens
 *   2. File is parsed → preview modal shows counts + app list
 *   3. User picks Merge or Replace-all and confirms
 *   4. Apps are POSTed to /api/apps/import-json (merge) or
 *      DELETEd-then-POSTed (replace).
 *   5. Toast success, dashboard reloads.
 *
 * The backend endpoint /api/apps/import-json accepts:
 *   { apps: [...], replace: boolean }
 * and returns:
 *   { created: N, updated: N, skipped: N }
 */
export default function ImportAppsDialog({ open, onClose, C, api, setApps, toast }) {
  const [phase, setPhase]         = useState("idle"); // idle | preview | importing
  const [parsed, setParsed]       = useState(null);   // { exported_at, apps[] }
  const [mode, setMode]           = useState("merge");// merge | replace
  const [error, setError]         = useState("");
  const fileRef = useRef(null);

  if (!open) return null;

  const reset = () => {
    setPhase("idle");
    setParsed(null);
    setMode("merge");
    setError("");
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Step 1: file selected ────────────────────────────────────────────────
  const handleFile = (e) => {
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".json")) {
      setError("Please select a .json file exported from Vigil.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data.apps) || data.apps.length === 0) {
          setError("File does not contain any apps. Is this a valid Vigil export?");
          return;
        }
        setParsed(data);
        setPhase("preview");
      } catch {
        setError("Could not parse JSON. Make sure the file is a valid Vigil export.");
      }
    };
    reader.readAsText(file);
    // reset so the same file can be re-selected
    e.target.value = "";
  };

  // ── Step 2: confirm import ───────────────────────────────────────────────
  const handleImport = async () => {
    if (!parsed) return;
    setPhase("importing");
    setError("");
    try {
      const result = await api("/apps/import-json", {
        method: "POST",
        body: JSON.stringify({ apps: parsed.apps, replace: mode === "replace" }),
      });
      const { created = 0, updated = 0, skipped = 0 } = result;
      // Refresh app list
      const fresh = await api("/apps");
      setApps(fresh);
      toast(
        `Imported ${parsed.apps.length} app${parsed.apps.length !== 1 ? "s" : ""} ` +
        `(${created} created, ${updated} updated, ${skipped} skipped)`,
        "success"
      );
      handleClose();
    } catch (err) {
      setError(err.message || "Import failed. Please try again.");
      setPhase("preview");
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="ov" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="mt">Import JSON Backup</div>
          <button className="modal-close" onClick={handleClose} title="Close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>
        </div>

        {phase === "idle" && (
          <>
            <p style={{fontSize:13,color:C.muted,marginBottom:18,lineHeight:1.65}}>
              Restore apps from a <strong style={{color:C.text}}>Vigil JSON export</strong>.
              The file must have been downloaded via the <em>Export</em> button.
            </p>
            {error && (
              <div style={{background:"#e05c5c18",border:"1px solid #e05c5c44",borderRadius:8,
                padding:"9px 12px",fontSize:13,color:"#e05c5c",marginBottom:14}}>{error}</div>
            )}
            <input ref={fileRef} type="file" accept=".json" style={{display:"none"}}
              onChange={handleFile}/>
            <div className="ma">
              <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
              <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                Choose File…
              </button>
            </div>
          </>
        )}

        {phase === "preview" && parsed && (
          <>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:9,
              padding:"12px 14px",marginBottom:16}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:6}}>
                Exported {parsed.exported_at ? new Date(parsed.exported_at).toLocaleString() : "—"}
              </div>
              <div style={{fontSize:22,fontWeight:800,color:C.text,marginBottom:2}}>
                {parsed.apps.length}
              </div>
              <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>
                app{parsed.apps.length !== 1 ? "s" : ""} in this file
              </div>
            </div>

            {/* Preview list — first 8 entries */}
            <div style={{maxHeight:160,overflowY:"auto",marginBottom:14,
              background:C.input,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px"}}>
              {parsed.apps.slice(0, 8).map((a, i) => (
                <div key={i} style={{fontSize:11,fontFamily:"'Space Mono',monospace",
                  color:C.muted,padding:"3px 0",borderBottom:i<Math.min(7,parsed.apps.length-1)?`1px solid ${C.border}`:"none"}}>
                  {a.image || a.name || "(unknown)"}
                </div>
              ))}
              {parsed.apps.length > 8 && (
                <div style={{fontSize:11,color:C.muted,padding:"3px 0",fontStyle:"italic"}}>
                  …and {parsed.apps.length - 8} more
                </div>
              )}
            </div>

            {/* Mode picker */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",
                letterSpacing:".8px",color:C.muted,marginBottom:8}}>Import mode</div>
              {[
                ["merge",   "Merge",       "Add new apps; skip ones already tracked (safe)"],
                ["replace", "Replace all", "Delete everything and restore from this file"],
              ].map(([val, label, desc]) => (
                <label key={val} style={{display:"flex",alignItems:"flex-start",gap:10,
                  padding:"8px 10px",borderRadius:7,cursor:"pointer",marginBottom:4,
                  background: mode === val ? `${C.accent}18` : "transparent",
                  border: `1px solid ${mode === val ? C.accent : C.border}`,
                  transition:"all .15s"}}>
                  <input type="radio" name="import-mode" value={val}
                    checked={mode === val} onChange={() => setMode(val)}
                    style={{marginTop:2,accentColor:C.accent}}/>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:C.text}}>{label}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:2}}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {mode === "replace" && (
              <div style={{background:"#e05c5c18",border:"1px solid #e05c5c44",borderRadius:8,
                padding:"9px 12px",fontSize:12,color:"#e05c5c",marginBottom:14,lineHeight:1.55}}>
                <strong style={{color:"#e05c5c"}}>Replace all</strong> will permanently delete all currently tracked apps
                before restoring. This cannot be undone.
              </div>
            )}

            {error && (
              <div style={{background:"#e05c5c18",border:"1px solid #e05c5c44",borderRadius:8,
                padding:"9px 12px",fontSize:13,color:"#e05c5c",marginBottom:14}}>{error}</div>
            )}

            <div className="ma">
              <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
              <button className="btn btn-g" onClick={() => { reset(); fileRef.current?.click(); }}>
                ← Choose different file
              </button>
              <input ref={fileRef} type="file" accept=".json" style={{display:"none"}}
                onChange={handleFile}/>
              <button
                className={`btn ${mode === "replace" ? "btn-d" : "btn-p btn-save"}`}
                onClick={handleImport}>
                {mode === "replace" ? "Replace & Import" : "Import"}
              </button>
            </div>
          </>
        )}

        {phase === "importing" && (
          <div style={{textAlign:"center",padding:"32px 0",color:C.muted}}>
            <div className="spin" style={{fontSize:28,display:"block",marginBottom:12}}>↻</div>
            Importing…
          </div>
        )}
      </div>
    </div>
  );
}
