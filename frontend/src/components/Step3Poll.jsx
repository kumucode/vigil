import { useState, useEffect } from "react";

export default function Step3Poll({ activeHost, setActiveHost, api }) {
  const [polling, setPolling] = useState(!activeHost.cert_fingerprint);
  useEffect(()=>{
    if (!polling) return;
    const iv = setInterval(async ()=>{
      try {
        const hosts = await api("/hosts");
        const h = hosts.find(x=>x.id===activeHost.id);
        if (h && h.cert_fingerprint) {
          setActiveHost(prev=>({...prev, cert_fingerprint: h.cert_fingerprint}));
          setPolling(false);
          clearInterval(iv);
        }
      } catch(_) {}
    }, 3000);
    return ()=>clearInterval(iv);
  }, [polling]);

  if (!polling) return null;
  return (
    <div style={{fontSize:11,color:"#BA7517",display:"flex",alignItems:"center",gap:6,
      background:"#BA751714",border:"0.5px solid #BA751744",borderRadius:7,padding:"8px 11px"}}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#BA7517" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,animation:"spin 1s linear infinite"}}>
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Waiting for the agent to call home… Make sure the agent service started correctly on {activeHost.name}.
    </div>
  );
}
