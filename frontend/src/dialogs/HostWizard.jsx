import React from "react";
import Step2Body from "../components/Step2Body";
import Step3Poll from "../components/Step3Poll";
import { copyText } from "../services/utils";

// ── HostWizard ──────────────────────────────────────────────────────────────
// Remote-agent host management: the 4-step "Add host" wizard (name/IP →
// install agent → verify mTLS fingerprint → done), plus the "Edit host"
// and "New token reveal" modals. `hostModal` (null|"add"|"edit"|"token")
// controls which of the three top-level blocks is shown; `onClose` maps to
// the parent's `setHostModal(null)`.
//
// The wizard's step state (hostWizardStep, hostForm, activeHost, token /
// fingerprint fields) stays owned by App.jsx because it must persist across
// the multi-step flow and is seeded when the host list opens the wizard.
export default function HostWizard({
  hostModal, onClose, api, toast, setHosts, C,
  hostWizardStep, setHostWizardStep,
  hostForm, setHostForm,
  activeHost, setActiveHost,
  newToken, setNewToken,
  installToken, setInstallToken,
  decKey, setDecKey,
  tokenExpiry, setTokenExpiry,
  isPublicIp, setIsPublicIp,
  copiedCurl, setCopiedCurl,
  copiedToken, setCopiedToken,
  copiedInstall, setCopiedInstall,
  copiedDecKey, setCopiedDecKey,
  timerTick,
  userFingerprint, setUserFingerprint,
  fpCompared, setFpCompared,
  fpMatch, setFpMatch,
}) {
  return (
    <>
        {hostModal==="add" && (
          <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
            <div className="modal" style={{maxWidth:500}}>
              <div className="modal-header">
          <div className="mt">Add remote host</div>
          <button className="modal-close" onClick={()=>onClose()} title="Close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>
        </div>
              {/* Step indicator */}
              <div style={{display:"flex",marginBottom:18,borderBottom:`1px solid ${C.border}`}}>
                {[1,2,3,4].map(s=>(
                  <div key={s} style={{flex:1,textAlign:"center",padding:"12px 6px",fontSize:12,fontWeight:600,lineHeight:1.6,
                    borderBottom:`2px solid ${hostWizardStep===s?C.accent:"transparent"}`,
                    color:hostWizardStep===s?C.accent:C.muted,transition:"all .2s",overflow:"visible"}}>
                    {s===1?"1. Name & IP":s===2?"2. Install agent":s===3?"3. Verify cert":"4. Done"}
                  </div>
                ))}
              </div>
    
              {hostWizardStep===1 && (
                <div className="col" style={{gap:12}}>
                  <div className="fg2">
                    <label className="fl">Host name</label>
                    <input className="fi" placeholder="e.g. Media LXC" autoFocus value={hostForm.name}
                      onChange={e=>setHostForm(f=>({...f,name:e.target.value}))}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10}}>
                    <div className="fg2">
                      <label className="fl">IP address</label>
                      <input className="fi" placeholder="192.168.1.101" value={hostForm.ip}
                        onChange={e=>setHostForm(f=>({...f,ip:e.target.value}))}/>
                    </div>
                    <div className="fg2">
                      <label className="fl">Port</label>
                      <input className="fi" placeholder="7777" value={hostForm.port}
                        onChange={e=>setHostForm(f=>({...f,port:e.target.value}))}/>
                    </div>
                  </div>
                  <div className="fg2">
                    <label className="fl">Allowed base path</label>
                    <input className="fi" placeholder="/home" value={hostForm.allowed_base}
                      onChange={e=>setHostForm(f=>({...f,allowed_base:e.target.value}))}/>
                    <p className="fh">Agent can only read/write files under this directory. Default: /home</p>
                  </div>
                  <div className="ma">
                    <button className="btn btn-secondary" onClick={()=>onClose()}>Cancel</button>
                    <button className="btn btn-primary" disabled={!hostForm.name||!hostForm.ip}
                      onClick={async()=>{
                        try {
                          const h = await api("/hosts",{method:"POST",body:JSON.stringify({
                            name:hostForm.name, ip:hostForm.ip,
                            port:parseInt(hostForm.port)||7777,
                            allowed_base:hostForm.allowed_base||"/home",
                          })});
                          setHosts(hs=>[...hs,h]);
                          setActiveHost(h);
                          setNewToken(h.token);
                          // Generate install token + decryption key
                          try {
                            const t = await api(`/hosts/${h.id}/generate-install-token`,{method:"POST"});
                            setInstallToken(t.install_token);
                            setDecKey(t.dec_key);
                            setTokenExpiry(t.expires_at);
                            setIsPublicIp(t.public_ip||false);
                          } catch(e) {
                            toast("Host created but could not generate install tokens: "+e.message,"error");
                          }
                          setHostWizardStep(2);
                        } catch(e) { toast(e.message||"Failed to create host","error"); }
                      }}>Next →</button>
                  </div>
                </div>
              )}
    
              {hostWizardStep===2 && activeHost && (
                <Step2Body
                  timerTick={timerTick}
                  tokenExpiry={tokenExpiry}
                  isPublicIp={isPublicIp}
                  installToken={installToken}
                  decKey={decKey}
                  newToken={newToken}
                  copiedInstall={copiedInstall} setCopiedInstall={setCopiedInstall}
                  copiedDecKey={copiedDecKey} setCopiedDecKey={setCopiedDecKey}
                  copiedToken={copiedToken} setCopiedToken={setCopiedToken}
                  copiedCurl={copiedCurl} setCopiedCurl={setCopiedCurl}
                  activeHost={activeHost}
                  expired={tokenExpiry && Math.max(0,Math.round((new Date(tokenExpiry)-Date.now())/1000))===0}
                  onGenerateNew={async()=>{
                    try {
                      const r = await api(`/hosts/${activeHost.id}/generate-install-token`,{method:"POST"});
                      setInstallToken(r.install_token); setDecKey(r.dec_key);
                      setTokenExpiry(r.expires_at); setIsPublicIp(r.public_ip||false);
                    } catch(e){ toast(e.message||"Failed","error"); }
                  }}
                  onCancel={()=>onClose()}
                  onNext={async()=>{
                    setUserFingerprint(""); setFpCompared(false); setFpMatch(false);
                    // Refresh host to get cert_fingerprint set by agent-provision
                    try {
                      const fresh = await api(`/hosts`);
                      const h = fresh.find(x=>x.id===activeHost.id);
                      if (h) setActiveHost({...h, token: activeHost.token});
                    } catch(_) {}
                    setHostWizardStep(3);
                  }}
                  C={C}
                />
              )}
    
              {hostWizardStep===3 && activeHost && (
                  <div className="col" style={{gap:14}}>
                    <Step3Poll activeHost={activeHost} setActiveHost={setActiveHost} api={api}/>
                    <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>
                      Paste the fingerprint shown at the end of the installer on <strong>{activeHost.name}</strong>.
                      Vigil has already fetched what the agent is presenting. Click Compare — they must match exactly.
                    </div>
    
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>
                          Your terminal shows
                        </div>
                        <textarea value={userFingerprint} onChange={e=>{setUserFingerprint(e.target.value);setFpCompared(false);}}
                          placeholder={"Paste fingerprint here\n\nSHA256:7f:3a:bc:91..."}
                          style={{width:"100%",fontFamily:"'Space Mono',monospace",fontSize:11,resize:"none",
                            padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,
                            background:C.bg,color:C.text,lineHeight:1.7,minHeight:90,boxSizing:"border-box"}}
                          rows={4}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>
                          Vigil received from agent
                        </div>
                        <div style={{background:C.bg,borderRadius:8,padding:"9px 12px",border:`1px solid ${C.border}`,
                          minHeight:90,fontSize:11,lineHeight:1.8,wordBreak:"break-all"}}>
                          {(activeHost.cert_fingerprint||"") ? (()=>{
                            const cleanFp = s => s.replace(/sha256:/i,"").replace(/\s/g,"").toLowerCase();
                            const segs = cleanFp(activeHost.cert_fingerprint||"").split(":");
                            const ref  = cleanFp(userFingerprint).split(":");
                            if (!fpCompared) return <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,wordBreak:"break-all"}}>{activeHost.cert_fingerprint}</span>;
                            return segs.map((seg,i)=>{
                              const match = seg===(ref[i]||"");
                              return <span key={i} style={{background:match?"#1D9E7522":"#e05c5c22",color:match?"#1D9E75":"#e05c5c",padding:"1px 3px",borderRadius:2,fontFamily:"'Space Mono',monospace",fontSize:11}}>{(i>0?":":"")+seg}</span>;
                            });
                          })() : <span style={{color:C.muted}}>Waiting for agent to connect…</span>}
                        </div>
                      </div>
                    </div>
    
                    {fpCompared && (
                      <div style={{padding:"10px 13px",borderRadius:8,fontSize:12,fontWeight:600,
                        display:"flex",alignItems:"center",gap:8,
                        background: fpMatch ? "#1D9E7522" : "#e05c5c22",
                        border: `0.5px solid ${fpMatch?"#1D9E7544":"#e05c5c44"}`,
                        color: fpMatch ? "#1D9E75" : "#e05c5c"}}>
                        {fpMatch
                          ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Fingerprints match — this is your agent. You may save the host.</>
                          : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Fingerprints do not match — red segments show where they differ. Do not proceed.</>
                        }
                      </div>
                    )}
    
                    <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>
                      If fingerprints do not match, click Cancel immediately. Do not proceed until you understand the discrepancy.
                    </div>
    
                    <div className="ma">
                      <button className="btn btn-secondary" onClick={()=>onClose()}>Cancel</button>
                      <button className="btn btn-secondary" disabled={!userFingerprint.trim()} onClick={()=>{
                        const clean = s => s.replace(/sha256:/i,"").replace(/\s/g,"").toLowerCase();
                        const u = clean(userFingerprint);
                        const v = clean(activeHost.cert_fingerprint||"");
                        setFpCompared(true);
                        setFpMatch(u===v && u.length>0);
                      }}>Compare</button>
                      {fpMatch && (
                        <button className="btn btn-primary"
                          onClick={async()=>{
                            try {
                              await api(`/hosts/${activeHost.id}/confirm-tls`,{method:"POST",
                                body:JSON.stringify({fingerprint:activeHost.cert_fingerprint})});
                              setHosts(h=>h.map(hh=>hh.id===activeHost.id?{...hh,tls_enabled:true,status:"connected"}:hh));
                              setHostTestMsg("Connected!");
                              toast(`✓ TLS enabled for ${activeHost.name}`);
                              setHostWizardStep(4);
                            } catch(e){ toast(e.message||"Failed to confirm TLS","error"); }
                          }}>
                          Save host ✓
                        </button>
                      )}
                    </div>
                  </div>
              )}
    
              {hostWizardStep===4 && activeHost && (
                <div className="col" style={{gap:14}}>
                  <div style={{padding:"12px 14px",borderRadius:8,background:"rgba(29,158,117,.13)",border:"0.5px solid rgba(29,158,117,.27)",
                    display:"flex",gap:8,alignItems:"center"}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <div style={{fontSize:13,fontWeight:600,color:"#1D9E75"}}>
                      {activeHost.name} connected with mutual TLS
                    </div>
                  </div>
                  <div style={{background:C.bg,borderRadius:8,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.accent,textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>What to do next</div>
                    <div style={{fontSize:12,color:C.muted,lineHeight:1.8}}>
                      <div>1. Find the app card you want to manage (e.g. Bookstack)</div>
                      <div>2. Click <strong style={{color:C.text}}>Edit this card</strong></div>
                      <div>3. Scroll to <strong style={{color:C.text}}>Remote host</strong> → pick <strong style={{color:C.text}}>{activeHost.name}</strong></div>
                      <div>4. Set <strong style={{color:C.text}}>Install path</strong> → e.g. <span style={{fontFamily:"'Space Mono',monospace",fontSize:11}}>/home/bookstack/</span></div>
                      <div>5. Set <strong style={{color:C.text}}>Service name</strong> → e.g. <span style={{fontFamily:"'Space Mono',monospace",fontSize:11}}>bookstack</span></div>
                      <div>6. Choose <strong style={{color:C.text}}>Auto-update</strong> mode and hit Save</div>
                    </div>
                  </div>
                  <div className="ma">
                    <button className="btn btn-primary" onClick={()=>onClose()}>Done</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
    
        {/* ══ Edit host modal ═══════════════════════════════════════════════════ */}
        {hostModal==="edit" && activeHost && (
          <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
            <div className="modal" style={{maxWidth:460}}>
              <div className="mt">Edit host — {activeHost.name}</div>
              <div className="col" style={{gap:12}}>
                <div className="fg2">
                  <label className="fl">Host name</label>
                  <input className="fi" autoFocus value={hostForm.name}
                    onChange={e=>setHostForm(f=>({...f,name:e.target.value}))}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10}}>
                  <div className="fg2">
                    <label className="fl">IP address</label>
                    <input className="fi" value={hostForm.ip}
                      onChange={e=>setHostForm(f=>({...f,ip:e.target.value}))}/>
                  </div>
                  <div className="fg2">
                    <label className="fl">Port</label>
                    <input className="fi" value={hostForm.port}
                      onChange={e=>setHostForm(f=>({...f,port:e.target.value}))}/>
                  </div>
                </div>
                <div className="fg2">
                  <label className="fl">Allowed base path</label>
                  <input className="fi" value={hostForm.allowed_base}
                    onChange={e=>setHostForm(f=>({...f,allowed_base:e.target.value}))}/>
                  <p className="fh">Agent can only read/write files under this directory.</p>
                </div>
              </div>
              <div className="ma">
                <button className="btn btn-secondary" onClick={()=>onClose()}>Cancel</button>
                <button className="btn btn-primary" onClick={async()=>{
                  try {
                    const h = await api(`/hosts/${activeHost.id}`,{method:"PATCH",body:JSON.stringify({
                      name:hostForm.name, ip:hostForm.ip,
                      port:parseInt(hostForm.port)||7777,
                      allowed_base:hostForm.allowed_base||"/home",
                    })});
                    setHosts(hs=>hs.map(hh=>hh.id===activeHost.id?{...h,app_count:hh.app_count}:hh));
                    onClose(); toast("Host updated.");
                  } catch(e) { toast(e.message||"Failed to update host","error"); }
                }}>Save</button>
              </div>
            </div>
          </div>
        )}
    
        {/* ══ Token reveal modal (after regenerate) ════════════════════════════ */}
        {hostModal==="token" && activeHost && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",
            alignItems:"center",justifyContent:"center",zIndex:3000,padding:20}}>
            <div className="modal" style={{maxWidth:460}}>
              <div className="mt">New token — {activeHost.name}</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:12}}>
                This is the only time this token will be shown. Copy it and update the agent config on {activeHost.name}.
              </div>
              <div style={{background:"#185FA522",borderRadius:8,padding:"12px 14px",border:`1px solid ${C.accent}44`,marginBottom:14}}>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:12,wordBreak:"break-all",color:C.text}}>{newToken}</div>
              </div>
              <div style={{background:C.bg,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.muted,marginBottom:14}}>
                On the agent host, run:<br/>
                <span style={{fontFamily:"'Space Mono',monospace",color:C.text}}>
                  nano /etc/vigil-agent/config.yml
                </span>
                <br/>Then restart: <span style={{fontFamily:"'Space Mono',monospace",color:C.text}}>systemctl restart vigil-agent</span>
              </div>
              <div className="ma">
                <button onClick={()=>{
                  copyText(newToken);
                  setCopiedToken(true); setTimeout(()=>setCopiedToken(false),2000);
                }}
                  className="btn btn-secondary" style={{display:"flex",alignItems:"center",gap:6,
                    color:copiedToken?"#1D9E75":undefined, borderColor:copiedToken?"#1D9E75":undefined,
                    transition:"color .2s,border-color .2s"}}>
                  {copiedToken
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  }
                  {copiedToken ? "Copied!" : "Copy token"}
                </button>
                <button className="btn btn-primary" onClick={()=>{ setCopiedToken(false); onClose(); }}>Done</button>
              </div>
            </div>
          </div>
        )}

    </>
  );
}
