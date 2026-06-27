import { useState, useRef, useMemo, useEffect } from "react";

export const TZ_OPTIONS = [
  {value:"UTC", label:"UTC — Coordinated Universal Time"},
  {value:"America/New_York", label:"America/New_York — EST/EDT (UTC-5/4)"},
  {value:"America/Chicago", label:"America/Chicago — CST/CDT (UTC-6/5)"},
  {value:"America/Denver", label:"America/Denver — MST/MDT (UTC-7/6)"},
  {value:"America/Phoenix", label:"America/Phoenix — MST (UTC-7)"},
  {value:"America/Los_Angeles", label:"America/Los_Angeles — PST/PDT (UTC-8/7)"},
  {value:"America/Anchorage", label:"America/Anchorage — AKST/AKDT (UTC-9/8)"},
  {value:"Pacific/Honolulu", label:"Pacific/Honolulu — HST (UTC-10)"},
  {value:"America/Toronto", label:"America/Toronto — EST/EDT (UTC-5/4)"},
  {value:"America/Vancouver", label:"America/Vancouver — PST/PDT (UTC-8/7)"},
  {value:"America/Sao_Paulo", label:"America/Sao_Paulo — BRT/BRST (UTC-3/2)"},
  {value:"America/Argentina/Buenos_Aires", label:"America/Buenos_Aires — ART (UTC-3)"},
  {value:"America/Santiago", label:"America/Santiago — CLT/CLST (UTC-4/3)"},
  {value:"America/Bogota", label:"America/Bogota — COT (UTC-5)"},
  {value:"America/Lima", label:"America/Lima — PET (UTC-5)"},
  {value:"America/Caracas", label:"America/Caracas — VET (UTC-4)"},
  {value:"America/Mexico_City", label:"America/Mexico_City — CST/CDT (UTC-6/5)"},
  {value:"Europe/London", label:"Europe/London — GMT/BST (UTC+0/1)"},
  {value:"Europe/Dublin", label:"Europe/Dublin — GMT/IST (UTC+0/1)"},
  {value:"Europe/Lisbon", label:"Europe/Lisbon — WET/WEST (UTC+0/1)"},
  {value:"Europe/Paris", label:"Europe/Paris — CET/CEST (UTC+1/2)"},
  {value:"Europe/Berlin", label:"Europe/Berlin — CET/CEST (UTC+1/2)"},
  {value:"Europe/Madrid", label:"Europe/Madrid — CET/CEST (UTC+1/2)"},
  {value:"Europe/Rome", label:"Europe/Rome — CET/CEST (UTC+1/2)"},
  {value:"Europe/Amsterdam", label:"Europe/Amsterdam — CET/CEST (UTC+1/2)"},
  {value:"Europe/Stockholm", label:"Europe/Stockholm — CET/CEST (UTC+1/2)"},
  {value:"Europe/Warsaw", label:"Europe/Warsaw — CET/CEST (UTC+1/2)"},
  {value:"Europe/Athens", label:"Europe/Athens — EET/EEST (UTC+2/3)"},
  {value:"Europe/Helsinki", label:"Europe/Helsinki — EET/EEST (UTC+2/3)"},
  {value:"Europe/Bucharest", label:"Europe/Bucharest — EET/EEST (UTC+2/3)"},
  {value:"Europe/Moscow", label:"Europe/Moscow — MSK (UTC+3)"},
  {value:"Europe/Istanbul", label:"Europe/Istanbul — TRT (UTC+3)"},
  {value:"Africa/Cairo", label:"Africa/Cairo — EET (UTC+2)"},
  {value:"Africa/Lagos", label:"Africa/Lagos — WAT (UTC+1)"},
  {value:"Africa/Johannesburg", label:"Africa/Johannesburg — SAST (UTC+2)"},
  {value:"Africa/Nairobi", label:"Africa/Nairobi — EAT (UTC+3)"},
  {value:"Asia/Jerusalem", label:"Asia/Jerusalem — IST/IDT (UTC+2/3)"},
  {value:"Asia/Riyadh", label:"Asia/Riyadh — AST (UTC+3)"},
  {value:"Asia/Dubai", label:"Asia/Dubai — GST (UTC+4)"},
  {value:"Asia/Tehran", label:"Asia/Tehran — IRST/IRDT (UTC+3:30/4:30)"},
  {value:"Asia/Karachi", label:"Asia/Karachi — PKT (UTC+5)"},
  {value:"Asia/Kolkata", label:"Asia/Kolkata — IST (UTC+5:30)"},
  {value:"Asia/Dhaka", label:"Asia/Dhaka — BST (UTC+6)"},
  {value:"Asia/Bangkok", label:"Asia/Bangkok — ICT (UTC+7)"},
  {value:"Asia/Ho_Chi_Minh", label:"Asia/Ho_Chi_Minh — ICT (UTC+7)"},
  {value:"Asia/Jakarta", label:"Asia/Jakarta — WIB (UTC+7)"},
  {value:"Asia/Singapore", label:"Asia/Singapore — SGT (UTC+8)"},
  {value:"Asia/Shanghai", label:"Asia/Shanghai — CST (UTC+8)"},
  {value:"Asia/Hong_Kong", label:"Asia/Hong_Kong — HKT (UTC+8)"},
  {value:"Asia/Tokyo", label:"Asia/Tokyo — JST (UTC+9)"},
  {value:"Asia/Seoul", label:"Asia/Seoul — KST (UTC+9)"},
  {value:"Australia/Sydney", label:"Australia/Sydney — AEST/AEDT (UTC+10/11)"},
  {value:"Australia/Melbourne", label:"Australia/Melbourne — AEST/AEDT (UTC+10/11)"},
  {value:"Australia/Brisbane", label:"Australia/Brisbane — AEST (UTC+10)"},
  {value:"Australia/Perth", label:"Australia/Perth — AWST (UTC+8)"},
  {value:"Pacific/Auckland", label:"Pacific/Auckland — NZST/NZDT (UTC+12/13)"},
  {value:"Pacific/Honolulu", label:"Pacific/Honolulu — HST (UTC-10)"},
];

