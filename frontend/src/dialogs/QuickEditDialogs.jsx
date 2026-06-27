import React from "react";

// ── QuickEditDialogs ────────────────────────────────────────────────────────
// Two lightweight, card-menu-triggered modals:
//  - Quick image edit  (quickImageApp / quickImageVal)
//  - Quick install-path / container-id edit (quickPathApp / quickPathVal)
//
// Both call back into App.jsx's shared `api` wrapper + `setApps`/`toast`.
export default function QuickEditDialogs({
  api, setApps, toast, C,
  quickImageApp, setQuickImageApp, quickImageVal, setQuickImageVal,
  quickPathApp, setQuickPathApp, quickPathVal, setQuickPathVal,
}) {
  const saveQuickImage = async () => {
    const v = quickImageVal.trim();
    if (!v || v===quickImageApp.image) { setQuickImageApp(null); return; }
    try {
      const u = await api(`/apps/${quickImageApp.id}`,{method:"PATCH",body:JSON.stringify({image:v})});
      setApps(p=>p.map(a=>a.id===quickImageApp.id?u:a));
      setQuickImageApp(null); toast("Image updated!");
      const checked = await api(`/apps/${u.id}/check`,{method:"POST"});
      setApps(p=>p.map(a=>a.id===u.id?checked:a));
    } catch(err) { toast(err.message||"Failed","error"); }
  };

  const saveQuickPath = async () => {
    try {
      const u = await api(`/apps/${quickPathApp.id}`,{method:"PATCH",body:JSON.stringify({
        install_path: quickPathVal.install_path.trim(),
        container_id: quickPathVal.container_id.trim(),
      })});
      setApps(p=>p.map(a=>a.id===quickPathApp.id?u:a));
      setQuickPathApp(null); toast("Path saved!");
    } catch(err){ toast(err.message||"Failed","error"); }
  };

  const clearQuickPath = async () => {
    try {
      const u = await api(`/apps/${quickPathApp.id}`,{method:"PATCH",body:JSON.stringify({install_path:"",container_id:""})});
      setApps(p=>p.map(a=>a.id===quickPathApp.id?u:a));
      setQuickPathApp(null); toast("Path cleared");
    } catch(err){ toast(err.message||"Failed","error"); }
  };

  return (
    <>
      {/* Quick image edit */}
      {quickImageApp && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setQuickImageApp(null)}>
          <div className="modal" style={{maxWidth:460}}>
            <div className="modal-header" style={{marginBottom:16}}>
              <div className="mt" style={{fontSize:15}}>Edit Image</div>
              <button className="modal-close" onClick={()=>setQuickImageApp(null)} title="Close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>
            </div>
            <div className="fg2">
              <label className="fl">Image String</label>
              <input className="fi" autoFocus
                placeholder="e.g. jellyfin/jellyfin:latest"
                value={quickImageVal}
                onChange={e=>setQuickImageVal(e.target.value)}
                onKeyDown={e=>{
                  if (e.key==="Enter") saveQuickImage();
                  if (e.key==="Escape") setQuickImageApp(null);
                }}/>
              <p className="fh">Press Enter to save · Esc to cancel. Changing the image resets version tracking.</p>
            </div>
            <div className="ma">
              <button className="btn btn-secondary" onClick={()=>setQuickImageApp(null)}>Exit</button>
              <button className="btn btn-primary" onClick={saveQuickImage}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick path / container modal */}
      {quickPathApp && (
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setQuickPathApp(null)}>
          <div className="modal" style={{maxWidth:500}}>
            <div className="modal-header">
              <div className="mt" style={{
                fontSize:Math.max(13, Math.min(18, Math.floor(420/(`Install Path — ${quickPathApp.name}`.length*0.62))))+"px",
                overflow:"hidden",textOverflow:"ellipsis"}}>
                Install Path — {quickPathApp.name}
              </div>
              <button className="modal-close" onClick={()=>setQuickPathApp(null)} title="Close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>
            </div>
            <div className="fg2">
              <label className="fl">Install path <span style={{color:C.muted,fontWeight:400,textTransform:"none"}}>optional</span></label>
              <div style={{display:"flex",gap:8}}>
                <input className="fi" autoFocus
                  placeholder="e.g. /home/bob/docker/jellyfin"
                  value={quickPathVal.install_path}
                  onChange={e=>setQuickPathVal(v=>({...v,install_path:e.target.value}))}
                  onKeyDown={e=>{ if(e.key==="Enter") saveQuickPath(); if(e.key==="Escape") setQuickPathApp(null); }}
                  style={{flex:1}}/>
                <input className="fi"
                  placeholder="LXC 101 / VM 105"
                  value={quickPathVal.container_id}
                  onChange={e=>setQuickPathVal(v=>({...v,container_id:e.target.value}))}
                  onKeyDown={e=>{ if(e.key==="Enter") saveQuickPath(); if(e.key==="Escape") setQuickPathApp(null); }}
                  style={{width:150,flexShrink:0}}/>
              </div>
              <p className="fh">Left: filesystem path on your host. Right: Proxmox LXC/VM ID or any label.</p>
            </div>
            <div className="ma">
              <button className="btn btn-secondary" onClick={()=>setQuickPathApp(null)}>Exit</button>
              {(quickPathVal.install_path||quickPathVal.container_id) && (
                <button className="btn btn-g btn-danger-hover" onClick={clearQuickPath}>Clear</button>
              )}
              <button className="btn btn-primary" onClick={saveQuickPath}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
