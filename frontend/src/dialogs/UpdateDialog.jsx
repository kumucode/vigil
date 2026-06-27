import React from "react";

// ── UpdateDialog ────────────────────────────────────────────────────────────
// "Update Version" modal (modal==="edit"). The active app + new version
// value remain owned by App.jsx; this component owns only its visibility.
export default function UpdateDialog({
  open, onClose, activeApp, newVersion, setNewVersion, updateVersion,
}) {
  if (!open || !activeApp) return null;

  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="mt">Edit Version — {activeApp.name}</div>
          <button className="modal-close" onClick={onClose} title="Close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>
        </div>
        <div className="fg2"><label className="fl">Current</label><input className="fi" value={activeApp.version} disabled/></div>
        <div className="fg2">
          <label className="fl">New Version</label>
          <input className="fi" placeholder="e.g. 2.8.0" value={newVersion} onChange={e=>setNewVersion(e.target.value)} autoFocus/>
        </div>
        <div className="ma">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={updateVersion} disabled={!newVersion||newVersion===activeApp.version}>Update</button>
        </div>
      </div>
    </div>
  );
}
