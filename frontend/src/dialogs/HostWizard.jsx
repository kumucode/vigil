import React from "react";
import Step2Body from "../components/Step2Body";
import Step3Poll from "../components/Step3Poll";
import { copyText } from "../services/utils";

// ── Step progress indicator ───────────────────────────────────────────────────
function StepBar({ step, C }) {
  const labels = ["Name & IP", "Install agent", "Verify cert", "Done"];
  return (
    <div style={{ marginBottom: 40 }}>
      {/* Circles + connectors */}
      <div style={{ display: "flex", alignItems: "center" }}>
        {labels.map((_, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <div style={{
                flex: 1, height: 2, borderRadius: 1,
                background: (i + 1) <= step ? C.accent : C.border,
                transition: "background .35s",
              }}/>
            )}
            <div style={{
              width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 17, fontWeight: 700,
              background: (i + 1) < step ? C.accent : C.surface,
              border: `2.5px solid ${(i + 1) <= step ? C.accent : C.border}`,
              color: (i + 1) < step ? "#fff" : (i + 1) === step ? C.accent : C.muted,
              transition: "all .35s",
              boxShadow: (i + 1) === step ? `0 0 0 5px ${C.accent}20` : "none",
            }}>
              {(i + 1) < step
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : (i + 1)}
            </div>
          </React.Fragment>
        ))}
      </div>
      {/* Labels */}
      <div style={{ display: "flex", marginTop: 12 }}>
        {labels.map((l, i) => (
          <div key={i} style={{
            flex: 1,
            textAlign: i === 0 ? "left" : i === 3 ? "right" : "center",
            fontSize: 13, lineHeight: 1.4,
            fontWeight: (i + 1) === step ? 700 : 500,
            color: (i + 1) === step ? C.accent : (i + 1) < step ? C.text : C.muted,
            transition: "color .25s",
            paddingLeft: i === 0 ? 4 : 0, paddingRight: i === 3 ? 4 : 0,
          }}>{l}</div>
        ))}
      </div>
    </div>
  );
}

// ── Reusable close X button ────────────────────────────────────────────────────
const CloseBtn = ({ onClick }) => (
  <button onClick={onClick} className="modal-close" title="Close" aria-label="Close"
    style={{ position: "absolute", top: 20, right: 24, width: 32, height: 32, opacity: 0.6 }}>
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
    </svg>
  </button>
);

