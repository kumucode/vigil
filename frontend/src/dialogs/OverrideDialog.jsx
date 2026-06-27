import React from "react";
import AppIcon, { resolveIconUrl } from "../components/AppIcon";
import ChannelPill, { CHANNEL_META } from "../components/ChannelPill";

// ── OverrideDialog ──────────────────────────────────────────────────────────
// "Customise" modal (modal==="override"). Owns its open/close interaction
// but the override form state (`overData`), pending icon upload, and the
// install-path reveal toggle remain owned by App.jsx (they're seeded by
// openOverride() and need to persist across re-renders triggered by icon
// search / icon library loads).
export default function OverrideDialog({
  open, onClose, C,
  activeApp, overData, setOverData,
  pendingIcon, setPendingIcon, iconSearch,
  iconFileRef, clearAppIcon,
  showInstallPath, setShowInstallPath,
  categories, hosts, getCatColor,
  saveOverride,
  onManageHosts,
}) {
  if (!open || !activeApp) return null;

  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div className="mt">Customise — {activeApp.name}</div>
          <button className="modal-close" onClick={onClose} title="Close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>
        </div>
        {/* ── Icon section ── */}
        <div className="icon-upload-area">
          <AppIcon
            key={overData.custom_icon||"default"}
            name={activeApp.name} image={activeApp.image||""}
            customIcon={overData.custom_icon||activeApp.custom_icon}
            iconData={iconSearch ? null : (pendingIcon||activeApp.icon_data)}
            catColor={getCatColor(overData.category)} size={52} clickable
            onClick={()=>iconFileRef.current?.click()}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>{overData.name||activeApp.name}</div>
            <div className="icon-upload-hint">
              {pendingIcon?"✓ File selected — save to apply.":overData.custom_icon?"Custom URL active.":activeApp.icon_data?"Custom image active.":resolveIconUrl(activeApp.name,null,null,activeApp.image)?"Auto-detected.":"Using initials fallback."}<br/>
              Search below, paste a URL, or upload a file.
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button className="btn btn-g btn-sm" onClick={()=>iconFileRef.current?.click()}>Upload file</button>
              {(activeApp.icon_data||pendingIcon)&&<button className="btn btn-d btn-sm" onClick={()=>{setPendingIcon(null);clearAppIcon(activeApp);}}>✕ Clear custom</button>}
            </div>
          </div>
        </div>
        {activeApp.detection_channel && (
          <div className="ch-info">
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".8px",color:C.muted,marginBottom:7}}>Detection Channel</div>
            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <ChannelPill channel={activeApp.detection_channel}/>
              <span style={{fontSize:12,color:C.muted,lineHeight:1.5}}>{CHANNEL_META[activeApp.detection_channel]?.desc}</span>
            </div>
          </div>
        )}
        <div className="fg2">
          <label className="fl">Image String</label>
          <input className="fi" placeholder="e.g. jellyfin/jellyfin:latest"
            value={overData.image}
            onChange={e=>setOverData(d=>({...d,image:e.target.value}))}/>
          {overData.image.trim() && overData.image.trim()!==activeApp.image && (
            <div style={{fontSize:11,color:"#e08c3c",marginTop:4,fontWeight:600}}>
              Note: Changing the image will reset version tracking and trigger a new check.
            </div>
          )}
        </div>
        <div className="fg2">
          <label className="fl">Display Name</label>
          <input className="fi" placeholder="App display name"
            value={overData.name}
            onChange={e=>setOverData(d=>({...d,name:e.target.value}))}/>
        </div>
        <div className="fg2">
          <label className="fl">Category</label>
          <select className="fs" value={overData.category} onChange={e=>setOverData(d=>({...d,category:e.target.value}))}>
            <option value="uncategorized">Uncategorized</option>
            {categories.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div className="fg2">
          <label className="fl">Icon URL <span style={{color:C.muted,fontWeight:400,textTransform:"none"}}>optional</span></label>
          <input className="fi" placeholder="https://example.com/icon.png" value={overData.custom_icon}
            onChange={e=>setOverData(d=>({...d,custom_icon:e.target.value}))}/>
          <p className="fh">Paste a direct image URL, or find icons at <a href="https://selfh.st/icons/" target="_blank" rel="noopener noreferrer" style={{color:C.accent}}>selfh.st/icons</a> — right-click any icon → Copy image address.</p>
        </div>
        <div className="fg2">
          <label className="fl">Release Notes URL <span style={{color:C.muted,fontWeight:400,textTransform:"none"}}>optional</span></label>
          <input className="fi" placeholder="https://github.com/owner/repo/releases" value={overData.version_source_url}
            onChange={e=>setOverData(d=>({...d,version_source_url:e.target.value}))}/>
          <p className="fh">Adds "Release notes ↗" in the card menu.</p>
        </div>
        <div className="fg2">
          <label className="fl">Install Path <span style={{color:C.muted,fontWeight:400,textTransform:"none"}}>optional</span></label>
          <div style={{display:"flex",gap:8}}>
            <div style={{position:"relative",display:"flex",alignItems:"center",flex:2}}>
              <input className="fi" type={showInstallPath?"text":"password"}
                placeholder="e.g. /home/bob/docker/jellyfin"
                value={overData.install_path}
                onChange={e=>setOverData(d=>({...d,install_path:e.target.value}))}
                style={{paddingRight:36}}/>
              <button onClick={()=>setShowInstallPath(v=>!v)}
                title={showInstallPath?"Hide path":"Reveal path"}
                style={{position:"absolute",right:8,background:"none",border:"none",
                  cursor:"pointer",color:C.muted,fontSize:15,lineHeight:1,padding:2,
                  display:"flex",alignItems:"center"}}>
                {showInstallPath
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
            <input className="fi" style={{flex:1,minWidth:0}}
              placeholder="LXC 101 / VM 105"
              value={overData.container_id}
              onChange={e=>setOverData(d=>({...d,container_id:e.target.value}))}
              title="Container or VM ID (e.g. LXC 101, VM 105)"/>
          </div>
          <p className="fh">Install path (masked) · Container or VM ID (e.g. LXC 101, VM 105)</p>
        </div>
        <div className="fg2">
          <label className="fl">Domain <span style={{color:C.muted,fontWeight:400,textTransform:"none"}}>optional</span></label>
          <input className="fi" placeholder="https://jellyfin.yourdomain.com" value={overData.app_url}
            onChange={e=>setOverData(d=>({...d,app_url:e.target.value}))}/>
          <p className="fh">Adds a quick-access ↗ link button to the card.</p>
        </div>
        <div className="fg2">
          <label className="fl">Remote host <span style={{color:C.muted,fontWeight:400,textTransform:"none"}}>optional</span></label>
          <select className="fs" value={overData.host_id||""} onChange={e=>setOverData(d=>({...d,host_id:e.target.value}))}>
            <option value="">— not linked —</option>
            {hosts.map(h=><option key={h.id} value={h.id}>{h.name} ({h.ip})</option>)}
          </select>
          <p className="fh">Link this app to a host agent for remote updates. <span style={{color:C.accent,cursor:"pointer"}} onClick={onManageHosts}>Manage hosts ↗</span></p>
        </div>
        {overData.host_id && <>
          <div className="fg2">
            <label className="fl">Service name <span style={{color:C.muted,fontWeight:400,textTransform:"none"}}>optional</span></label>
            <input className="fi" placeholder="e.g. jellyfin (for multi-service compose files)" value={overData.service_name}
              onChange={e=>setOverData(d=>({...d,service_name:e.target.value}))}/>
            <p className="fh">The service name inside docker-compose.yml. Leave blank to restart all services.</p>
          </div>
          <div className="fg2">
            <label className="fl">Auto-update</label>
            <select className="fs" value={overData.auto_update} onChange={e=>setOverData(d=>({...d,auto_update:e.target.value}))}>
              <option value="off">Off — manual only</option>
              <option value="ask">Ask me — show notification, I decide</option>
              <option value="auto">Auto — update automatically, notify me</option>
              <option value="silent">Silent — update automatically, no notification</option>
            </select>
          </div>
        </>}
        <div className="fg2">
          <label className="fl">Notes <span style={{color:C.muted,fontWeight:400,textTransform:"none"}}>optional</span></label>
          <textarea className="fi" rows={3} placeholder="Internal notes — deployment location, config details, reminders…"
            value={overData.notes}
            onChange={e=>setOverData(d=>({...d,notes:e.target.value}))}
            style={{resize:"vertical",lineHeight:1.6}}/>
          <p className="fh">Private notes visible only in this panel. Not sent anywhere.</p>
        </div>
        <div className="ma">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={saveOverride}>Save</button>
        </div>
      </div>
    </div>
  );
}
