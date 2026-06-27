import { useState } from "react";
import { _contrastOn } from "../services/utils";
import { postLogin, postTotpLogin, postTotpBackup } from "../services/api";

const LogoSVG = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5"/>
    <path d="M2 12l10 5 10-5"/>
  </svg>
);

export default function LoginScreen({ onLogin, appName, appLogo, appAccent, C }) {
  appAccent = appAccent || (C && C.accent) || "#A0A0B8";
  // Fallback C for when theme hasn't loaded yet
  const bg      = C ? C.bg      : "#08080f";
  const surface = C ? C.surface : "#10101c";
  const border  = C ? C.border  : "#252538";
  const text    = C ? C.text    : "#e8e8f2";
  const muted   = C ? C.muted   : "#5a5a7a";
  const input   = C ? C.input   : "#0e0e1a";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [totpStep, setTotpStep] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);

  const submit = async e => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const r = await postLogin({ username, password });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Login failed."); return; }
      if (data.totp_required) { setTotpStep(true); return; }
      onLogin(data.user);
    } catch { setError("Network error — is the server running?"); }
    finally { setLoading(false); }
  };

  const fieldStyle = {
    width:"100%",background:input,border:`1px solid ${border}`,borderRadius:9,
    padding:"11px 14px",fontFamily:"'Space Mono',monospace",fontSize:13,
    color:text,outline:"none",boxSizing:"border-box",
  };
  const labelStyle = {
    display:"block",fontSize:11,fontWeight:700,textTransform:"uppercase",
    letterSpacing:".8px",color:muted,marginBottom:7,
  };

  return (
    <div style={{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:bg,fontFamily:"'Syne',sans-serif",padding:20 }}>
      <div style={{ width:"100%",maxWidth:400,background:surface,border:`1px solid ${border}`,
        borderRadius:18,padding:36,animation:"su .25s ease" }}>
        <div style={{ textAlign:"center",marginBottom:28 }}>
          {appLogo
            ? <img src={appLogo} alt="logo" style={{height:144,width:144,objectFit:"contain",borderRadius:16,marginBottom:16}}/>
            : <div style={{ display:"flex",justifyContent:"center",marginBottom:16,color:appAccent }}><LogoSVG size={144}/></div>}
          <div style={{ fontFamily:"'Space Mono',monospace",fontWeight:700,fontSize:22,color:appAccent }}>
            {appName || "Vigil"}
          </div>
          <div style={{ fontSize:12,color:muted,marginTop:4 }}>
            {totpStep ? "Two-factor authentication" : "Sign in to continue"}
          </div>
        </div>

        {!totpStep ? (
          <form onSubmit={submit}>
            <div style={{marginBottom:14}}>
              <label style={labelStyle}>Username</label>
              <input value={username} onChange={e=>setUsername(e.target.value)} autoFocus
                placeholder="admin" autoComplete="username" style={fieldStyle}/>
            </div>
            <div style={{marginBottom:20}}>
              <label style={labelStyle}>Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password" style={fieldStyle}/>
            </div>
            {error && <div style={{background:"#e05c5c18",border:"1px solid #e05c5c44",borderRadius:8,
              padding:"9px 12px",fontSize:13,color:"#e05c5c",marginBottom:16}}>{error}</div>}
            <button type="submit" disabled={loading||!username||!password}
              style={{width:"100%",background:appAccent,color:_contrastOn(appAccent),border:"none",borderRadius:9,
                padding:"12px",fontFamily:"'Syne'",fontWeight:700,fontSize:14,cursor:"pointer",
                opacity:(loading||!username||!password)?0.5:1,transition:"opacity .18s"}}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
            <div style={{marginTop:18,fontSize:11,color:muted,textAlign:"center",lineHeight:1.6}}>
              Default: <code style={{background:surface,padding:"1px 6px",borderRadius:4,border:`1px solid ${border}`}}>admin</code> / <code style={{background:surface,padding:"1px 6px",borderRadius:4,border:`1px solid ${border}`}}>admin</code>
            </div>
          </form>
        ) : (
          <form onSubmit={async e=>{
            e.preventDefault(); setLoading(true); setError("");
            const submitTotp = useBackup ? postTotpBackup : postTotpLogin;
            try {
              const r = await submitTotp({ code: totpCode });
              const data = await r.json();
              if (!r.ok) { setError(data.error || "Invalid code."); setTotpCode(""); return; }
              onLogin(data.user);
            } catch { setError("Network error."); }
            finally { setLoading(false); }
          }}>
            <div style={{textAlign:"center",marginBottom:20,fontSize:13,color:muted,lineHeight:1.6}}>
              {useBackup
                ? <>Enter one of your <strong style={{color:text}}>backup codes</strong> to sign in.</>
                : <>Open your authenticator app and enter the 6-digit code for <strong style={{color:text}}>Vigil</strong>.</>}
            </div>
            <div style={{marginBottom:20}}>
              <label style={labelStyle}>{useBackup ? "Backup Code" : "Authenticator Code"}</label>
              {useBackup
                ? <input value={totpCode}
                    onChange={e=>setTotpCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,"").slice(0,11))}
                    autoFocus placeholder="XXXXX-XXXXX" autoComplete="off"
                    style={{...fieldStyle,textAlign:"center",fontSize:18,letterSpacing:"0.15em"}}/>
                : <input value={totpCode} onChange={e=>setTotpCode(e.target.value.replace(/\D/g,"").slice(0,6))}
                    autoFocus placeholder="000000" autoComplete="one-time-code" inputMode="numeric"
                    style={{...fieldStyle,textAlign:"center",fontSize:24,letterSpacing:"0.3em"}}/>}
            </div>
            {error && <div style={{background:"#e05c5c18",border:"1px solid #e05c5c44",borderRadius:8,
              padding:"9px 12px",fontSize:13,color:"#e05c5c",marginBottom:16}}>{error}</div>}
            <button type="submit"
              disabled={loading||(useBackup ? totpCode.replace(/-/g,"").length!==10 : totpCode.length!==6)}
              style={{width:"100%",background:appAccent,color:_contrastOn(appAccent),border:"none",borderRadius:9,
                padding:"12px",fontFamily:"'Syne'",fontWeight:700,fontSize:14,cursor:"pointer",
                opacity:(loading||(useBackup?totpCode.replace(/-/g,"").length!==10:totpCode.length!==6))?0.5:1,
                transition:"opacity .18s"}}>
              {loading ? "Verifying..." : "Sign In"}
            </button>
            <button type="button"
              onClick={()=>{setUseBackup(u=>!u);setTotpCode("");setError("");}}
              style={{width:"100%",marginTop:8,background:"none",border:`1px solid ${border}`,borderRadius:9,
                color:muted,fontSize:12,cursor:"pointer",fontFamily:"'Syne'",padding:"9px"}}>
              {useBackup ? "← Use authenticator app instead" : "Use a backup code instead"}
            </button>
            <button type="button" onClick={()=>{setTotpStep(false);setTotpCode("");setError("");setUseBackup(false);}}
              style={{width:"100%",marginTop:8,background:"none",border:"none",color:muted,
                fontSize:13,cursor:"pointer",fontFamily:"'Syne'",padding:"6px"}}>
              ← Back to login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