// ── Guidance panel (Step 1 right column) ─────────────────────────────────────
function GuidancePanel({ C }) {
  const item = (icon, text) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
      <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>{text}</span>
    </div>
  );
  return (
    <div style={{
      background: C.card, borderRadius: 14, padding: "28px 28px",
      border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 0,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 18, lineHeight: 1.4 }}>
        What is a remote host?
      </div>
      {item("🖥️", "A Linux machine (LXC, VM, or VPS) where your containers are managed via docker-compose.")}
      {item("🔒", "Vigil connects over mutual TLS — all traffic is encrypted and authenticated.")}
      {item("⚡", "After setup, you can trigger updates directly from the Vigil dashboard — no SSH needed.")}
      {item("📁", "The agent only reads and writes within the Allowed Base Path you set here.")}
      <div style={{
        marginTop: 8, padding: "12px 16px", borderRadius: 10,
        background: C.surface, border: `1px solid ${C.border}`,
        fontSize: 13, color: C.muted, lineHeight: 1.65,
      }}>
        <strong style={{ color: C.text }}>Requirements on the remote host:</strong><br/>
        Python 3.9+, systemd, curl, and the vigil-agent.py service installed.
        The installer in step 2 handles everything.
      </div>
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────
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
  // Shared panel style for the wide wizard layout
  const wizardPanel = {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 22,
    padding: "44px 52px 40px",
    width: "100%",
    maxWidth: 1060,
    maxHeight: "88vh",
    overflowY: "auto",
    boxShadow: "0 24px 80px rgba(0,0,0,.16)",
    animation: "su .2s ease",
    position: "relative",
  };

  // Shared form card
  const card = (children, style = {}) => (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: "28px 28px", ...style,
    }}>
      {children}
    </div>
  );

  // Large input override
  const fi = { minHeight: 52, fontSize: 16, padding: "14px 18px" };

  // Section label
  const sectionTitle = (t) => (
    <div style={{ fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 32, letterSpacing: "-.3px" }}>
      {t}
    </div>
  );

  const fLabel = (text, hint) => (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: "block", fontSize: 15, fontWeight: 700, color: C.text, marginBottom: hint ? 4 : 0 }}>
        {text}
      </label>
      {hint && <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.55 }}>{hint}</p>}
    </div>
  );

  return (
    <>
      {/* ══ ADD HOST WIZARD ═══════════════════════════════════════════════════ */}
      {hostModal === "add" && (
        <div className="ov" onClick={e => e.target === e.currentTarget && onClose()}>
          <div style={wizardPanel}>
            <CloseBtn onClick={onClose}/>

            {sectionTitle(
              hostWizardStep === 1 ? "Add remote host" :
              hostWizardStep === 2 ? "Install the agent" :
              hostWizardStep === 3 ? "Verify certificate" :
              "Host connected ✓"
            )}

            <StepBar step={hostWizardStep} C={C}/>

            {/* ── STEP 1: Name & IP ───────────────────────────────────────── */}
            {hostWizardStep === 1 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>
                {/* Left: form */}
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  <div>
                    {fLabel("Host name", "A friendly label — e.g. \"Media LXC\" or \"Bookstack VM\"")}
                    <input className="fi" style={fi} placeholder="e.g. Media LXC" autoFocus
                      value={hostForm.name}
                      onChange={e => setHostForm(f => ({ ...f, name: e.target.value }))}/>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
                    <div>
                      {fLabel("IP address")}
                      <input className="fi" style={fi} placeholder="192.168.1.101"
                        value={hostForm.ip}
                        onChange={e => setHostForm(f => ({ ...f, ip: e.target.value }))}/>
                    </div>
                    <div>
                      {fLabel("Port")}
                      <input className="fi" style={fi} placeholder="7777"
                        value={hostForm.port}
                        onChange={e => setHostForm(f => ({ ...f, port: e.target.value }))}/>
                    </div>
                  </div>
                  <div>
                    {fLabel("Allowed base path", "The agent will only read and write files under this directory.")}
                    <input className="fi" style={fi} placeholder="/home"
                      value={hostForm.allowed_base}
                      onChange={e => setHostForm(f => ({ ...f, allowed_base: e.target.value }))}/>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" style={{ flex: 1 }}
                      disabled={!hostForm.name || !hostForm.ip}
                      onClick={async () => {
                        try {
                          const h = await api("/hosts", { method: "POST", body: JSON.stringify({
                            name: hostForm.name, ip: hostForm.ip,
                            port: parseInt(hostForm.port) || 7777,
                            allowed_base: hostForm.allowed_base || "/home",
                          })});
                          setHosts(hs => [...hs, h]);
                          setActiveHost(h);
                          setNewToken(h.token);
                          try {
                            const t = await api(`/hosts/${h.id}/generate-install-token`, { method: "POST" });
                            setInstallToken(t.install_token);
                            setDecKey(t.dec_key);
                            setTokenExpiry(t.expires_at);
                            setIsPublicIp(t.public_ip || false);
                          } catch(e) {
                            toast("Host created but could not generate install tokens: " + e.message, "error");
                          }
                          setHostWizardStep(2);
                        } catch(e) { toast(e.message || "Failed to create host", "error"); }
                      }}>
                      Next → Install agent
                    </button>
                  </div>
                </div>
                {/* Right: guidance */}
                <GuidancePanel C={C}/>
              </div>
            )}

            {/* ── STEP 2: Install agent ────────────────────────────────────── */}
            {hostWizardStep === 2 && activeHost && (
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
                expired={tokenExpiry && Math.max(0, Math.round((new Date(tokenExpiry) - Date.now()) / 1000)) === 0}
                onGenerateNew={async () => {
                  try {
                    const r = await api(`/hosts/${activeHost.id}/generate-install-token`, { method: "POST" });
                    setInstallToken(r.install_token); setDecKey(r.dec_key);
                    setTokenExpiry(r.expires_at); setIsPublicIp(r.public_ip || false);
                  } catch(e) { toast(e.message || "Failed", "error"); }
                }}
                onCancel={onClose}
                onNext={async () => {
                  setUserFingerprint(""); setFpCompared(false); setFpMatch(false);
                  try {
                    const fresh = await api("/hosts");
                    const h = fresh.find(x => x.id === activeHost.id);
                    if (h) setActiveHost({ ...h, token: activeHost.token });
                  } catch(_) {}
                  setHostWizardStep(3);
                }}
                C={C}
              />
            )}

            {/* ── STEP 3: Verify certificate ───────────────────────────────── */}
            {hostWizardStep === 3 && activeHost && (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <Step3Poll activeHost={activeHost} setActiveHost={setActiveHost} api={api}/>

                <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.65 }}>
                  Paste the fingerprint shown at the end of the installer on{" "}
                  <strong style={{ color: C.text }}>{activeHost.name}</strong>.
                  Vigil has already fetched what the agent is presenting — click{" "}
                  <strong style={{ color: C.text }}>Compare</strong> to check they match exactly.
                </div>

                {/* Fingerprint comparison — two columns */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {card(
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>
                        Your terminal shows
                      </div>
                      <textarea value={userFingerprint}
                        onChange={e => { setUserFingerprint(e.target.value); setFpCompared(false); }}
                        placeholder={"Paste fingerprint here\n\nSHA256:7f:3a:bc:91..."}
                        rows={5}
                        style={{
                          width: "100%", fontFamily: "'Space Mono',monospace", fontSize: 13,
                          resize: "none", padding: "12px 14px", borderRadius: 10,
                          border: `1px solid ${C.border}`, background: C.bg,
                          color: C.text, lineHeight: 1.7, boxSizing: "border-box",
                          minHeight: 120, outline: "none",
                        }}/>
                    </>
                  )}
                  {card(
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>
                        Vigil received from agent
                      </div>
                      <div style={{
                        background: C.bg, borderRadius: 10, padding: "12px 14px",
                        border: `1px solid ${C.border}`, minHeight: 120,
                        fontSize: 13, lineHeight: 1.8, wordBreak: "break-all",
                        display: "flex", alignItems: "flex-start",
                      }}>
                        {activeHost.cert_fingerprint ? (()=> {
                          const cleanFp = s => s.replace(/sha256:/i, "").replace(/\s/g, "").toLowerCase();
                          const segs = cleanFp(activeHost.cert_fingerprint).split(":");
                          const ref  = cleanFp(userFingerprint).split(":");
                          if (!fpCompared) return <span style={{ fontFamily: "'Space Mono',monospace" }}>{activeHost.cert_fingerprint}</span>;
                          return segs.map((seg, i) => {
                            const match = seg === (ref[i] || "");
                            return <span key={i} style={{
                              background: match ? "#1D9E7522" : "#e05c5c22",
                              color: match ? "#1D9E75" : "#e05c5c",
                              padding: "1px 4px", borderRadius: 3,
                              fontFamily: "'Space Mono',monospace",
                            }}>{(i > 0 ? ":" : "") + seg}</span>;
                          });
                        })() : <span style={{ color: C.muted, fontSize: 14 }}>Waiting for agent to connect…</span>}
                      </div>
                    </>
                  )}
                </div>

                {/* Match result banner */}
                {fpCompared && (
                  <div style={{
                    padding: "14px 18px", borderRadius: 10, fontSize: 14, fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 10,
                    background: fpMatch ? "#1D9E7520" : "#e05c5c20",
                    border: `1px solid ${fpMatch ? "#1D9E7540" : "#e05c5c40"}`,
                    color: fpMatch ? "#1D9E75" : "#e05c5c",
                  }}>
                    {fpMatch
                      ? <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Fingerprints match — this is your agent. You may save the host.</>
                      : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Fingerprints do not match — red segments show where they differ. Do not proceed.</>
                    }
                  </div>
                )}

                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, padding: "0 2px" }}>
                  If fingerprints do not match, click Cancel immediately. Do not proceed until you understand the discrepancy.
                </div>

                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                  <button className="btn btn-test"
                    disabled={!userFingerprint.trim()}
                    onClick={() => {
                      const clean = s => s.replace(/sha256:/i, "").replace(/\s/g, "").toLowerCase();
                      const u = clean(userFingerprint);
                      const v = clean(activeHost.cert_fingerprint || "");
                      setFpCompared(true);
                      setFpMatch(u === v && u.length > 0);
                    }}>
                    Compare
                  </button>
                  {fpMatch && (
                    <button className="btn btn-primary"
                      onClick={async () => {
                        try {
                          await api(`/hosts/${activeHost.id}/confirm-tls`, {
                            method: "POST",
                            body: JSON.stringify({ fingerprint: activeHost.cert_fingerprint }),
                          });
                          setHosts(h => h.map(hh => hh.id === activeHost.id
                            ? { ...hh, tls_enabled: true, status: "connected" } : hh));
                          // ✅ BUG FIX: removed stray setHostTestMsg("Connected!") call —
                          // setHostTestMsg is not in HostWizard's props scope; toast + step 4 are sufficient.
                          toast(`✓ TLS enabled for ${activeHost.name}`);
                          setHostWizardStep(4);
                        } catch(e) { toast(e.message || "Failed to confirm TLS", "error"); }
                      }}>
                      Save host ✓
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 4: Done ─────────────────────────────────────────────── */}
            {hostWizardStep === 4 && activeHost && (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* Success banner */}
                <div style={{
                  padding: "18px 24px", borderRadius: 14,
                  background: "rgba(29,158,117,.13)", border: "1px solid rgba(29,158,117,.28)",
                  display: "flex", gap: 12, alignItems: "center",
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "#1D9E75", marginBottom: 3 }}>
                      {activeHost.name} connected with mutual TLS
                    </div>
                    <div style={{ fontSize: 13, color: "#1D9E75", opacity: .85 }}>
                      All traffic between Vigil and this host is now encrypted and authenticated.
                    </div>
                  </div>
                </div>

                {/* Next steps */}
                {card(
                  <>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 16 }}>
                      What to do next
                    </div>
                    {[
                      ["Find an app card", "e.g. Bookstack, Jellyfin, or any service on " + activeHost.name],
                      ["Click "Edit this card"", "Opens the card editor"],
                      ["Set Remote host → " + activeHost.name, "Links the card to this host"],
                      ["Set Install path", "e.g. /home/bookstack/"],
                      ["Set Service name", "e.g. bookstack (must match the compose service key)"],
                      ["Choose Auto-update mode and Save", "Vigil will now be able to trigger updates remotely"],
                    ].map(([step, hint], i) => (
                      <div key={i} style={{
                        display: "flex", gap: 14, alignItems: "flex-start",
                        padding: "10px 0", borderBottom: i < 5 ? `1px solid ${C.border}` : "none",
                      }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                          background: C.accent + "22", color: C.accent,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 13, fontWeight: 700,
                        }}>{i + 1}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>{step}</div>
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{hint}</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-primary" style={{ minWidth: 140 }} onClick={onClose}>Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ EDIT HOST ════════════════════════════════════════════════════════ */}
      {hostModal === "edit" && activeHost && (
        <div className="ov" onClick={e => e.target === e.currentTarget && onClose()}>
          <div className="modal" style={{ maxWidth: 520, padding: "36px 40px 32px" }}>
            <CloseBtn onClick={onClose}/>
            <div className="mt" style={{ marginBottom: 28 }}>Edit host — {activeHost.name}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                {fLabel("Host name")}
                <input className="fi" style={fi} autoFocus value={hostForm.name}
                  onChange={e => setHostForm(f => ({ ...f, name: e.target.value }))}/>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
                <div>
                  {fLabel("IP address")}
                  <input className="fi" style={fi} value={hostForm.ip}
                    onChange={e => setHostForm(f => ({ ...f, ip: e.target.value }))}/>
                </div>
                <div>
                  {fLabel("Port")}
                  <input className="fi" style={fi} value={hostForm.port}
                    onChange={e => setHostForm(f => ({ ...f, port: e.target.value }))}/>
                </div>
              </div>
              <div>
                {fLabel("Allowed base path", "Agent can only read/write files under this directory.")}
                <input className="fi" style={fi} value={hostForm.allowed_base}
                  onChange={e => setHostForm(f => ({ ...f, allowed_base: e.target.value }))}/>
              </div>
            </div>
            <div className="ma" style={{ marginTop: 28 }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={async () => {
                try {
                  const h = await api(`/hosts/${activeHost.id}`, { method: "PATCH", body: JSON.stringify({
                    name: hostForm.name, ip: hostForm.ip,
                    port: parseInt(hostForm.port) || 7777,
                    allowed_base: hostForm.allowed_base || "/home",
                  })});
                  setHosts(hs => hs.map(hh => hh.id === activeHost.id ? { ...h, app_count: hh.app_count } : hh));
                  onClose(); toast("Host updated.");
                } catch(e) { toast(e.message || "Failed to update host", "error"); }
              }}>Save changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ TOKEN REVEAL ════════════════════════════════════════════════════ */}
      {hostModal === "token" && activeHost && (
        <div className="ov" onClick={e => e.target === e.currentTarget && onClose()}>
          <div className="modal" style={{ maxWidth: 520, padding: "36px 40px 32px" }}>
            <CloseBtn onClick={onClose}/>
            <div className="mt" style={{ marginBottom: 10 }}>New token — {activeHost.name}</div>
            <p style={{ fontSize: 14, color: C.muted, marginBottom: 20, lineHeight: 1.65 }}>
              This is the only time this token will be shown. Copy it and update the agent config on{" "}
              <strong style={{ color: C.text }}>{activeHost.name}</strong>.
            </p>
            <div style={{
              background: C.card, borderRadius: 10, padding: "14px 18px",
              border: `1px solid ${C.accent}44`, marginBottom: 18,
              fontFamily: "'Space Mono',monospace", fontSize: 13,
              wordBreak: "break-all", color: C.text, lineHeight: 1.7,
            }}>{newToken}</div>
            <div style={{
              background: C.card, borderRadius: 10, padding: "12px 16px",
              fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 1.75,
              border: `1px solid ${C.border}`,
            }}>
              On the agent host, run:<br/>
              <code style={{ fontFamily: "'Space Mono',monospace", color: C.text }}>
                nano /etc/vigil-agent/config.yml
              </code>
              <br/>Then restart:{" "}
              <code style={{ fontFamily: "'Space Mono',monospace", color: C.text }}>
                systemctl restart vigil-agent
              </code>
            </div>
            <div className="ma">
              <button className="btn btn-secondary"
                style={{ color: copiedToken ? "#1D9E75" : undefined, borderColor: copiedToken ? "#1D9E75" : undefined }}
                onClick={() => { copyText(newToken); setCopiedToken(true); setTimeout(() => setCopiedToken(false), 2000); }}>
                {copiedToken ? "✓ Copied!" : "Copy token"}
              </button>
              <button className="btn btn-primary" onClick={() => { setCopiedToken(false); onClose(); }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
