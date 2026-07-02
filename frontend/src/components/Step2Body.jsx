import { copyText } from "../services/utils";

export default function Step2Body({
  timerTick, tokenExpiry, isPublicIp, installToken, decKey, newToken,
  copiedInstall, setCopiedInstall, copiedDecKey, setCopiedDecKey,
  copiedToken, setCopiedToken, copiedCurl, setCopiedCurl,
  activeHost, expired, onGenerateNew, onCancel, onNext, C,
}) {
  void timerTick;
  const secondsLeft = tokenExpiry
    ? Math.max(0, Math.round((new Date(tokenExpiry) - Date.now()) / 1000))
    : 0;
  const pct        = Math.min(100, (secondsLeft / 300) * 100);
  const timerColor = pct > 40 ? "#1D9E75" : pct > 15 ? "#BA7517" : "#e05c5c";
  const mm         = String(Math.floor(secondsLeft / 60));
  const ss         = String(secondsLeft % 60).padStart(2, "0");

  const SvgCopy  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
  const SvgCheck = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;

  const copyBtn = (copied, onCopy) => ({
    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
    background: copied ? "#1D9E7518" : "none",
    border: copied ? "1px solid #1D9E7540" : "none",
    borderRadius: 6, cursor: "pointer", padding: "4px 8px",
    display: "flex", alignItems: "center", gap: 4,
    color: copied ? "#1D9E75" : (C.muted || "#5a5a7a"),
    fontSize: 11, fontWeight: 600, fontFamily: "'Syne'",
    transition: "all .2s",
  });

  const TokenField = ({ value, copied, setCopied, label, hint }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>
        {label}
      </div>
      {hint && <p style={{ margin: "0 0 8px", fontSize: 13, color: C.muted, lineHeight: 1.55 }}>{hint}</p>}
      <div style={{
        background: C.bg, borderRadius: 10, padding: "12px 48px 12px 16px",
        fontFamily: "'Space Mono',monospace", fontSize: 13, lineHeight: 1.65,
        border: `1px solid ${C.border}`, position: "relative",
        wordBreak: "break-all", color: C.text,
      }}>
        {value}
        <button style={copyBtn(copied, null)}
          onClick={() => { copyText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
          {copied ? <SvgCheck/> : <SvgCopy/>}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );

  const curlCmd = `curl -s ${window.location.origin}/agent/install.sh | bash`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Public IP warning */}
      {isPublicIp && (
        <div style={{
          background: "#BA751714", border: "1px solid #BA751744", borderRadius: 10,
          padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 20,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BA7517" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div style={{ fontSize: 13, color: "#BA7517", lineHeight: 1.65 }}>
            <strong>Public IP detected.</strong> Consider running Vigil and this host on a VPN, and restrict port 7777 to Vigil's IP only.
          </div>
        </div>
      )}

      {expired ? (
        <div style={{
          background: "#e05c5c14", border: "1px solid #e05c5c44", borderRadius: 12,
          padding: "20px 24px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#e05c5c", marginBottom: 8 }}>Tokens expired</div>
          <div style={{ fontSize: 14, color: "#e05c5c", lineHeight: 1.65, marginBottom: 16 }}>
            The 5-minute window has passed. Generate a fresh pair to continue.
          </div>
          <button className="btn btn-primary" onClick={onGenerateNew}>Generate new tokens</button>
        </div>
      ) : (
        <>
          {/* Two-column layout: left = instructions, right = tokens */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginBottom: 24 }}>
            {/* Left: install command */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                1 · Run this on <em style={{ fontStyle: "normal", color: C.accent }}>{activeHost.name}</em>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
                The installer will prompt you for the three tokens on the right.
              </p>
              <div style={{
                background: C.bg, borderRadius: 10, padding: "12px 48px 12px 16px",
                fontFamily: "'Space Mono',monospace", fontSize: 13, lineHeight: 1.65,
                border: `1px solid ${C.border}`, position: "relative",
                wordBreak: "break-all", color: C.text,
              }}>
                {curlCmd}
                <button style={copyBtn(copiedCurl, null)}
                  onClick={() => { copyText(curlCmd); setCopiedCurl(true); setTimeout(() => setCopiedCurl(false), 2000); }}>
                  {copiedCurl ? <SvgCheck/> : <SvgCopy/>}
                  {copiedCurl ? "Copied" : "Copy"}
                </button>
              </div>

              {/* Timer */}
              <div style={{ marginTop: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: C.muted }}>Tokens expire in</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: timerColor, fontFamily: "'Space Mono',monospace" }}>
                    {mm}:{ss}
                  </span>
                </div>
                <div style={{ height: 4, background: C.card, borderRadius: 2, overflow: "hidden", border: `1px solid ${C.border}` }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: timerColor, borderRadius: 2, transition: "width 1s linear, background .5s" }}/>
                </div>
              </div>

              <p style={{ marginTop: 16, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
                Once the installer completes, click <strong style={{ color: C.text }}>Next</strong> to verify the certificate fingerprint.
              </p>
            </div>

            {/* Right: tokens to paste */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>
                2 · Tokens to paste when prompted
              </div>
              <TokenField
                value={installToken}
                copied={copiedInstall} setCopied={setCopiedInstall}
                label="Install token"
                hint="Single-use · expires in 5 minutes"
              />
              <TokenField
                value={decKey}
                copied={copiedDecKey} setCopied={setCopiedDecKey}
                label="Decryption key"
                hint="Never transmitted to the server — stays on your device"
              />
              <TokenField
                value={newToken}
                copied={copiedToken} setCopied={setCopiedToken}
                label="Agent token"
                hint="Authenticates every future request from this host"
              />
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={!!expired} onClick={onNext}>
          Next → Verify certificate
        </button>
      </div>
    </div>
  );
}
