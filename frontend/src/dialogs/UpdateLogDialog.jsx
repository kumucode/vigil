import React from "react";

// ── UpdateLogDialog ─────────────────────────────────────────────────────
// Update-history modal (logModal) plus its nested revert-confirmation modal
// (revertModal). Both are opened from a card's "Update log" menu item; their
// visibility is driven entirely by the logModal/revertModal values
// themselves (no separate `open` prop needed).
export default function UpdateLogDialog({
  C, api, toast, setApps,
  logModal, setLogModal,
  updateLogs, setUpdateLogs,
  revertModal, setRevertModal,
}) {
  return (
    <>
        {logModal && (
          <div className="ov" onClick={e=>e.target===e.currentTarget&&setLogModal(null)}>
            <div className="modal" style={{maxWidth:560}}>
              <div className="modal-header">
                <div className="mt" style={{fontSize:15,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  Update history — {logModal.name}
                </div>
                <button className="modal-close" onClick={()=>setLogModal(null)} title="Close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>
              </div>
              {updateLogs.length===0 ? (
                <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"20px 0"}}>No updates recorded yet.</div>
              ) : (
                <div style={{maxHeight:380,overflowY:"auto"}}>
                  {updateLogs.map(entry=>(
                    <div key={entry.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",
                      borderBottom:`1px solid ${C.border}`}}>
                      <span style={{width:8,height:8,borderRadius:"50%",flexShrink:0,
                        background:entry.status==="success"?(C.statusMap&&C.statusMap["up-to-date"].fg)||"#22C55E":entry.status==="failed"?(C.statusMap&&C.statusMap.error.fg)||"#e05c5c":("#e0c43c")}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13}}>
                          {entry.from_version} → <strong>{entry.to_version}</strong>
                          <span style={{fontSize:10,marginLeft:7,padding:"1px 6px",borderRadius:10,
                            background:entry.action==="revert"?"#FAEEDA":"#E6F1FB",
                            color:entry.action==="revert"?"#854F0B":"#185FA5"}}>
                            {entry.action}
                          </span>
                        </div>
                        <div style={{fontSize:11,color:C.muted}}>{entry.timestamp?.slice(0,16).replace("T"," ")} · {entry.triggered_by}</div>
                        {entry.error_message && <div style={{fontSize:11,color:(C.statusMap&&C.statusMap.error.fg)||"#e05c5c",marginTop:2}}>{entry.error_message}</div>}
                      </div>
                      <div style={{display:"flex",gap:5}}>
                        <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,fontWeight:600,
                          background:entry.status==="success"?((C.statusMap&&C.statusMap["up-to-date"].fg)||"#22C55E")+"22":entry.status==="failed"?((C.statusMap&&C.statusMap.error.fg)||"#e05c5c")+"22":"#BA751722",
                          color:entry.status==="success"?(C.statusMap&&C.statusMap["up-to-date"].fg)||"#22C55E":entry.status==="failed"?(C.statusMap&&C.statusMap.error.fg)||"#e05c5c":("#e0c43c")}}>
                          {entry.status}
                        </span>
                        {entry.status==="success" && entry.backup_path && entry.action!=="revert" && (
                          <button className="btn btn-g btn-sm" style={{fontSize:10,color:(C.statusMap&&C.statusMap.error.fg)||"#e05c5c",borderColor:((C.statusMap&&C.statusMap.error.fg)||"#e05c5c")+"44"}}
                            onClick={()=>setRevertModal(entry)}>
                            Revert
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="ma">
                <button className="btn btn-g btn-cancel" onClick={()=>setLogModal(null)}>Close</button>
                {updateLogs.length > 0 && (
                  <button className="btn btn-g btn-sm"
                    style={{color:(C.statusMap&&C.statusMap.error.fg)||"#e05c5c",borderColor:((C.statusMap&&C.statusMap.error.fg)||"#e05c5c")+"44",fontSize:12}}
                    onClick={async()=>{
                      if(!confirm(`Clear all update history for ${logModal.name}? This cannot be undone.`)) return;
                      await api(`/apps/${logModal.id}/logs`,{method:"DELETE"});
                      setUpdateLogs([]);
                      toast("History cleared.");
                    }}>
                    Clear history
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ Revert confirmation modal ════════════════════════════════════════ */}
        {revertModal && logModal && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",
            alignItems:"center",justifyContent:"center",zIndex:3000,padding:20}}>
            <div className="modal" style={{maxWidth:460}}>
              <div className="modal-header">
                <div className="mt">↩ Revert — {logModal.name}</div>
                <button className="modal-close" onClick={()=>setRevertModal(null)} title="Close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>
              </div>
              <div style={{fontSize:13,color:C.muted,marginBottom:14}}>
                This will restore the compose file from {revertModal.timestamp?.slice(0,16).replace("T"," ")} and restart the service.
              </div>
              <div style={{background:C.bg,borderRadius:8,padding:"10px 12px",marginBottom:14,fontFamily:"'Space Mono',monospace",fontSize:12}}>
                <div style={{color:(C.statusMap&&C.statusMap.error.fg)||"#e05c5c",background:"#e05c5c11",padding:"2px 6px",borderRadius:3,marginBottom:3}}>
                  − image: ...:{revertModal.to_version}
                </div>
                <div style={{color:(C.statusMap&&C.statusMap["up-to-date"].fg)||"#22C55E",background:"#1D9E7511",padding:"2px 6px",borderRadius:3}}>
                  + image: ...:{revertModal.from_version}
                </div>
              </div>
              <div className="ma">
                <button className="btn btn-g btn-cancel" onClick={()=>setRevertModal(null)}>Cancel</button>
                <button className="btn btn-p btn-save" style={{background:"#A32D2D",borderColor:"#A32D2D"}}
                  onClick={async()=>{
                    try {
                      const r = await api(`/apps/${logModal.id}/revert/${revertModal.id}`,{method:"POST"});
                      setApps(p=>p.map(a=>a.id===logModal.id?r.app:a));
                      const logs = await api(`/apps/${logModal.id}/logs`);
                      setUpdateLogs(logs);
                      setRevertModal(null);
                      toast(`↩ Reverted ${logModal.name} to ${revertModal.from_version}`);
                    } catch(e) { toast(e.message||"Revert failed","error"); }
                  }}>
                  Confirm revert
                </button>
              </div>
            </div>
          </div>
        )}

    </>
  );
}
