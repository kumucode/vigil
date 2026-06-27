import { useState, useRef, useEffect, useCallback } from "react";

function hsvToRgb(h,s,v){
  const i=Math.floor(h*6), f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
  const m=i%6;
  const [r,g,b]=m===0?[v,t,p]:m===1?[q,v,p]:m===2?[p,v,t]:m===3?[p,q,v]:m===4?[t,p,v]:[v,p,q];
  return [Math.round(r*255),Math.round(g*255),Math.round(b*255)];
}
function rgbToHsv(r,g,b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  let h=0;
  if(d){
    if(max===r) h=((g-b)/d+6)%6;
    else if(max===g) h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h/=6;
  }
  return [h, max?d/max:0, max];
}
function hexToRgb(hex){
  const h=hex.replace("#",""); const f=h.length===3?h.split("").map(c=>c+c).join(""):h;
  return [parseInt(f.slice(0,2),16),parseInt(f.slice(2,4),16),parseInt(f.slice(4,6),16)];
}
function rgbToHex(r,g,b){ return "#"+[r,g,b].map(x=>Math.round(x).toString(16).padStart(2,"0")).join(""); }

export default function AccentColorPicker({ value, onChange }) {
  const [r0,g0,b0] = hexToRgb(value||"#A0A0B8");
  const [h0,s0,v0] = rgbToHsv(r0,g0,b0);

  const [open, setOpen]   = useState(false);
  const [hue,  setHue]    = useState(h0);
  const [sat,  setSat]    = useState(s0);
  const [val,  setVal]    = useState(v0);
  const [hexIn,setHexIn]  = useState((value||"#A0A0B8").replace("#","").toUpperCase());

  const popRef    = useRef(null);
  const svRef     = useRef(null);
  const hueRef    = useRef(null);
  const svDragging  = useRef(false);
  const hueDragging = useRef(false);

  useEffect(()=>{
    const [rr,gg,bb]=hexToRgb(value||"#A0A0B8");
    const [hh,ss,vv]=rgbToHsv(rr,gg,bb);
    setHue(hh); setSat(ss); setVal(vv);
    setHexIn((value||"#A0A0B8").replace("#","").toUpperCase());
  },[value]);

  useEffect(()=>{
    if(!open) return;
    const fn = e=>{ if(popRef.current && !popRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",fn);
    return ()=>document.removeEventListener("mousedown",fn);
  },[open]);

  const commit = (h,s,v)=>{
    const [r,g,b]=hsvToRgb(h,s,v);
    const hex=rgbToHex(r,g,b);
    setHexIn(hex.replace("#","").toUpperCase());
    onChange(hex);
  };

  const handleSvMove = useCallback((e)=>{
    if(!svDragging.current) return;
    const rect=svRef.current.getBoundingClientRect();
    const cx=e.touches?e.touches[0].clientX:e.clientX;
    const cy=e.touches?e.touches[0].clientY:e.clientY;
    const s=Math.max(0,Math.min(1,(cx-rect.left)/rect.width));
    const v=Math.max(0,Math.min(1,1-(cy-rect.top)/rect.height));
    setSat(s); setVal(v); commit(hue,s,v);
  },[hue]);

  const handleHueMove = useCallback((e)=>{
    if(!hueDragging.current) return;
    const rect=hueRef.current.getBoundingClientRect();
    const cx=e.touches?e.touches[0].clientX:e.clientX;
    const h=Math.max(0,Math.min(1,(cx-rect.left)/rect.width));
    setHue(h); commit(h,sat,val);
  },[sat,val]);

  useEffect(()=>{
    const up=()=>{ svDragging.current=false; hueDragging.current=false; };
    document.addEventListener("mouseup",up);
    document.addEventListener("touchend",up);
    document.addEventListener("mousemove",handleSvMove);
    document.addEventListener("touchmove",handleSvMove,{passive:false});
    document.addEventListener("mousemove",handleHueMove);
    document.addEventListener("touchmove",handleHueMove,{passive:false});
    return ()=>{
      document.removeEventListener("mouseup",up);
      document.removeEventListener("touchend",up);
      document.removeEventListener("mousemove",handleSvMove);
      document.removeEventListener("touchmove",handleSvMove);
      document.removeEventListener("mousemove",handleHueMove);
      document.removeEventListener("touchmove",handleHueMove);
    };
  },[handleSvMove,handleHueMove]);

  const [rH,gH,bH]=hsvToRgb(hue,1,1);
  const hueHex=rgbToHex(rH,gH,bH);
  const currentHex=rgbToHex(...hsvToRgb(hue,sat,val));
  const dotLeft=`${sat*100}%`;
  const dotTop=`${(1-val)*100}%`;
  const hueLeft=`${hue*100}%`;
  const PRESETS=["#A0A0B8","#3c8ce0","#3ce08c","#e0c43c","#e05c5c","#b03ce0","#e03c8c","#3cd8e0","#e08c3c","#a0a0b8"];

  return (
    <div style={{position:"relative",display:"inline-block"}} ref={popRef}>
      <div onClick={()=>setOpen(o=>!o)} style={{
        width:40, height:40, borderRadius:10, background:value||"#A0A0B8",
        cursor:"pointer", border:"2px solid rgba(255,255,255,.15)",
        boxShadow:"0 2px 8px rgba(0,0,0,.4)", transition:"transform .12s, box-shadow .12s",
      }}/>
      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 10px)", left:0, zIndex:9999,
          background:"#1a1a2a", border:"1px solid #333352", borderRadius:14,
          padding:16, width:260, boxShadow:"0 12px 40px rgba(0,0,0,.7)", userSelect:"none",
        }}>
          <div ref={svRef}
            onMouseDown={e=>{ svDragging.current=true; handleSvMove(e); }}
            onTouchStart={e=>{ svDragging.current=true; handleSvMove(e); }}
            style={{
              position:"relative", width:"100%", height:150, borderRadius:8,
              background:`linear-gradient(to right, #fff, ${hueHex})`,
              cursor:"crosshair", marginBottom:12, overflow:"visible",
            }}>
            <div style={{position:"absolute",inset:0,borderRadius:8,background:"linear-gradient(to bottom, transparent, #000)",pointerEvents:"none"}}/>
            <div style={{position:"absolute",inset:0,borderRadius:8,background:"linear-gradient(to right, #fff, transparent)",pointerEvents:"none"}}/>
            <div style={{
              position:"absolute", left:dotLeft, top:dotTop, transform:"translate(-50%,-50%)",
              width:14, height:14, borderRadius:"50%", border:"2px solid #fff",
              boxShadow:"0 0 0 1px rgba(0,0,0,.4)", background:currentHex, pointerEvents:"none",
            }}/>
          </div>
          <div ref={hueRef}
            onMouseDown={e=>{ hueDragging.current=true; handleHueMove(e); }}
            onTouchStart={e=>{ hueDragging.current=true; handleHueMove(e); }}
            style={{
              position:"relative", height:14, borderRadius:7, marginBottom:14,
              background:"linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)", cursor:"pointer",
            }}>
            <div style={{
              position:"absolute", left:hueLeft, top:"50%", transform:"translate(-50%,-50%)",
              width:18, height:18, borderRadius:"50%", background:hueHex,
              border:"2px solid #fff", boxShadow:"0 1px 4px rgba(0,0,0,.5)", pointerEvents:"none",
            }}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <div style={{width:32,height:32,borderRadius:7,background:currentHex,border:"1px solid rgba(255,255,255,.15)",flexShrink:0}}/>
            <div style={{display:"flex",alignItems:"center",flex:1,background:"#0e0e1a",border:"1px solid #333352",borderRadius:8,padding:"0 10px",height:36}}>
              <span style={{color:"#5a5a7a",fontSize:13,marginRight:4}}>#</span>
              <input value={hexIn}
                onChange={e=>{
                  const raw=e.target.value.replace(/[^0-9a-fA-F]/g,"").slice(0,6).toUpperCase();
                  setHexIn(raw);
                  if(raw.length===6){ const [rr,gg,bb]=hexToRgb("#"+raw); const [hh,ss,vv]=rgbToHsv(rr,gg,bb); setHue(hh); setSat(ss); setVal(vv); onChange("#"+raw); }
                }}
                style={{background:"none",border:"none",outline:"none",color:"#e8e8f2",fontFamily:"'Space Mono',monospace",fontSize:13,width:"100%",letterSpacing:1}}
                maxLength={6} spellCheck={false} placeholder="6C63FF"
              />
            </div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {PRESETS.map(c=>{
              const sel=(value||"").toLowerCase()===c.toLowerCase();
              return (
                <div key={c} onClick={()=>{ onChange(c); setOpen(false); }} title={c}
                  style={{
                    width:22,height:22,borderRadius:6,background:c,cursor:"pointer",
                    outline:sel?"2px solid #fff":"2px solid transparent",outlineOffset:2,
                    boxShadow:sel?`0 0 0 4px ${c}55`:"0 1px 3px #0004",
                    transition:"outline .1s,box-shadow .1s",flexShrink:0,
                  }}/>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
