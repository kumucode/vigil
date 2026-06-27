import React from "react";

// ── HistoryDialog ───────────────────────────────────────────────────────────
// "History" modal (modal==="history"). `history` list is loaded/owned by
// App.jsx (fetched via services/api.js fetchAppHistory) and passed in.
export default function HistoryDialog({ open, onClose, activeApp, history, C }) {
  if (!open || !activeApp) return null;

  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="mt">History — {activeApp.name}</div>
          <button className="modal-close" onClick={onClose} title="Close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>
        </div>
        {history.length===0
          ?<p style={{color:C.muted,fontSize:13}}>No history yet. Recorded as the scheduler detects version changes.</p>
          :<div style={{maxHeight:340,overflowY:"auto"}}>
            {history.map((h,i)=>{
              const bc={major:"#e05c5c",minor:"#e0c43c",patch:"#3ce08c",unknown:C.muted};
              return(<div className="hist-row" key={i}>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,minWidth:90}}>{h.version}</div>
                <span className="hist-bump" style={{background:(bc[h.bump_type]||C.muted)+"22",color:bc[h.bump_type]||C.muted}}>{h.bump_type}</span>
                <div style={{fontSize:11,color:C.muted,marginLeft:"auto"}}>{h.detected_at}</div>
              </div>);
            })}
          </div>}
        <div className="ma"><button className="btn btn-secondary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