export default function TzSelect({ value, onChange, inputStyle }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const filtered = useMemo(()=>
    TZ_OPTIONS.filter(o=> !query || o.label.toLowerCase().includes(query.toLowerCase()) || o.value.toLowerCase().includes(query.toLowerCase())),
  [query]);
  useEffect(()=>{
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return ()=>document.removeEventListener("mousedown", h);
  },[open]);
  const current = TZ_OPTIONS.find(o=>o.value===value) || {label:value,value};
  return (
    <div ref={ref} style={{position:"relative",flex:1,minWidth:200}}>
      <div onClick={()=>{setOpen(o=>!o);setQuery("");}}
        style={{...inputStyle,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",userSelect:"none"}}>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{current.label}</span>
        <span style={{marginLeft:6,opacity:.5,flexShrink:0}}>▾</span>
      </div>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:9999,
          background:"#12121e",border:"1px solid #3a3a5c",borderRadius:8,
          boxShadow:"0 8px 32px rgba(0,0,0,.6)",overflow:"hidden"}}>
          <div style={{padding:"6px 8px",borderBottom:"1px solid #3a3a5c"}}>
            <input autoFocus placeholder="Search timezone…" value={query}
              onChange={e=>setQuery(e.target.value)}
              style={{width:"100%",background:"transparent",border:"none",outline:"none",
                color:"#e8e8f2",fontSize:12,padding:"2px 4px"}}/>
          </div>
          <div style={{maxHeight:220,overflowY:"auto"}}>
            {filtered.length===0
              ? <div style={{padding:"10px 12px",color:"#5a5a7a",fontSize:12}}>No results</div>
              : filtered.map(o=>(
                <div key={o.value}
                  onClick={()=>{onChange(o.value);setOpen(false);setQuery("");}}
                  style={{padding:"7px 12px",fontSize:12,cursor:"pointer",
                    background:o.value===value?"#A0A0B822":"transparent",
                    color:o.value===value?"#A0A0B8":"#c8c8d8",transition:"background .12s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#ffffff0d"}
                  onMouseLeave={e=>e.currentTarget.style.background=o.value===value?"#A0A0B822":"transparent"}>
                  {o.label}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}
