import React from "react";
import Icon from "../components/Icon";
import LogoSVG from "../components/LogoSVG";
import Tooltip from "../components/Tooltip";
import TzSelect from "../components/TzSelect";
import AccentColorPicker from "../components/AccentColorPicker";
import ChannelPill, { CHANNEL_META } from "../components/ChannelPill";
import { copyText, CSS_TEMPLATE } from "../services/utils";

// ── SettingsDialog ────────────────────────────────────────────────────────
// The 7-tab Settings modal (modal==="settings"): Notifications, Telegram
// integrations, Appearance, Branding, Agents, Security (incl. TOTP/2FA +
// backup codes reveal), and System. Also renders the backup-codes reveal
// modal, which is part of the Security tab's TOTP flow and shares
// `backupCodes`/`setBackupCodes` with it.
//
// Settings form state (`settings`/`setSettings`), Telegram test state,
// branding/accent state, password/username change forms, TOTP setup state,
// and the agent-hosts list all remain owned by App.jsx because they're
// loaded on bootstrap and/or shared with other parts of the app (e.g. the
// Agents tab launches HostWizard via the shared hostModal/hostForm state).
export default function SettingsDialog({
  open, onClose, C, api, toast,
  settingsTab, setSettingsTab,
  settings, setSettings, saveSettings,
  schedulerStatus,

  // Telegram / integrations
  showChatId, setShowChatId,
  tgTesting, setTgTesting, tgTestMsg, setTgTestMsg,
  telegramSet, clearTelegram,

  // Branding
  logoFileRef, setAppAccent, changePreset, toggleDark,

  // Security: change username / password
  currentUser, setCurrentUser,
  cuForm, setCuForm, cuError, submitChangeUsername,
  cpForm, setCpForm, cpError, submitChangePw,

  // Security: TOTP / 2FA
  regenPw, setRegenPw,
  totpError, setTotpError,
  totpDisablePw, setTotpDisablePw,
  totpLoading, setTotpLoading,
  totpSetup, setTotpSetup,
  totpConfirmCode, setTotpConfirmCode,
  backupCodes, setBackupCodes,

  // Agents / hosts
  hosts, setHosts, caReady,
  hostTesting, setHostTesting, hostTestMsg, setHostTestMsg,
  setActiveHost, setHostForm, setHostWizardStep, setNewToken, setHostModal,
  setInstallToken, setDecKey, setTokenExpiry, setIsPublicIp,
}) {
  return (
    <>
        {open && (
          <div className="sw" onClick={e=>e.target===e.currentTarget&&onClose()}>
            <div className="sw-panel">

              {/* ── Workspace header ── */}
              <div className="sw-header">
                <div className="sw-title">Settings</div>
                <button className="modal-close" style={{position:"static",opacity:.55}}
                  onClick={()=>onClose()} title="Close" aria-label="Close settings">
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
                </button>
              </div>

              {/* ── Body: sidebar + content ── */}
              <div className="sw-body">

                {/* ── Left sidebar nav ── */}
                <nav className="sw-sidebar" aria-label="Settings navigation">
                  {[
                    ["notifications","Notifications","bell"],
                    ["integrations","Telegram","mail"],
                    ["appearance","Appearance","code"],
                    ["branding","Branding","image"],
                    ["agents","Agents","server"],
                    ["security","Security","lock"],
                    ["system","System","settings"],
                  ].map(([t,l,icon])=>(
                    <button key={t}
                      className={`sw-nav${settingsTab===t?" on":""}`}
                      onClick={()=>{setSettingsTab(t);if(t!=="integrations"){setShowChatId(false);setTgTesting("idle");setTgTestMsg("");}}}
                      aria-current={settingsTab===t?"page":undefined}>
                      <span className="sw-dot"/>
                      {l}
                    </button>
                  ))}
                </nav>

                {/* ── Content area ── */}
                <div className="sw-content">
    
              {settingsTab==="notifications" && (
                <>
                  {/* ── Schedule mode selector ──────────────────────────────── */}
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                    padding:"18px 20px",marginBottom:20}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14,lineHeight:1.45}}>Notification Schedule</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {[
                        {v:"immediate", label:"Immediate", desc:"One per update"},
                        {v:"interval",  label:"Batched",   desc:"Grouped digest"},
                        {v:"daily",     label:"Daily",     desc:"Once per day"},
                        {v:"weekly",    label:"Weekly",    desc:"Custom schedule"},
                      ].map(({v,label,desc})=>{
                        const sel = settings.digest_mode===v;
                        return (
                          <button key={v} onClick={()=>setSettings(s=>({...s,digest_mode:v}))}
                            style={{padding:"9px 16px",borderRadius:10,fontFamily:"'Syne'",fontWeight:700,
                              fontSize:12,cursor:"pointer",border:"1px solid",transition:"all .15s",
                              background:sel?C.accent+"22":"transparent",
                              color:sel?C.accent:C.muted,
                              borderColor:sel?C.accent:C.border,
                              minWidth:80,textAlign:"center"}}>
                            <div>{label}</div>
                            <div style={{fontSize:10,fontWeight:400,opacity:.7,marginTop:1}}>{desc}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Interval hours */}
                    {settings.digest_mode==="interval" && (
                      <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.border}`}}>
                        <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:8}}>Send every</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {[1,2,3,4,6,8,12].map(h=>{
                            const sel = settings.digest_interval_hours===String(h);
                            return (
                              <button key={h} onClick={()=>setSettings(s=>({...s,digest_interval_hours:String(h)}))}
                                style={{padding:"5px 14px",borderRadius:7,fontFamily:"'Syne'",fontWeight:700,
                                  fontSize:11,cursor:"pointer",border:"1px solid",transition:"all .15s",
                                  background:sel?C.accent+"22":"transparent",
                                  color:sel?C.accent:C.muted,borderColor:sel?C.accent:C.border}}>
                                {h===1?"1 hour":`${h}h`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Daily time + tz */}
                    {settings.digest_mode==="daily" && (
                      <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.border}`}}>
                        <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:8}}>Time and timezone</div>
                        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                          <input type="time" value={settings.digest_time||"09:00"}
                            onChange={e=>setSettings(s=>({...s,digest_time:e.target.value}))}
                            style={{background:C.input,border:`1px solid ${C.border}`,borderRadius:7,
                              color:C.text,padding:"7px 12px",fontFamily:"'Space Mono',monospace",
                              fontSize:13,outline:"none",cursor:"pointer",lineHeight:1.5}}/>
                          <TzSelect value={settings.digest_timezone||"UTC"}
                            onChange={v=>setSettings(s=>({...s,digest_timezone:v}))}
                            inputStyle={{background:C.input,border:`1px solid ${C.border}`,borderRadius:7,
                              color:C.text,padding:"7px 12px",fontSize:12,lineHeight:1.5}}/>
                        </div>
                      </div>
                    )}

                    {/* Weekly days grid + time */}
                    {settings.digest_mode==="weekly" && (
                      <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.border}`}}>
                        <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:8}}>Days</div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
                          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d,i)=>{
                            const sel=(settings.digest_day||"").split(",").map(s=>s.trim()).includes(String(i));
                            return (
                              <button key={i}
                                onClick={()=>setSettings(s=>{
                                  const days=new Set((s.digest_day||"").split(",").map(x=>x.trim()).filter(Boolean));
                                  if(days.has(String(i)))days.delete(String(i));else days.add(String(i));
                                  return {...s,digest_day:[...days].sort().join(",")};
                                })}
                                style={{padding:"6px 0",borderRadius:7,fontFamily:"'Syne'",fontWeight:700,
                                  fontSize:11,cursor:"pointer",border:"1px solid",transition:"all .15s",
                                  textAlign:"center",
                                  background:sel?C.accent+"22":"transparent",
                                  color:sel?C.accent:C.muted,
                                  borderColor:sel?C.accent:C.border}}>{d}</button>
                            );
                          })}
                        </div>
                        <div style={{fontSize:12,fontWeight:600,color:C.muted,marginTop:14,marginBottom:8}}>Time and timezone</div>
                        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                          <input type="time" value={settings.digest_time||"09:00"}
                            onChange={e=>setSettings(s=>({...s,digest_time:e.target.value}))}
                            style={{background:C.input,border:`1px solid ${C.border}`,borderRadius:7,
                              color:C.text,padding:"7px 12px",fontFamily:"'Space Mono',monospace",
                              fontSize:13,outline:"none",cursor:"pointer",lineHeight:1.5}}/>
                          <TzSelect value={settings.digest_timezone||"UTC"}
                            onChange={v=>setSettings(s=>({...s,digest_timezone:v}))}
                            inputStyle={{background:C.input,border:`1px solid ${C.border}`,borderRadius:7,
                              color:C.text,padding:"7px 12px",fontSize:12,lineHeight:1.5}}/>
                        </div>
                      </div>
                    )}

                  </div>

                  {/* ── Notification Summary — dedicated box below schedule ── */}
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                    padding:"18px 20px",marginBottom:20}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
                      <div>
                        <div style={{fontSize:14,fontWeight:700,color:C.text,lineHeight:1.5,marginBottom:4}}>
                          Notification Summary
                        </div>
                        <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>
                          After each check run, send a Telegram summary with outdated, up-to-date, and error counts.
                        </div>
                      </div>
                      <div onClick={()=>setSettings(s=>({...s,scan_summary_notify:s.scan_summary_notify==="on"?"off":"on"}))}
                        role="switch" aria-checked={settings.scan_summary_notify==="on"}
                        style={{width:42,height:24,borderRadius:12,cursor:"pointer",transition:"background .2s",flexShrink:0,
                          background:settings.scan_summary_notify==="on"?"#7BA67A":"#3a3a5c",position:"relative"}}>
                        <div style={{position:"absolute",top:4,left:settings.scan_summary_notify==="on"?20:4,
                          width:16,height:16,borderRadius:"50%",background:"#fff",
                          transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
                      </div>
                    </div>
                    {settings.scan_summary_notify==="on" && (!telegramSet || !settings.telegram_chat_id) && (
                      <div className="warn-banner" style={{marginTop:12,lineHeight:1.55}}>
                        Telegram is not configured — go to the <strong>Telegram</strong> tab to add your Bot Token and Chat ID.
                      </div>
                    )}
                  </div>

                  {/* ── Message Template ────────────────────────────────────── */}
                  {(()=>{
                    const isImmediate = settings.digest_mode === "immediate";
                    const tmplKey   = isImmediate ? "notify_template"  : "digest_template";
                    const tmplVal   = isImmediate ? (settings.notify_template||"") : (settings.digest_template||"");
                    const tmplPlaceholder = isImmediate
                      ? `🐿️ *Update: {name}*\nCurrent: \`{version}\`  →  Latest: \`{latest}\`\nBump: \`{bump_type}\` · Source: {channel}\n\`{image}\``
                      : `🐿️ *Vigil — {count} update(s) available*\n\n{list}\n\n_{date}_`;
                    const varsTip = isImmediate
                      ? "Variables: {name} {image} {version} {latest} {bump_type} {channel}. Markdown supported."
                      : "Variables: {count} {list} {names} {date}. Markdown supported.";
                    const renderMd = t => t
                      .replace(/\*([^*]+)\*/g,"<strong>$1</strong>")
                      .replace(/_([^_]+)_/g,"<em>$1</em>")
                      .replace(/`([^`]+)`/g,"<code style=\"background:#1a1a2e;padding:1px 5px;border-radius:3px;font-family:monospace\">$1</code>");
                    let preview = "";
                    if (isImmediate) {
                      const tmpl = tmplVal || tmplPlaceholder;
                      const s = {name:"Audiobookshelf",image:"advplyr/audiobookshelf",version:"2.35.0",latest:"2.35.1",bump_type:"patch",channel:"ghcr.io"};
                      preview = tmpl.replace(/\{name\}/g,s.name).replace(/\{image\}/g,s.image)
                        .replace(/\{version\}/g,s.version).replace(/\{latest\}/g,s.latest)
                        .replace(/\{bump_type\}/g,s.bump_type).replace(/\{channel\}/g,s.channel);
                    } else {
                      const tmpl = tmplVal || tmplPlaceholder;
                      const sampleList="• *Audiobookshelf*: `2.35.0` → `2.35.1`\n• *Navidrome*: `0.52.0` → `0.53.3`";
                      const sampleNames="• Audiobookshelf\n• Navidrome";
                      preview=tmpl.replace(/\{count\}/g,"2").replace(/\{list\}/g,sampleList).replace(/\{names\}/g,sampleNames).replace(/\{date\}/g,new Date().toISOString().slice(0,10));
                    }
                    return (
                      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                        padding:"18px 20px",marginBottom:4}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
                          <span style={{fontSize:13,fontWeight:700,color:C.text}}>Message Template</span>
                          <span style={{fontSize:11,color:C.muted,fontWeight:400}}>optional — leave blank for default</span>
                          <Tooltip text={varsTip}>
                            <span style={{fontSize:12,color:C.muted,cursor:"help",marginLeft:2}}>ⓘ</span>
                          </Tooltip>
                        </div>
                        <textarea className="fi" rows={5} placeholder={tmplPlaceholder}
                          value={tmplVal}
                          onChange={e=>setSettings(s=>({...s,[tmplKey]:e.target.value}))}
                          style={{fontFamily:"'Space Mono',monospace",fontSize:12,lineHeight:1.6,resize:"vertical",
                            width:"100%",boxSizing:"border-box"}}/>
                        <div style={{marginTop:12}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                            <span style={{fontSize:10,fontWeight:700,textTransform:"uppercase",
                              letterSpacing:".8px",color:C.muted}}>Live Preview</span>
                            <span style={{fontSize:9,padding:"1px 7px",borderRadius:999,
                              background:C.hover,color:C.muted,border:`1px solid ${C.border}`,fontWeight:600}}>
                              Sample data
                            </span>
                          </div>
                          <div style={{background:C.input,border:`1px solid ${C.border}`,borderRadius:8,
                            padding:"12px 14px",fontSize:13,lineHeight:1.7,whiteSpace:"pre-wrap",color:C.text}}
                            dangerouslySetInnerHTML={{__html:renderMd(preview)}}/>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
    
              {settingsTab==="integrations" && (
                <>
                  {/* ── Header card with security note ── */}
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                    padding:"18px 20px",marginBottom:20}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                      <div style={{width:32,height:32,borderRadius:8,background:"rgba(60,224,140,.1)",
                        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <Icon name="lock" size={15} color={C.iconSecondary}/>
                      </div>
                      <div>
                        <div style={{fontSize:14,fontWeight:700,color:C.text,lineHeight:1.45}}>Telegram Notifications</div>
                        <div style={{fontSize:12,color:C.muted,opacity:.68,marginTop:1,lineHeight:1.5}}>
                          Bot token is encrypted at rest and never returned to the browser.
                        </div>
                      </div>
                    </div>
                    {/* Status row */}
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                      padding:"10px 12px",borderRadius:8,background:C.surface,
                      border:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{width:7,height:7,borderRadius:"50%",
                          background:telegramSet?"#7BA67A":C.muted,flexShrink:0}}/>
                        <span style={{fontSize:13,color:telegramSet?"#7BA67A":C.muted,fontWeight:600}}>
                          {telegramSet?"Telegram configured":"Not configured"}
                        </span>
                      </div>
                      {telegramSet && (
                        <button className="btn btn-danger btn-sm"
                          onClick={clearTelegram}>
                          Remove Configuration
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Token input ── */}
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                    padding:"18px 20px",marginBottom:20}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14,lineHeight:1.45}}>
                      {telegramSet?"Replace Bot Token":"Bot Token"}
                    </div>
                    <input className="fi" type="password"
                      placeholder={telegramSet?"Paste new token to replace…":"123456789:AABBCCDDEEFFaabbccddeeff"}
                      value={settings.telegram_token||""}
                      onChange={e=>setSettings(s=>({...s,telegram_token:e.target.value}))}
                      style={{lineHeight:1.6}}/>
                    <p style={{fontSize:12,color:C.muted,opacity:.68,marginTop:6,lineHeight:1.6}}>
                      Create a bot via <strong>@BotFather</strong> on Telegram, then paste the token here.
                    </p>

                    <div style={{fontSize:13,fontWeight:700,color:C.text,marginTop:16,marginBottom:10,lineHeight:1.5}}>Chat ID</div>
                    <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                      <input className="fi" type={showChatId?"text":"password"}
                        placeholder="Your Telegram user or group ID"
                        value={settings.telegram_chat_id}
                        onChange={e=>setSettings(s=>({...s,telegram_chat_id:e.target.value}))}
                        style={{paddingRight:40,lineHeight:1.6}}/>
                      <button title={showChatId?"Hide Chat ID":"Show Chat ID"}
                        onClick={()=>setShowChatId(v=>!v)}
                        style={{position:"absolute",right:10,background:"none",border:"none",
                          cursor:"pointer",color:C.muted,padding:4,display:"flex",alignItems:"center"}}>
                        {showChatId
                          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        }
                      </button>
                    </div>
                    <p style={{fontSize:12,color:C.muted,opacity:.68,marginTop:6,lineHeight:1.6}}>
                      Message <strong>@userinfobot</strong> to find your Chat ID. Click the eye to reveal.
                    </p>
                  </div>

                  {/* ── Webhook ── */}
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                    padding:"18px 20px",marginBottom:16}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <span style={{fontSize:13,fontWeight:700,color:C.text}}>Webhook URL</span>
                      <span style={{fontSize:11,color:C.muted,fontWeight:400}}>optional</span>
                    </div>
                    <input className="fi"
                      placeholder="https://ntfy.sh/topic  or  https://discord.com/api/webhooks/…"
                      value={settings.webhook_url}
                      onChange={e=>setSettings(s=>({...s,webhook_url:e.target.value}))}
                      style={{lineHeight:1.6}}/>
                    <p style={{fontSize:12,color:C.muted,opacity:.68,marginTop:6,lineHeight:1.6}}>
                      Compatible with ntfy, Gotify, Discord, Slack, or any HTTP JSON endpoint.
                    </p>
                  </div>

                  {/* ── Test result ── */}
                  {tgTestMsg && (
                    <div style={{fontSize:12,padding:"10px 14px",borderRadius:8,marginBottom:8,fontWeight:600,
                      lineHeight:1.5,
                      background: tgTesting==="ok" ? "rgba(123,166,122,.10)" : tgTesting==="error" ? "#e05c5c18" : C.surface,
                      color:       tgTesting==="ok" ? "#7BA67A"  : tgTesting==="error" ? "#e05c5c"  : C.muted,
                      border:`1px solid ${tgTesting==="ok"?"rgba(123,166,122,.22)":tgTesting==="error"?"#e05c5c33":C.border}`}}>
                      {tgTesting==="ok" ? "Test sent successfully. Check your Telegram." :
                       tgTesting==="error" ? `Connection failed: ${tgTestMsg}` :
                       "Sending test…"}
                    </div>
                  )}
                </>
              )}
    
              {settingsTab==="appearance" && <>
                <p style={{fontSize:12.5,color:C.muted,marginBottom:12,lineHeight:1.6}}>CSS applied live. Use F12 DevTools to inspect class names.</p>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  <button className="btn btn-g btn-sm" onClick={()=>setSettings(s=>({...s,custom_css:CSS_TEMPLATE}))}><Icon name="copy" size={13}/> Load template</button>
                  {settings.custom_css&&<button className="btn btn-d btn-sm" onClick={()=>setSettings(s=>({...s,custom_css:""}))}><Icon name="x" size={13}/> Clear</button>}
                </div>
                <textarea className="css-editor" value={settings.custom_css}
                  onChange={e=>setSettings(s=>({...s,custom_css:e.target.value}))}
                  placeholder="/* Paste CSS here or click Load template */"/>
              </>}
    
              {settingsTab==="branding" && (
                <>
                  {/* ── 2-column layout: left=fields, right=logo preview ── */}
                  <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:24,alignItems:"stretch"}}>
                    {/* LEFT: App Name + Accent — flex column so cards share height evenly */}
                    <div style={{display:"flex",flexDirection:"column",gap:16}}>
                      {/* App Name */}
                      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                        padding:"18px 20px"}}>
                        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:10,lineHeight:1.45}}>App Name</div>
                        <input className="fi" placeholder="Vigil" value={settings.app_name}
                          onChange={e=>setSettings(s=>({...s,app_name:e.target.value}))}
                          style={{lineHeight:1.6}}/>
                        <p style={{fontSize:12,color:C.muted,opacity:.68,marginTop:6,lineHeight:1.6}}>
                          Shown in the topbar and browser tab.
                        </p>
                      </div>

                      {/* Accent Color */}
                      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                        padding:"18px 20px"}}>
                        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:10,lineHeight:1.45}}>Accent Color</div>
                        <div style={{display:"flex",alignItems:"center",gap:14}}>
                          <AccentColorPicker
                            value={settings.app_accent||"#A0A0B8"}
                            onChange={v=>{ setSettings(s=>({...s,app_accent:v})); setAppAccent(v); }}
                          />
                          <div>
                            <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,
                              color:settings.app_accent||C.accent,fontWeight:700,letterSpacing:1}}>
                              {(settings.app_accent||"#A0A0B8").toUpperCase()}
                            </div>
                            <div style={{fontSize:12,color:C.muted,opacity:.68,marginTop:3,lineHeight:1.5}}>
                              Click swatch to change
                            </div>
                          </div>
                        </div>
                        <p style={{fontSize:12,color:C.muted,opacity:.68,marginTop:10,lineHeight:1.6}}>
                          Applies to name, card hovers, focus rings, and accent elements — live.
                        </p>
                      </div>

                      {/* Theme Preset — flex:1 so left column matches logo card height */}
                      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                        padding:"18px 20px",flex:1,display:"flex",flexDirection:"column"}}>
                        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:6,lineHeight:1.45}}>Theme Preset</div>
                        <div style={{fontSize:11,color:C.muted,marginBottom:12,lineHeight:1.55}}>
                          Choose a global appearance preset. Accent color can still be overridden above.
                        </div>
                        <select
                          className="fs"
                          value={settings.theme_preset||"warm-paper"}
                          onChange={e=>{
                            const p = e.target.value;
                            const presets = {
                              "warm-paper": {accent:"#964B07", dark:false},
                              "nordic":     {accent:"#4C566A", dark:false},
                              "slate":      {accent:"#3B78B5", dark:false},
                              "carbon":     {accent:"#A0A0A0", dark:true},
                              "midnight":   {accent:"#7C6FCD", dark:true},
                            };
                            const chosen = presets[p]||presets["warm-paper"];
                            setSettings(s=>({...s,theme_preset:p,app_accent:chosen.accent}));
                            // Use changePreset which handles dark mode sync
                            if (typeof changePreset === "function") {
                              changePreset(p, chosen.accent);
                            } else {
                              localStorage.setItem("dt-preset", p);
                              localStorage.setItem("dt-accent", chosen.accent);
                              if (typeof setAppAccent === "function") setAppAccent(chosen.accent);
                            }
                          }}
                          style={{width:"100%"}}>
                          <optgroup label="Light Themes">
                            <option value="warm-paper">Warm Vintage — cream &amp; bronze</option>
                            <option value="nordic">Nordic — cool gray &amp; slate</option>
                            <option value="slate">Slate — blue-gray &amp; crisp</option>
                          </optgroup>
                          <optgroup label="Dark Themes">
                            <option value="carbon">Carbon — charcoal &amp; neutral</option>
                            <option value="midnight">Midnight — deep blue &amp; indigo</option>
                          </optgroup>
                        </select>
                        <div style={{marginTop:8,fontSize:11,color:C.muted,lineHeight:1.6,padding:"8px 12px",background:C.card,borderRadius:8,border:`1px solid ${C.border}`}}>
                          {(settings.theme_preset||"warm-paper")==="warm-paper" && "Warm cream base with bronze accent. Ideal for daily use."}
                          {(settings.theme_preset)==="nordic" && "Clean cool-gray palette with slate accent."}
                          {(settings.theme_preset)==="slate" && "Fresh slate-blue light theme. Crisp and professional."}
                          {(settings.theme_preset)==="carbon" && "Dark charcoal system. Switches to dark mode automatically."}
                          {(settings.theme_preset)==="midnight" && "Deep blue-black with indigo accent. Rich and immersive."}
                        </div>
                      </div>

                    </div>

                    {/* RIGHT: Logo upload area */}
                    <div style={{minWidth:220,display:"flex",flexDirection:"column"}}>
                      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                        padding:"18px",flex:1,display:"flex",flexDirection:"column",alignItems:"stretch"}}>
                        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:12,lineHeight:1.45}}>Logo</div>

                        {/* Preview area — vertically centered in remaining card space */}
                        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
                        {/* Preview square */}
                        <div style={{
                          width:"100%",maxWidth:220,aspectRatio:"1",borderRadius:12,
                          border:`2px dashed ${C.border}`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          background:C.surface,position:"relative",
                          overflow:"hidden",cursor:"pointer",transition:"border-color .15s"}}
                          onClick={()=>logoFileRef.current?.click()}
                          onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                          onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                          {settings.app_logo
                            ? <img src={settings.app_logo}
                                style={{maxWidth:"calc(100% - 32px)",maxHeight:"calc(100% - 32px)",objectFit:"contain",display:"block",margin:"auto"}}
                                alt="App logo"/>
                            : <div style={{textAlign:"center",color:C.muted}}>
                                <div style={{color:settings.app_accent||C.accent,marginBottom:6}}>
                                  <LogoSVG size={64}/>
                                </div>
                                <div style={{fontSize:11,lineHeight:1.5}}>Click to upload<br/>or drag & drop</div>
                              </div>
                          }
                        </div>

                        {/* Upload / Remove buttons */}
                        <div style={{display:"flex",flexDirection:"column",gap:6,width:"100%",maxWidth:220}}>
                          <button className="btn btn-primary btn-sm"
                            onClick={()=>logoFileRef.current?.click()}>
                            <Icon name="camera" size={12}/> Upload Logo
                          </button>
                          {settings.app_logo && (
                            <button className="btn btn-danger btn-sm"
                              onClick={()=>setSettings(s=>({...s,app_logo:""}))}>
                              <Icon name="x" size={12}/> Remove Logo
                            </button>
                          )}
                        </div>

                        <p style={{fontSize:10,color:C.muted,marginTop:8,lineHeight:1.5,textAlign:"center"}}>
                          PNG · SVG · WebP · Max 512 KB
                        </p>
                        </div>{/* end centered flex wrapper */}
                      </div>
                    </div>
                  </div>
                </>
              )}
    
              {settingsTab==="security" && <>
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:20,marginBottom:16}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14,lineHeight:1.45}}>Change Username</div>
                  <form onSubmit={submitChangeUsername}>
                    <div className="fg2">
                      <label className="fl">New Username</label>
                      <input className="fi" placeholder="e.g. john" value={cuForm.new_username}
                        onChange={e=>setCuForm(f=>({...f,new_username:e.target.value}))}/>
                    </div>
                    <div className="fg2">
                      <label className="fl">Current Password (to confirm)</label>
                      <input className="fi" type="password" value={cuForm.current_password}
                        onChange={e=>setCuForm(f=>({...f,current_password:e.target.value}))}/>
                    </div>
                    {cuError&&<div className="err-inline">{cuError}</div>}
                    <button type="submit" className="btn btn-g btn-warn-hover" disabled={!cuForm.new_username||!cuForm.current_password}>Change Username</button>
                  </form>
                </div>
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:20}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14,lineHeight:1.45}}>Change Password</div>
                  <form onSubmit={submitChangePw}>
                    {[["Current password","current","current-password"],
                      ["New password (min 8 chars)","next","new-password"],
                      ["Confirm new password","confirm","new-password"]].map(([label,key,ac])=>(
                      <div className="fg2" key={key}>
                        <label className="fl">{label}</label>
                        <input className="fi" type="password" autoComplete={ac}
                          value={cpForm[key]} onChange={e=>setCpForm(f=>({...f,[key]:e.target.value}))}/>
                      </div>
                    ))}
                    {cpError&&<div className="err-inline">{cpError}</div>}
                    <button type="submit" className="btn btn-g btn-warn-hover" disabled={!cpForm.current||!cpForm.next||!cpForm.confirm}>
                      Change Password
                    </button>
                  </form>
                </div>
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:20,marginTop:16}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.text,lineHeight:1.45}}>Two-Factor Authentication</div>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,
                      background:currentUser?.totp_enabled?"rgba(123,166,122,.13)":"#6b6b8a22",
                      color:currentUser?.totp_enabled?"#7BA67A":"#6b6b8a"}}>
                      {currentUser?.totp_enabled ? "ENABLED" : "DISABLED"}
                    </span>
                  </div>
    
                  {/* ══ TOTP enabled: backup codes + disable ══ */}
                  {currentUser?.totp_enabled && !totpSetup && (
                    <div>
                      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:12,marginBottom:14}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                          <span style={{fontSize:12,fontWeight:700,color:C.text,display:"flex",alignItems:"center",gap:6}}>
                            Backup Codes
                            <Tooltip text="Use a backup code to sign in if you lose access to your authenticator app. Each code can only be used once.">
                              <span style={{fontSize:12,color:C.muted,cursor:"help"}}>ⓘ</span>
                            </Tooltip>
                          </span>
                          <span style={{fontSize:11,color:currentUser?.has_backup_codes?"#7BA67A":"#e08c3c"}}>
                            {currentUser?.has_backup_codes ? "" : "None generated"}
                          </span>
                        </div>
                        <div className="fg2" style={{marginBottom:0}}>
                          <label className="fl">Password (to generate new codes)</label>
                          <input className="fi" type="password" value={regenPw}
                            onChange={e=>{setRegenPw(e.target.value);setTotpError("");}}
                            placeholder="Your password"/>
                        </div>
                        {totpError&&!totpDisablePw&&<div className="err-inline">{totpError}</div>}
                        <button className="btn btn-g" style={{marginTop:8}} disabled={!regenPw||totpLoading}
                          onClick={async()=>{
                            setTotpLoading(true); setTotpError("");
                            try {
                              const r = await api("/auth/totp/regenerate",{method:"POST",body:JSON.stringify({password:regenPw})});
                              setBackupCodes(r.backup_codes); setRegenPw(""); toast("New backup codes generated");
                            } catch(e){ setTotpError(e.message||"Failed"); }
                            finally{ setTotpLoading(false); }
                          }}>
                          {totpLoading?"Generating...":"Generate New Backup Codes"}
                        </button>
                      </div>
                      <p style={{fontSize:12,color:C.muted,marginBottom:8}}>To disable two-factor authentication, enter your current password.</p>
                      <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                        <div style={{flex:1}}>
                          <input className="fi" type="password" value={totpDisablePw}
                            onChange={e=>{setTotpDisablePw(e.target.value);setTotpError("");}}
                            placeholder="Your password"/>
                        </div>
                        <button className="btn btn-g btn-danger-hover" disabled={!totpDisablePw||totpLoading}
                          style={{flexShrink:0,whiteSpace:"nowrap"}}
                          onClick={async()=>{
                            setTotpLoading(true); setTotpError("");
                            try {
                              const r = await api("/auth/totp",{method:"DELETE",body:JSON.stringify({password:totpDisablePw})});
                              setCurrentUser(r.user); setTotpDisablePw(""); setRegenPw(""); toast("2FA disabled","info");
                            } catch(e){ setTotpError(e.message||"Failed"); }
                            finally{ setTotpLoading(false); }
                          }}>
                          {totpLoading?"Disabling...":"Disable 2FA"}
                        </button>
                      </div>
                      {totpError&&totpDisablePw&&<div className="err-inline">{totpError}</div>}
                    </div>
                  )}
    
                  {/* ── TOTP disabled: start setup ── */}
                  {!currentUser?.totp_enabled && !totpSetup && (
                    <div>
                      <button className="btn btn-primary" disabled={totpLoading}
                        onClick={async()=>{
                          setTotpLoading(true); setTotpError(""); setTotpConfirmCode("");
                          try {
                            const r = await api("/auth/totp/setup",{method:"POST"});
                            setTotpSetup(r);
                          } catch(e){ setTotpError(e.message||"Failed to start setup"); }
                          finally{ setTotpLoading(false); }
                        }}>
                        {totpLoading?"Starting…":"Enable Two-Factor Authentication"}
                      </button>
                      {totpError&&<div className="err-inline" style={{marginTop:8}}>{totpError}</div>}
                    </div>
                  )}
    
                  {/* ── TOTP setup wizard ── */}
                  {totpSetup && (
                    <div>
                      <div style={{marginBottom:16}}>
                        <p style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.6}}>
                          Scan the QR code below with your authenticator app, or enter the secret key manually. Then enter the 6-digit code to confirm.
                        </p>
                        <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
                          {totpSetup.svg
                            ? <div style={{background:"#ffffff",padding:12,borderRadius:10,display:"inline-flex",boxShadow:"0 0 0 1px #ddd"}}>
                                <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(totpSetup.svg)}`}
                                  alt="TOTP QR Code" width={168} height={168}
                                  style={{display:"block"}}/>
                              </div>
                            : <div style={{width:180,height:180,background:"#eee",borderRadius:8,
                                display:"flex",alignItems:"center",justifyContent:"center",
                                fontSize:12,color:"#888"}}>QR unavailable — use manual key</div>
                          }
                        </div>
                        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,
                          padding:"10px 14px",marginBottom:14,textAlign:"center"}}>
                          <div style={{fontSize:10,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:".6px"}}>Manual key</div>
                          <code style={{fontSize:13,color:C.text,letterSpacing:"0.15em",wordBreak:"break-all"}}>
                            {totpSetup.secret.match(/.{1,4}/g).join(" ")}
                          </code>
                        </div>
                      </div>
                      <div className="fg2">
                        <label className="fl">Confirm code from your app</label>
                        <input className="fi" value={totpConfirmCode} inputMode="numeric"
                          onChange={e=>{ setTotpConfirmCode(e.target.value.replace(/\D/g,"").slice(0,6)); setTotpError(""); }}
                          placeholder="000000" maxLength={6}
                          style={{letterSpacing:"0.25em",fontSize:18,textAlign:"center"}}/>
                      </div>
                      {totpError&&<div className="err-inline">{totpError}</div>}
                      <div style={{display:"flex",gap:10,marginTop:4}}>
                        <button className="btn btn-primary" disabled={totpConfirmCode.length!==6||totpLoading}
                          onClick={async()=>{
                            setTotpLoading(true); setTotpError("");
                            try {
                              const r = await api("/auth/totp/confirm",{method:"POST",body:JSON.stringify({code:totpConfirmCode})});
                              setCurrentUser(r.user); setTotpSetup(null); setTotpConfirmCode(""); if(r.backup_codes) setBackupCodes(r.backup_codes); toast("2FA enabled! 🎉");
                            } catch(e){ setTotpError(e.message||"Invalid code"); setTotpConfirmCode(""); }
                            finally{ setTotpLoading(false); }
                          }}>
                          {totpLoading?"Verifying…":"Activate 2FA"}
                        </button>
                        <button className="btn btn-g btn-cancel"
                          onClick={()=>{ setTotpSetup(null); setTotpConfirmCode(""); setTotpError(""); }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>}
    
              {settingsTab==="agents" && <>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:18,lineHeight:1.5,color:C.text}}>Remote agents</div>
                    <div style={{fontSize:14,color:C.muted,marginTop:6,lineHeight:1.6}}>Connect Vigil to hosts where your containers run — no SSH required. New agents use mutual TLS automatically.</div>
                  </div>
                  <button className="btn-add-app btn-sm"
                  style={{fontSize:12,padding:"5px 14px",height:36,borderRadius:9}}
                  onClick={()=>{
                    setHostForm({name:"",ip:"",port:"7777",allowed_base:"/home"});
                    setHostWizardStep(1); setNewToken(""); setHostModal("add");
                  }}>+ Add host</button>
                </div>
                {caReady===false && (
                  <div style={{background:"#e05c5c14",border:"0.5px solid #e05c5c44",borderRadius:8,
                    padding:"9px 12px",marginBottom:12,display:"flex",gap:8,alignItems:"center"}}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e05c5c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <div style={{fontSize:11,color:"#e05c5c",lineHeight:1.6}}>
                      <strong>CA not ready</strong> — TLS provisioning is unavailable. Check that the
                      <code> cryptography</code> package is installed and the data volume is writable.
                      Check backend logs for details.
                    </div>
                  </div>
                )}

                {hosts.length===0 && (
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                    padding:20,textAlign:"center"}}>
                    <div style={{fontSize:13,color:C.text,marginBottom:4,lineHeight:1.5}}>No hosts configured yet.</div>
                    <div style={{fontSize:12,color:C.muted,lineHeight:1.55}}>Add your first remote host to monitor containers without SSH.</div>
                  </div>
                )}

                {hosts.map(host=>(
                  <div key={host.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"24px 28px",marginBottom:16}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:32,height:32,borderRadius:7,background:C.accent+"22",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="8" width="18" height="12" rx="2"/>
                            <circle cx="8.5" cy="13.5" r="1.5"/>
                            <circle cx="15.5" cy="13.5" r="1.5"/>
                            <path d="M9 17h6"/>
                            <path d="M12 8V4"/>
                            <circle cx="12" cy="3" r="1"/>
                          </svg>
                        </div>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:7}}>
                            <span style={{fontWeight:700,fontSize:16,lineHeight:1.5}}>{host.name}</span>
                            <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:600,
                              background:host.status==="connected"?"#1D9E7522":host.status==="unreachable"?"#e05c5c22":"#88878022",
                              color:host.status==="connected"?"#1D9E75":host.status==="unreachable"?"#e05c5c":C.muted}}>
                              {host.status==="connected"?"● Connected":host.status==="unreachable"?"● Unreachable":"● Unknown"}
                            </span>
                            {host.tls_enabled
                              ? <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:600,
                                  background:"#185FA522",color:C.accent}}>
                                  TLS
                                </span>
                              : <span title="Upgrade this host to use mutual TLS"
                                  style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:600,
                                  background:"#BA751722",color:"#BA7517",cursor:"pointer"}}
                                  onClick={async()=>{
                                    setActiveHost(host);
                                    setHostForm({name:host.name,ip:host.ip,port:String(host.port),allowed_base:host.allowed_base});
                                    setNewToken("");
                                    try {
                                      const t = await api(`/hosts/${host.id}/generate-install-token`,{method:"POST"});
                                      setInstallToken(t.install_token);
                                      setDecKey(t.dec_key);
                                      setTokenExpiry(t.expires_at);
                                      setIsPublicIp(t.public_ip||false);
                                    } catch(e){ toast("Could not generate install tokens: "+e.message,"error"); return; }
                                    setHostWizardStep(2);
                                    setHostModal("add");
                                  }}>
                                  Upgrade to TLS
                                </span>
                            }
                          </div>
                          <div style={{fontSize:13,color:C.muted,marginTop:4,lineHeight:1.6}}>{host.ip}:{host.port} · path: {host.allowed_base} · {host.app_count||0} app{host.app_count!==1?"s":""}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <button className="btn btn-test btn-sm"
                          title="Test connection to this agent"
                          onClick={async()=>{
                            setHostTesting(true); setHostTestMsg("Testing…");
                            try {
                              await api(`/hosts/${host.id}/test`,{method:"POST"});
                              setHostTestMsg("Connected!"); setHosts(h=>h.map(hh=>hh.id===host.id?{...hh,status:"connected"}:hh));
                            } catch(e) {
                              setHostTestMsg("Unreachable"); setHosts(h=>h.map(hh=>hh.id===host.id?{...hh,status:"unreachable"}:hh));
                            }
                            setHostTesting(false); setTimeout(()=>setHostTestMsg(""),4000);
                          }}>Test</button>
                        <button className="btn btn-secondary btn-sm"
                          title="Edit host name, IP or path"
                          onClick={()=>{
                            setActiveHost(host);
                            setHostForm({name:host.name,ip:host.ip,port:String(host.port),allowed_base:host.allowed_base});
                            setHostModal("edit");
                          }}>Edit</button>
                        <button className="btn btn-danger btn-sm"
                          title="Remove this host from Vigil"
                          onClick={async()=>{
                            if(!confirm(`Remove host "${host.name}"? Apps linked to it will be unlinked.`)) return;
                            await api(`/hosts/${host.id}`,{method:"DELETE"});
                            setHosts(h=>h.filter(hh=>hh.id!==host.id));
                            toast("Host removed.");
                          }}>Remove</button>
                      </div>
                    </div>
                    <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                      <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".6px",marginBottom:12}}>Agent Token</div>
                      <div style={{display:"flex",alignItems:"center",gap:8,background:C.input,borderRadius:8,padding:"8px 12px",border:`1px solid ${C.border}`,marginBottom:4}}>
                        <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:C.muted,flex:1,letterSpacing:".05em"}}>vigil-••••••••••••</span>
                        <span style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>hidden for security</span>
                      </div>
                      <div style={{display:"flex",gap:6,marginBottom:14}}>
                        {(()=>{
                          return (
                            <button className="btn btn-primary btn-sm"
                              title="Creates a new registration token. You must update the agent on the remote host."
                              onClick={async()=>{
                                if(!confirm("Regenerate agent token? You must update the vigil-agent config on that host.")) return;
                                const r = await api(`/hosts/${host.id}/regenerate-token`,{method:"POST"});
                                setNewToken(r.token); setActiveHost(host); setHostModal("token");
                              }}>Regenerate Agent Token</button>
                          );
                        })()}
                      </div>
                      <div style={{fontSize:11,color:C.muted,marginBottom:5,lineHeight:1.5,fontWeight:600}}>Remove agent</div>
                      <div style={{fontSize:11,color:C.muted,lineHeight:1.6,marginBottom:6}}>
                        Run on <strong style={{color:C.text}}>{host.name}</strong> ({host.ip}):
                      </div>
                      <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                        <code style={{fontFamily:"'Space Mono',monospace",fontSize:10,display:"block",
                          background:C.input,borderRadius:6,padding:"7px 10px",flex:1,
                          border:`1px solid ${C.border}`,color:C.text,lineHeight:1.6,wordBreak:"break-all"}}>
                          curl -s {window.location.origin}/agent/uninstall.sh | bash
                        </code>
                        <button className="btn btn-secondary btn-sm" style={{flexShrink:0}}
                          onClick={()=>{ copyText(`curl -s ${window.location.origin}/agent/uninstall.sh | bash`); toast("Copied"); }}>
                          Copy
                        </button>
                      </div>
                      <div style={{fontSize:10,color:C.muted,marginTop:6,lineHeight:1.5}}>
                        Then click <strong>Remove</strong> above to remove this host from Vigil.
                      </div>
                    </div>
                  </div>
                ))}
                {hostTestMsg && <div style={{fontSize:12,color:hostTestMsg==="Connected!"?"#1D9E75":"#e05c5c",marginTop:4,textAlign:"center"}}>{hostTestMsg}</div>}
              </>}
    
              {settingsTab==="system" && <>
                <div className="fg2">
                  <label className="fl">Check interval (hours)</label>
                  <input className="fi" type="number" min="1" max="168" value={settings.check_interval_hours}
                    onChange={e=>setSettings(s=>({...s,check_interval_hours:e.target.value}))}/>
                  <p className="fh">Changes take effect immediately — no restart needed.</p>
                </div>
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:9,padding:"13px 14px",marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".8px",color:C.muted,marginBottom:14}}>Scheduler Status</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    {[["Running",schedulerStatus?.running?"Yes":"No"],
                      ["Last run",schedulerStatus?.last_run_at||"Never"],
                      ["Status",schedulerStatus?.last_run_ok===false?"Errors":schedulerStatus?.last_run_ok?"OK":"—"],
                      ["Next run",schedulerStatus?.next_run_at||"Unknown"]].map(([k,v])=>(
                      <div key={k}>
                        <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".6px",marginBottom:4}}>{k}</div>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:12,wordBreak:"break-all",color:C.text,marginTop:2}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:9,padding:"13px 14px"}}>
                  <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".8px",color:C.muted,marginBottom:10}}>Detection Channels</div>
                  {Object.entries(CHANNEL_META).map(([k,m])=>(
                    <div key={k} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:9}}>
                      <ChannelPill channel={k}/>
                      <div style={{fontSize:12,color:C.muted,lineHeight:1.5,flex:1}}>{m.desc}</div>
                    </div>
                  ))}
                </div>
              </>}
    
                </div>{/* /sw-content */}
              </div>{/* /sw-body */}

              {/* ── Workspace footer ── */}
              <div className="sw-footer">
                <button className="btn btn-secondary"
                  style={{minHeight:46,borderRadius:14,minWidth:130,fontSize:15}}
                  onClick={()=>onClose()}>Close</button>
                {settingsTab==="integrations" && (
                  <button className="btn btn-test"
                    style={{minHeight:46,borderRadius:14,minWidth:170,fontSize:15}}
                    disabled={tgTesting==="sending"}
                    title="Send a test message to your Telegram to verify the integration works"
                    onClick={async()=>{
                      setTgTesting("sending"); setTgTestMsg("Sending…");
                      try {
                        await api("/settings/test-telegram",{method:"POST",body:JSON.stringify({
                          telegram_token:  settings.telegram_token  || undefined,
                          telegram_chat_id:settings.telegram_chat_id|| undefined,
                        })});
                        setTgTesting("ok"); setTgTestMsg("Test message sent! Check your Telegram.");
                      } catch(e) {
                        setTgTesting("error"); setTgTestMsg(e.message||"Failed to send test message.");
                      }
                      setTimeout(()=>{setTgTesting("idle");setTgTestMsg("");},8000);
                    }}>
                    {tgTesting==="sending" ? "Sending…" : "Test notification"}
                  </button>
                )}
                {settingsTab!=="security" && settingsTab!=="system" && settingsTab!=="agents" && (
                  <button className="btn btn-primary"
                    style={{minHeight:46,borderRadius:14,minWidth:180,fontSize:15,
                      ...(C.nordSaveBg?{background:C.nordSaveBg,color:C.nordSaveText,border:`1px solid ${C.nordSaveBorder}`}:{})}}
                    onClick={saveSettings}>Save changes</button>
                )}
              </div>

            </div>{/* /sw-panel */}
          </div>
        )}

        {backupCodes && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",
            alignItems:"center",justifyContent:"center",zIndex:3000,padding:20}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,
              padding:"32px 28px",width:"100%",maxWidth:420,animation:"su .2s ease"}}>
              <div style={{fontSize:18,fontWeight:700,marginBottom:8,color:C.text,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Icon name="key" size={18}/>Save Your Backup Codes</div>
              <div style={{fontSize:12,color:"#e08c3c",marginBottom:16,lineHeight:1.6,background:"#e08c3c18",
                border:"1px solid #e08c3c44",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                <strong>Store these somewhere safe.</strong> Each code can only be used once to sign in if you lose access to your authenticator. They will not be shown again.
              </div>
              <div style={{background:"#06060e",borderRadius:10,padding:"12px 16px",marginBottom:16}}>
                {backupCodes.map((code,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"5px 0",borderBottom:i<backupCodes.length-1?`1px solid ${C.border}`:"none"}}>
                    <code style={{fontSize:14,letterSpacing:"0.12em",color:"#e0e0f0",fontFamily:"'Space Mono',monospace"}}>{code}</code>
                    <span style={{fontSize:10,color:C.muted,marginLeft:12}}>#{i+1}</span>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                <button className="btn btn-g" onClick={()=>{
                  const lines = ["Vigil 2FA Backup Codes","=".repeat(30),...backupCodes.map((c,i)=>`${i+1}. ${c}`),"","Each code can only be used once."];
                  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/plain"}));
                  a.download="vigil-backup-codes.txt"; a.click();
                }}><Icon name="download" size={13}/> Download</button>
                <button className="btn btn-g" style={{display:"flex",alignItems:"center",gap:6}} onClick={()=>{
                  copyText(backupCodes.map((c,i)=>`${i+1}. ${c}`).join("\n"));
                  toast("Copied to clipboard");
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copy all</button>
                <button className="btn btn-w btn-confirm-save" onClick={()=>setBackupCodes(null)}><Icon name="check" size={13}/> Saved</button>
              </div>
            </div>
          </div>
        )}

    </>
  );
}
