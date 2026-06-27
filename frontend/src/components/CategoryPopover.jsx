import { useState, useRef, useEffect } from "react";
import AccentColorPicker from "./AccentColorPicker";

export default function CategoryPopover({ cat, onSave, onDelete, onClose, C }) {
  const [form, setForm] = useState({
    label: cat?.label || "",
    color: cat?.color || "#A0A0B8",
    keywords: cat?.keywords?.join(", ") || "",
    key: "",
  });
  const ref = useRef(null);
  const isNew = !cat;

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const handleSave = () => {
    const payload = {
      label: form.label.trim(),
      color: form.color,
      keywords: form.keywords.split(",").map(k=>k.trim()).filter(Boolean),
      ...(isNew ? { key: form.key.trim().toLowerCase().replace(/[^a-z0-9_]/g,"") } : {}),
    };
    if (!payload.label) return;
    if (isNew && !payload.key) return;
    onSave(payload, cat?.id);
  };

  return (
    <div ref={ref} style={{
      position:"absolute", top:"calc(100% + 8px)", left:0, zIndex:200,
      background:C.surface, border:`1px solid ${C.accent}44`, borderRadius:12,
      padding:16, width:260, boxShadow:`0 8px 32px rgba(0,0,0,.4)`,
      animation:"fadeIn .15s ease",
    }}>
      <div style={{fontSize:12,fontWeight:700,color:C.accent,marginBottom:12}}>
        {isNew ? "New Category" : `Edit: ${cat.label}`}
      </div>
      {isNew && (
        <div style={{marginBottom:10}}>
          <label style={{display:"block",fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>Key (slug)</label>
          <input value={form.key} onChange={e=>setForm(f=>({...f,key:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"")}))}
            placeholder="e.g. homelab" style={{width:"100%",background:C.input,border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 10px",fontFamily:"'Space Mono',monospace",fontSize:12,color:C.text,outline:"none"}}/>
        </div>
      )}
      <div style={{marginBottom:10}}>
        <label style={{display:"block",fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>Label</label>
        <input value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))}
          placeholder="Display name" style={{width:"100%",background:C.input,border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 10px",fontFamily:"'Space Mono',monospace",fontSize:12,color:C.text,outline:"none"}}/>
      </div>
      <div style={{marginBottom:10}}>
        <label style={{display:"block",fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>Colour</label>
        <AccentColorPicker value={form.color} onChange={c=>setForm(f=>({...f,color:c}))}/>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{display:"block",fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>Keywords (comma-separated)</label>
        <input value={form.keywords} onChange={e=>setForm(f=>({...f,keywords:e.target.value}))}
          placeholder="nginx, caddy, haproxy" style={{width:"100%",background:C.input,border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 10px",fontFamily:"'Space Mono',monospace",fontSize:12,color:C.text,outline:"none"}}/>
      </div>
      <div style={{display:"flex",gap:6,justifyContent:"space-between"}}>
        <div style={{display:"flex",gap:6}}>
          <button onClick={handleSave} disabled={!form.label||(isNew&&!form.key)}
            style={{background:C.accent,color:C.onAccent,border:"none",borderRadius:7,padding:"6px 14px",fontFamily:"'Syne'",fontWeight:700,fontSize:12,cursor:"pointer",opacity:!form.label||(isNew&&!form.key)?.4:1,transition:"box-shadow .18s"}}
            onMouseEnter={e=>{ if(!(!form.label||(isNew&&!form.key))) e.currentTarget.style.boxShadow="0 0 10px rgba(60,224,140,.5)"; }}
            onMouseLeave={e=>{ e.currentTarget.style.boxShadow="none"; }}>
            {isNew?"Create":"Save"}
          </button>
          <button onClick={onClose} style={{background:C.card,color:C.muted,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",fontFamily:"'Syne'",fontWeight:700,fontSize:12,cursor:"pointer"}}>Exit</button>
        </div>
        {!isNew && (
          <button onClick={()=>onDelete(cat)} style={{background:"#e05c5c14",color:"#e05c5c",border:"1px solid #e05c5c2a",borderRadius:7,padding:"6px 10px",fontFamily:"'Syne'",fontWeight:700,fontSize:12,cursor:"pointer"}}>Delete</button>
        )}
      </div>
    </div>
  );
}
