import React from "react";
import AppIcon, { resolveIconUrl } from "../components/AppIcon";

// ── AddAppDialog ────────────────────────────────────────────────────────────
// "Add Docker Image" modal. Visibility is controlled by the parent via the
// `open` prop (modal==="add"). Owns no server state itself — image parsing
// (`parsed`) and the add action are still owned by App.jsx and passed down.
export default function AddAppDialog({
  open, onClose, C,
  imageInput, handleInput, parsed, addApp,
  getCatLabel, getCatColor, autoCategory,
}) {
  if (!open) return null;

  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="mt">Add Docker Image</div>
          <button className="modal-close" onClick={onClose} title="Close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>
        </div>
        <div className="fg2">
          <label className="fl">Image String</label>
          <input className="fi" placeholder="e.g. ghcr.io/advplyr/audiobookshelf:2.7.1"
            value={imageInput} onChange={e=>handleInput(e.target.value)} autoFocus/>
          <p className="fh" style={{marginTop:5}}>Tip: use <code style={{fontFamily:"'Space Mono',monospace",background:"#0e0e1a",padding:"1px 5px",borderRadius:4,fontSize:10}}>custom</code> as the version to mark locally built images as Pinned.</p>
        </div>
        {parsed && (
          <div className="prev">
            {[["Image",parsed.image],["Name",parsed.name],["Version",parsed.version],
              ["Category",getCatLabel(autoCategory(parsed.image))]].map(([k,v])=>(
              <div className="pr" key={k}><span className="pk">{k}</span>
                <span className="pv" style={k==="Category"?{color:getCatColor(autoCategory(parsed.image))}:{}}>{v}</span>
              </div>
            ))}
            {resolveIconUrl(parsed.name,null,null)&&(
              <div style={{marginTop:10,display:"flex",alignItems:"center",gap:10}}>
                <span className="pk">Icon</span>
                <AppIcon name={parsed.name} image={parsed.image||""} customIcon={null} iconData={null} catColor={getCatColor(autoCategory(parsed.image))} size={28}/>
                <span style={{fontSize:11,color:C.muted}}>Auto-detected from CDN</span>
              </div>
            )}
            <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
              <span className="pk">Channel</span>
              <span style={{fontSize:11,color:C.muted}}>
                {parsed.image.startsWith("ghcr.io/")?"GitHub Releases → Docker Hub fallback":
                 parsed.image.startsWith("registry.gitlab.com/")?"GitLab Releases":
                 parsed.image.startsWith("quay.io/")?"Quay.io tags":
                 parsed.image.split("/")[0].match(/gitea|forgejo|codeberg/)?"Gitea/Forgejo Releases":
                 "Docker Hub tags"}
              </span>
            </div>
          </div>
        )}
        <div className="ma">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={addApp} disabled={!parsed}>Add</button>
        </div>
      </div>
    </div>
  );
}
