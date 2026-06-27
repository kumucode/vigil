import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

const BellIcon = ({size=13, style={}}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const BellOffIcon = ({size=13, style={}}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const BellSnoozedIcon = ({size=13, style={}}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    <line x1="9" y1="4" x2="15" y2="4"/><polyline points="9 1 9 4 15 4 15 1"/>
  </svg>
);

export default function CardMenu({
  app, categories, C, api,
  setApps, setModal, setSettingsTab, setActiveApp,
  setUpdateLogs, setLogModal, setQuickPathApp, setQuickPathVal,
  openOverride, openHistory, snoozeApp, clearSnooze, ignoreVersion, removeApp,
}) {
  const [open, setOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({top:0,left:0});
  const [bellPos, setBellPos] = useState({top:0,left:0});
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const bellRef = useRef(null);
  const bellMenuRef = useRef(null);
  const menuHandlerRef = useRef(null);
  const bellHandlerRef = useRef(null);

  useEffect(()=>{
    return ()=>{
      if (menuHandlerRef.current) document.removeEventListener("mousedown", menuHandlerRef.current);
      if (bellHandlerRef.current) document.removeEventListener("mousedown", bellHandlerRef.current);
    };
  }, []);

  useEffect(()=>{
    if (menuHandlerRef.current) { document.removeEventListener("mousedown", menuHandlerRef.current); menuHandlerRef.current = null; }
    if (!open) return;
    const tid = setTimeout(()=>{
      const h = e => {
        if (btnRef.current?.contains(e.target)) return;
        if (menuRef.current?.contains(e.target)) return;
        setOpen(false); setCatOpen(false);
      };
      menuHandlerRef.current = h;
      document.addEventListener("mousedown", h);
    }, 10);
    return ()=>clearTimeout(tid);
  },[open]);

  useEffect(()=>{
    if (bellHandlerRef.current) { document.removeEventListener("mousedown", bellHandlerRef.current); bellHandlerRef.current = null; }
    if (!bellOpen) return;
    const tid = setTimeout(()=>{
      const h = e => {
        if (bellRef.current?.contains(e.target)) return;
        if (bellMenuRef.current?.contains(e.target)) return;
        setBellOpen(false);
      };
      bellHandlerRef.current = h;
      document.addEventListener("mousedown", h);
    }, 10);
    return ()=>clearTimeout(tid);
  },[bellOpen]);

  useEffect(()=>{
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setMenuPos({ top: r.bottom + window.scrollY + 4, right: window.innerWidth - r.right });
  },[open]);

  useEffect(()=>{
    if (!bellOpen || !bellRef.current) return;
    const r = bellRef.current.getBoundingClientRect();
    setBellPos({ top: r.bottom + window.scrollY + 4, right: window.innerWidth - r.right });
  },[bellOpen]);

  const isSnoozed = app.snoozed_until && new Date(app.snoozed_until)>new Date();
  const isIgnored = app.ignored_version && app.ignored_version===app.latest_version;
  const currentCat = categories.find(c=>c.key===app.category);
  const isOutdated = app.status === "outdated";
  const BellIconToShow = isIgnored ? BellOffIcon : isSnoozed ? BellSnoozedIcon : BellIcon;

  const bellMenu = bellOpen ? createPortal(
    <div ref={bellMenuRef} className="dd-menu" style={{position:"absolute",top:bellPos.top,right:bellPos.right,left:"auto",minWidth:160}}>
      <div className="dd-lbl">Snooze</div>
      {isSnoozed
        ? <div className="dd-item" onClick={()=>{clearSnooze(app);setBellOpen(false);}}>
            <BellIcon size={13}/> Clear snooze
          </div>
        : <>
            <div className="dd-item" onClick={()=>{snoozeApp(app,1);setBellOpen(false);}}>
              <BellSnoozedIcon size={13}/> 1 day
            </div>
            <div className="dd-item" onClick={()=>{snoozeApp(app,7);setBellOpen(false);}}>
              <BellSnoozedIcon size={13}/> 1 week
            </div>
            <div className="dd-item" onClick={()=>{snoozeApp(app,30);setBellOpen(false);}}>
              <BellSnoozedIcon size={13}/> 1 month
            </div>
          </>
      }
      {!isIgnored && <><div className="dd-sep"/>
        <div className="dd-item" onClick={()=>{ignoreVersion(app);setBellOpen(false);}}>
          <BellOffIcon size={13}/> Ignore this version
        </div>
      </>}
      {isIgnored && <><div className="dd-sep"/>
        <div className="dd-item" onClick={()=>{
          api(`/apps/${app.id}`,{method:"PATCH",body:JSON.stringify({ignored_version:""})})
            .then(u=>setApps(p=>p.map(a=>a.id===app.id?u:a))).catch(()=>{});
          setBellOpen(false);
        }}>
          <BellIcon size={13}/> Un-ignore
        </div>
      </>}
    </div>,
    document.body
  ) : null;

  const menu = open ? createPortal(
    <div ref={menuRef} className="dd-menu" style={{position:"absolute",top:menuPos.top,right:menuPos.right,left:"auto"}}
      onClick={e=>e.stopPropagation()}>
      <div className="dd-item" onClick={()=>{setOpen(false);openOverride(app);}}>Edit this card</div>
      <div className="dd-sep"/>
      <div className="dd-item" style={{justifyContent:"space-between",position:"relative",background:catOpen?C.hover:"transparent"}}
        onClick={e=>{e.stopPropagation();setCatOpen(o=>!o);}}>
        <span style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:currentCat?.color||C.muted,display:"inline-block",flexShrink:0}}/>
          {currentCat?.label||"Category"}
        </span>
        <span style={{opacity:.5,fontSize:10,transform:catOpen?"rotate(90deg)":"none",transition:"transform .15s"}}>▶</span>
        {catOpen&&(
          <div style={{position:"absolute",left:"100%",top:0,background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:10,padding:6,minWidth:180,boxShadow:"0 8px 32px rgba(0,0,0,.45)",zIndex:9999}}
            onClick={e=>e.stopPropagation()}>
            {categories.map(c=>(
              <div key={c.key} className="dd-item" onClick={()=>{
                api(`/apps/${app.id}`,{method:"PATCH",body:JSON.stringify({category:c.key})})
                  .then(u=>setApps(p=>p.map(a=>a.id===app.id?u:a))).catch(()=>{});
                setOpen(false); setCatOpen(false);
              }} style={app.category===c.key?{color:c.color,fontWeight:800}:{}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:c.color,display:"inline-block",flexShrink:0}}/>
                {app.category===c.key?"✓ ":""}{c.label}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="dd-sep"/>
      <div className="dd-item" onClick={()=>{setOpen(false);openHistory(app);}}>History</div>
      {app.version_source_url&&<div className="dd-item" onClick={()=>{window.open(app.version_source_url,"_blank");setOpen(false);}}>Release notes ↗</div>}
      <div className="dd-sep"/>
      <div className="dd-lbl">Notifications</div>
      {["always","major_only","never"].map(p=>(
        <div key={p} className="dd-item" onClick={()=>{
          api(`/apps/${app.id}`,{method:"PATCH",body:JSON.stringify({notify_policy:p})})
            .then(u=>setApps(prev=>prev.map(a=>a.id===app.id?u:a))).catch(()=>{});
          setOpen(false);
        }} style={app.notify_policy===p?{color:C.accent}:{}}>
          {app.notify_policy===p?"✓ ":""}{p==="major_only"?"Major only":p.charAt(0).toUpperCase()+p.slice(1)}
        </div>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div className="dd-wrap" style={{display:"flex",alignItems:"center",gap:4}}>
      <button className="btn btn-sm"
        title={app.app_url ? `Open app — ${app.app_url}` : "Add domain in Edit this card"}
        onClick={()=>{ if(app.app_url) window.open(app.app_url,"_blank"); else { setOpen(false); openOverride(app); } }}
        style={{background:"transparent",border:"none",color: app.app_url ? C.accent+"cc" : C.muted,
          cursor:"pointer",padding:"4px 5px",display:"flex",alignItems:"center",borderRadius:6,transition:"color .15s,background .15s"}}
        onMouseEnter={e=>{e.currentTarget.style.color=app.app_url?"#3ce08c":C.accent;e.currentTarget.style.background=app.app_url?"#3ce08c14":C.accent+"14";}}
        onMouseLeave={e=>{e.currentTarget.style.color=app.app_url?C.accent+"cc":C.muted;e.currentTarget.style.background="transparent";}}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </button>
      <button className="btn btn-sm"
        title={app.host_id ? "Agent connected — manage in Settings → Agents" : "Set up a remote agent"}
        onClick={()=>{ setOpen(false); setModal("settings"); setSettingsTab("agents"); }}
        style={{background:"transparent",border:"none",color: app.host_id ? C.accent+"cc" : C.muted,
          cursor:"pointer",padding:"4px 5px",display:"flex",alignItems:"center",borderRadius:6,transition:"color .15s,background .15s"}}
        onMouseEnter={e=>{e.currentTarget.style.color=C.accent;e.currentTarget.style.background=C.accent+"14";}}
        onMouseLeave={e=>{e.currentTarget.style.color=app.host_id?C.accent+"cc":C.muted;e.currentTarget.style.background="transparent";}}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="8" width="18" height="12" rx="2"/>
          <circle cx="8.5" cy="13.5" r="1.5"/><circle cx="15.5" cy="13.5" r="1.5"/>
          <path d="M9 17h6"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1"/>
        </svg>
      </button>
      <button className="btn btn-sm" onClick={()=>removeApp(app.id)} title="Remove this app"
        style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",padding:"4px 5px",
          display:"flex",alignItems:"center",borderRadius:6,transition:"color .15s,background .15s"}}
        onMouseEnter={e=>{const s=C.statusMap&&C.statusMap.error;e.currentTarget.style.color=(s&&s.fg)||"#e05c5c";e.currentTarget.style.background=(s&&s.border)||"rgba(224,92,92,.08)"}}
        onMouseLeave={e=>{e.currentTarget.style.color=C.muted;e.currentTarget.style.background="transparent";}}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
      <button className="btn btn-sm"
        title={(app.install_path||app.container_id) ? `Path: ${app.install_path||"—"}  |  Container: ${app.container_id||"—"}` : "Set install path / container ID"}
        onClick={()=>{ setQuickPathApp(app); setQuickPathVal({install_path:app.install_path||"",container_id:app.container_id||""}); }}
        style={{background:"transparent",border:"none",color:(app.install_path||app.container_id)?C.accent+("cc"):C.muted,
          cursor:"pointer",padding:"4px 5px",display:"flex",alignItems:"center",borderRadius:6,transition:"color .15s,background .15s"}}
        onMouseEnter={e=>{e.currentTarget.style.color=C.accent;e.currentTarget.style.background=C.accent+"14";}}
        onMouseLeave={e=>{e.currentTarget.style.color=(app.install_path||app.container_id)?C.accent+"cc":C.muted;e.currentTarget.style.background="transparent";}}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      <button ref={bellRef} className="btn btn-sm" onClick={()=>setBellOpen(o=>!o)}
        title={isIgnored?"Ignored — click to manage":isSnoozed?"Snoozed — click to manage":isOutdated?"Snooze or ignore this update":"Snooze or ignore"}
        style={{background:"transparent",border:"none",
          color: isIgnored ? C.muted : isSnoozed ? "#e0c43c" : C.muted,
          cursor:"pointer",padding:"4px 5px",display:"flex",alignItems:"center",borderRadius:6,transition:"color .15s,background .15s"}}
        onMouseEnter={e=>{
          e.currentTarget.style.color=isIgnored?C.text:isSnoozed?"#e0c43c":"#a78bfa";
          e.currentTarget.style.background=isSnoozed?"rgba(224,196,60,.12)":((C.statusMap&&C.statusMap.unknown.bg)||"rgba(167,139,250,.08)");
        }}
        onMouseLeave={e=>{
          e.currentTarget.style.color=isIgnored?C.muted:isSnoozed?"#e0c43c":C.muted;
          e.currentTarget.style.background="transparent";
        }}>
        <BellIconToShow size={13}/>
      </button>
      {app.host_id && (
        <button className="btn btn-sm" title="Update history"
          onClick={async()=>{
            setOpen(false);
            const logs = await api(`/apps/${app.id}/logs`);
            setUpdateLogs(logs); setLogModal(app);
          }}
          style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",
            padding:"4px 5px",display:"flex",alignItems:"center",borderRadius:6,
            transition:"color .15s,background .15s"}}
          onMouseEnter={e=>{e.currentTarget.style.color=C.accent;e.currentTarget.style.background=C.accent+"14";}}
          onMouseLeave={e=>{e.currentTarget.style.color=C.muted;e.currentTarget.style.background="transparent";}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
          </svg>
        </button>
      )}
      <button ref={btnRef} className="btn btn-g btn-sm" onClick={()=>setOpen(o=>!o)} title="More options">⋯</button>
      {bellMenu}
      {menu}
    </div>
  );
}
