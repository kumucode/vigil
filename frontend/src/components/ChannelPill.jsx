export const CHANNEL_META = {
  dockerhub:{ label:"Docker Hub",      color:"#1D63ED", icon:"🐋", desc:"Queries Docker Hub tag list, picks highest semantic version." },
  github:   { label:"GitHub Releases", color:"#3ce08c", icon:"🐙", desc:"Queries GitHub Releases API for the latest non-prerelease tag." },
  gitlab:   { label:"GitLab Releases", color:"#e24329", icon:"🦊", desc:"Queries GitLab Releases API (gitlab.com or self-hosted)." },
  gitea:    { label:"Gitea/Forgejo",   color:"#609926", icon:"🍵", desc:"Queries Gitea/Forgejo Releases API. Works with Codeberg too." },
  quay:     { label:"Quay.io",         color:"#40b4e5", icon:"🔵", desc:"Queries Quay.io tag list, picks highest semantic version." },
  lscr:     { label:"LinuxServer",      color:"#e67e22", icon:"🐧", desc:"Queries Docker Hub for LinuxServer images hosted at lscr.io." },
  unknown:  { label:"Unknown",         color:"#6b6b8a", icon:"❓", desc:"Channel undetermined — may be a private or unsupported registry." },
};

export function resolveChannelUrl(channel, image, versionSourceUrl) {
  if (versionSourceUrl) return versionSourceUrl;
  if (!image || !channel) return null;
  const _REGISTRY_PREFIXES = ["ghcr.io/", "lscr.io/", "registry.gitlab.com/", "quay.io/"];
  let img = image.split(":")[0];
  try {
    if (channel === "github") {
      const parts = img.replace("ghcr.io/", "").split("/");
      if (parts.length >= 2) return `https://github.com/${parts[0]}/${parts[1]}/releases`;
    }
    if (channel === "dockerhub") {
      let path = img;
      for (const prefix of _REGISTRY_PREFIXES) {
        if (path.startsWith(prefix)) { path = path.slice(prefix.length); break; }
      }
      const parts = path.split("/");
      if (parts.length === 1) return `https://hub.docker.com/_/${parts[0]}`;
      if (parts.length >= 2) return `https://hub.docker.com/r/${parts[0]}/${parts[1]}/tags`;
    }
    if (channel === "gitlab") {
      const parts = img.replace("registry.gitlab.com/", "").split("/");
      if (parts.length >= 2) return `https://gitlab.com/${parts[0]}/${parts[1]}/-/releases`;
    }
    if (channel === "gitea") {
      const host = img.split("/")[0];
      const rest = img.split("/").slice(1);
      if (rest.length >= 2) return `https://${host}/${rest[0]}/${rest[1]}/releases`;
    }
    if (channel === "lscr") {
      const path = img.replace("lscr.io/", "");
      const parts = path.split("/");
      if (parts.length >= 2) return `https://hub.docker.com/r/${parts[0]}/${parts[1]}/tags`;
    }
    if (channel === "quay") {
      const path = img.replace("quay.io/", "");
      return `https://quay.io/repository/${path}?tab=tags`;
    }
  } catch(_) {}
  return null;
}

export default function ChannelPill({ channel, url }) {
  const m = CHANNEL_META[channel] || CHANNEL_META.unknown;
  const neutralStyle = {
    display:"inline-flex",alignItems:"center",gap:4,fontSize:"9.5px",fontWeight:700,
    padding:"2px 8px",borderRadius:5,cursor:url?"pointer":"default",
    background:"transparent",color:"#5a5a7a",border:"0.5px solid rgba(255,255,255,0.12)",
    transition:"background .18s, color .18s, border-color .18s",
  };
  const inner = (
    <span title={url ? `Open ${m.label} page ↗` : m.desc}
      style={neutralStyle}
      onMouseEnter={e=>{
        e.currentTarget.style.background = m.color+"22";
        e.currentTarget.style.color = m.color;
        e.currentTarget.style.borderColor = m.color+"44";
      }}
      onMouseLeave={e=>{
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "#5a5a7a";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
      }}
    >{m.icon} {m.label}</span>
  );
  if (url) return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{textDecoration:"none",display:"inline-flex"}}>
      {inner}
    </a>
  );
  return inner;
}
