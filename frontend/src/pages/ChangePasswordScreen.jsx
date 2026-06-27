import { useState } from "react";
import { postChangePw } from "../services/api";
import { _contrastOn } from "../services/utils";

const FallbackLogo = ({ size = 80, accent = "#A0A0B8" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5"/>
    <path d="M2 12l10 5 10-5"/>
  </svg>
);

export default function ChangePasswordScreen({ onDone, appName, appLogo, appAccent, C }) {
  appAccent = appAccent || (C && C.accent) || "#A0A0B8";
  const bg      = C ? C.bg      : "#08080f";
  const surface = C ? C.surface : "#10101c";
  const border  = C ? C.border  : "#252538";
  const text    = C ? C.text    : "#e8e8f2";
  const muted   = C ? C.muted   : "#5a5a7a";
  const input   = C ? C.input   : "#0e0e1a";
  const warn    = "#e0c43c";

  const [form, setForm]     = useState({ current:"", next:"", confirm:"" });
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault(); setError("");
    if (form.next !== form.confirm) { setError("Passwords do not match."); return; }
    if (form.next.length < 8)       { setError("Minimum 8 characters."); return; }
    setLoading(true);
    try {
      const r = await postChangePw({ current_password:form.current, new_password:form.next });
      const data = await r.json();
      if (!r.ok) { setError(data.error||"Failed."); return; }
      onDone(data.user);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  };

  const fieldStyle = {
    width:"100%",background:input,border:`1px solid ${border}`,borderRadius:9,
    padding:"11px 14px",fontFamily:"'Space Mono',monospace",fontSize:13,color:text,outline:"none",
    boxSizing:"border-box",
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:bg,fontFamily:"'Syne',sans-serif",padding:20}}>
      <div style={{width:"100%",maxWidth:420,background:surface,border:`1px solid ${appAccent}44`,
        borderRadius:18,padding:36,animation:"su .25s ease"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          {appLogo
            ? <img src={appLogo} alt="logo"
                style={{height:80,width:80,objectFit:"contain",borderRadius:12,marginBottom:12}}/>
            : <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
                <FallbackLogo size={80} accent={appAccent}/>
              </div>}
          <div style={{fontFamily:"'Space Mono',monospace",fontWeight:700,fontSize:18,
            color:appAccent,marginBottom:4}}>{appName || "Vigil"}</div>
          <div style={{fontSize:14,fontWeight:700,color:warn,marginBottom:4}}>
            Set a New Password
          </div>
          <div style={{fontSize:13,color:muted,lineHeight:1.6}}>
            You're using the default password.<br/>Choose a new one to continue.
          </div>
        </div>
        <form onSubmit={submit}>
          {[["Current password","current","current-password"],
            ["New password (min 8 chars)","next","new-password"],
            ["Confirm new password","confirm","new-password"]].map(([label,key,ac])=>(
            <div key={key} style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,textTransform:"uppercase",
                letterSpacing:".8px",color:muted,marginBottom:7}}>{label}</label>
              <input type="password" value={form[key]} autoComplete={ac} style={fieldStyle}
                onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}/>
            </div>
          ))}
          {error&&<div style={{background:"#e05c5c18",border:"1px solid #e05c5c44",borderRadius:8,
            padding:"9px 12px",fontSize:13,color:"#e05c5c",marginBottom:14}}>{error}</div>}
          <button type="submit" disabled={loading||!form.current||!form.next||!form.confirm}
            style={{width:"100%",background:appAccent,color:_contrastOn(appAccent),border:"none",borderRadius:9,
              padding:"12px",fontFamily:"'Syne'",fontWeight:700,fontSize:14,cursor:"pointer",
              opacity:loading||!form.current||!form.next||!form.confirm?0.5:1,transition:"opacity .18s"}}>
            {loading?"Saving…":"Set New Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
