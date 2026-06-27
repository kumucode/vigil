import { copyText } from "../services/utils";

export default function Step2Body({ timerTick, tokenExpiry, isPublicIp, installToken, decKey, newToken,
  copiedInstall, setCopiedInstall, copiedDecKey, setCopiedDecKey,
  copiedToken, setCopiedToken, copiedCurl, setCopiedCurl,
  activeHost, expired, onGenerateNew, onCancel, onNext, C }) {

  void timerTick;
  const secondsLeft = tokenExpiry
    ? Math.max(0, Math.round((new Date(tokenExpiry) - Date.now()) / 1000))
    : 0;
  const pct        = Math.min(100, (secondsLeft / 300) * 100);
  const timerColor = pct > 40 ? "#1D9E75" : pct > 15 ? "#BA7517" : "#e05c5c";
  const mm         = String(Math.floor(secondsLeft / 60));
  const ss         = String(secondsLeft % 60).padStart(2, "0");

  const svgCopy  = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
  const svgCheck = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;

  const copyStyle = (copied) => ({
    position:"absolute", right:7, top:"50%", transform:"translateY(-50%)",
    background:"none", border:"none", cursor:"pointer", padding:3,
    display:"flex", alignItems:"center",
    color: copied ? "#1D9E75" : (C.muted || "#5a5a7a"),
    transition:"color .2s"
  });
  const fieldBox = {
    background: C.bg, borderRadius:8, padding:"9px 36px 9px 12px",
    fontFamily:"'Space Mono',monospace", fontSize:11,
    border:`1px solid ${C.border}`, position:"relative",
    wordBreak:"break-all", lineHeight:1.6
  };
  const curlCmd = `curl -s ${window.location.origin}/agent/install.sh | bash`;

  const stepLabel = (n, text) => (
    <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:3}}>
      <span style={{color:C.accent,marginRight:6}}>{n}</span>{text}
    </div>
  );

  return (
    <div className="col" style={{gap:14}}>
      {isPublicIp && (
        <div style={{background:"#BA751714",border:"0.5px solid #BA751744",borderRadius:8,
          padding:"9px 12px",display:"flex",gap:8,alignItems:"flex-start"}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#BA7517" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginTop:2}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div style={{fontSize:11,color:"#BA7517",lineHeight:1.6}}>
            Public IP detected. Consider a VPN between this machine and Vigil, and restrict port 7777 to Vigil's IP only.
          </div>
        </div>
      )}
      {expired ? (
        <div style={{background:"#e05c5c14",border:"0.5px solid #e05c5c44",borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:13,fontWeight:600,color:"#e05c5c",marginBottom:6}}>Tokens expired</div>
          <div style={{fontSize:12,color:"#e05c5c",lineHeight:1.6,marginBottom:10}}>
            The tokens are no longer valid. Generate a fresh pair to continue.
          </div>
          <button className="btn btn-p btn-save" onClick={onGenerateNew}>Generate new tokens</button>
        </div>
      ) : (
        <>
          <div>
            {stepLabel("1 ·", `Install the agent on ${activeHost.name}`)}
            <div style={{fontSize:11,color:C.muted,marginBottom:6,lineHeight:1.6}}>
              Run this command on <strong>{activeHost.name}</strong>. The installer will prompt you for the values below.
            </div>
            <div style={fieldBox}>
              {curlCmd}
              <button style={copyStyle(copiedCurl)} onClick={()=>{copyText(curlCmd); setCopiedCurl(true); setTimeout(()=>setCopiedCurl(false),2000);}}>
                {copiedCurl ? svgCheck : svgCopy}
              </button>
            </div>
            {copiedCurl && <div style={{fontSize:10,color:"#1D9E75",marginTop:3}}>Copied!</div>}
          </div>
          <div>
            {stepLabel("2 ·", "Paste when asked for the install token")}
            <div style={fieldBox}>
              {installToken}
              <button style={copyStyle(copiedInstall)} onClick={()=>{copyText(installToken); setCopiedInstall(true); setTimeout(()=>setCopiedInstall(false),2000);}}>
                {copiedInstall ? svgCheck : svgCopy}
              </button>
            </div>
            {copiedInstall && <div style={{fontSize:10,color:"#1D9E75",marginTop:3}}>Copied!</div>}
          </div>
          <div>
            {stepLabel("3 ·", "Paste when asked for the decryption key")}
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>This key is only shown here — it never leaves your device.</div>
            <div style={fieldBox}>
              {decKey}
              <button style={copyStyle(copiedDecKey)} onClick={()=>{copyText(decKey); setCopiedDecKey(true); setTimeout(()=>setCopiedDecKey(false),2000);}}>
                {copiedDecKey ? svgCheck : svgCopy}
              </button>
            </div>
            {copiedDecKey && <div style={{fontSize:10,color:"#1D9E75",marginTop:3}}>Copied!</div>}
          </div>
          <div>
            {stepLabel("4 ·", "Paste when asked for the agent token")}
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>This token stays on your host and authenticates every future request.</div>
            <div style={fieldBox}>
              {newToken}
              <button style={copyStyle(copiedToken)} onClick={()=>{copyText(newToken); setCopiedToken(true); setTimeout(()=>setCopiedToken(false),2000);}}>
                {copiedToken ? svgCheck : svgCopy}
              </button>
            </div>
            {copiedToken && <div style={{fontSize:10,color:"#1D9E75",marginTop:3}}>Copied!</div>}
          </div>
          <div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{fontSize:10,color:C.muted}}>Tokens expire in</span>
              <span style={{fontSize:10,fontWeight:600,color:timerColor}}>{mm}:{ss}</span>
            </div>
            <div style={{height:3,background:C.bg,borderRadius:2,overflow:"hidden",border:`1px solid ${C.border}`}}>
              <div style={{height:"100%",width:`${pct}%`,background:timerColor,borderRadius:2,transition:"width 1s linear,background .5s"}}/>
            </div>
          </div>
        </>
      )}
      <div className="ma">
        <button className="btn btn-g btn-cancel" onClick={onCancel}>Cancel</button>
        <button className="btn btn-p btn-save" disabled={!!expired} onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}
