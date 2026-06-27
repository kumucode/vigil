import React from "react";

// ── ImportDialog ────────────────────────────────────────────────────────────
// "Import docker-compose.yml" modal. Visibility controlled via `open`
// (modal==="import"). Compose text + import result remain owned by App.jsx.
export default function ImportDialog({
  open, onClose, C,
  composeText, setComposeText, importResult, importCompose,
}) {
  if (!open) return null;

  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div className="mt">Import docker-compose.yml</div>
          <button className="modal-close" onClick={onClose} title="Close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>
        </div>
        <p style={{fontSize:13,color:C.muted,marginBottom:14,lineHeight:1.6}}>
          Paste your compose file. Every service with an <code style={{background:C.card,padding:"1px 5px",borderRadius:4}}>image:</code> key will be imported automatically.
        </p>
        <textarea className="fi fi-ta" placeholder={"version: '3.8'\nservices:\n  jellyfin:\n    image: jellyfin/jellyfin:10.8.13"}
          value={composeText} onChange={e=>setComposeText(e.target.value)}/>
        {importResult && (
          <div className="import-result">
            <div className="ir-added">✓ Added {importResult.added.length}: {importResult.added.join(", ")||"none"}</div>
            {importResult.skipped.length>0&&<div className="ir-skip">⏭ Already tracked: {importResult.skipped.join(", ")}</div>}
          </div>
        )}
        <div className="ma">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={importCompose} disabled={!composeText.trim()}>Import</button>
        </div>
      </div>
    </div>
  );
}
