import { useState } from "react";

const ICON_CDN = "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png";
const ICON_MAP = {
  audiobookshelf:"audiobookshelf",jellyfin:"jellyfin",plex:"plex",emby:"emby",
  radarr:"radarr",sonarr:"sonarr",bazarr:"bazarr",overseerr:"overseerr",
  tautulli:"tautulli",prowlarr:"prowlarr",lidarr:"lidarr",readarr:"readarr",
  navidrome:"navidrome",nextcloud:"nextcloud",jenkins:"jenkins",portainer:"portainer",
  gitea:"gitea",nginx:"nginx",traefik:"traefik",caddy:"caddy",pihole:"pi-hole",
  wireguard:"wireguard",adguard:"adguard-home",grafana:"grafana",
  prometheus:"prometheus",loki:"loki",influxdb:"influxdb",netdata:"netdata",
  postgres:"postgresql",mysql:"mysql",mariadb:"mariadb",mongo:"mongodb",
  redis:"redis",minio:"minio",syncthing:"syncthing",immich:"immich",
  photoprism:"photoprism",vaultwarden:"vaultwarden",bitwarden:"bitwarden",
  authelia:"authelia",keycloak:"keycloak",gitlab:"gitlab","n8n":"n8n",
  nocodb:"nocodb",appwrite:"appwrite",homeassistant:"home-assistant",
  unraid:"unraid",proxmox:"proxmox",filebrowser:"filebrowser",
  uptime:"uptime-kuma",docker:"docker",seafile:"seafile",woodpecker:"woodpecker",
  kavita:"kavita",joplin:"joplin",homarr:"homarr",linkwarden:"linkwarden",
  mealie:"mealie",grocy:"grocy",paperless:"paperless-ngx",
  freshrss:"freshrss",miniflux:"miniflux",wallabag:"wallabag",
  stirlingpdf:"stirling-pdf",stirling:"stirling-pdf",
  changedetection:"changedetection",ntfy:"ntfy",
  gotify:"gotify",healthchecks:"healthchecks",
  activepieces:"activepieces",windmill:"windmill",
  actual:"actual",firefly:"firefly",
  dashdot:"dashdot",glances:"glances",
  whoogle:"whoogle",searxng:"searxng",
  forgejo:"forgejo",authentik:"authentik",crowdsec:"crowdsec",
  duplicati:"duplicati",restic:"restic",
  jellyseerr:"jellyseerr",unmanic:"unmanic",tdarr:"tdarr",
  mosquitto:"mosquitto",nodered:"node-red",telegraf:"telegraf",
  dozzle:"dozzle",calibre:"calibre",komga:"komga",kiwix:"kiwix",
  onlyoffice:"onlyoffice",vscode:"code",codeserver:"code-server",
  upsnap:"upsnap",speedtest:"speedtest-tracker",
  tandoor:"tandoor",vikunja:"vikunja",plane:"plane",
  zipline:"zipline",pingvin:"pingvin-share",
  pocketbase:"pocketbase",supabase:"supabase",planka:"planka",
  excalidraw:"excalidraw",drawio:"drawio",
  bookstack:"bookstack",wikijs:"wiki-js",outline:"outline",hedgedoc:"hedgedoc",
  qbittorrent:"qbittorrent",deluge:"deluge",transmission:"transmission",
  nzbget:"nzbget",sabnzbd:"sabnzbd",jackett:"jackett",flaresolverr:"flaresolverr",
  zoneminder:"zoneminder",frigate:"frigate",motioneye:"motioneye",
  ollama:"ollama",openwebui:"open-webui",
  matrix:"matrix",element:"element",mattermost:"mattermost",
  rocketchat:"rocket.chat",jitsi:"jitsi",
  minecraft:"minecraft",pterodactyl:"pterodactyl",
  heimdall:"heimdall",flame:"flame",organizr:"organizr",
  wgeasy:"wg-easy",adguardhome:"adguard-home",
  watchtower:"watchtower",diun:"diun",
};

export function resolveIconUrl(name, customIcon, iconData, image="") {
  if (iconData)   return iconData;
  if (customIcon) return customIcon;
  const norm = s => s.toLowerCase().replace(/[-_.]/g, "");
  const candidates = [...new Set([name, ...image.split("/")].map(norm).filter(s => s.length > 1))];
  for (const [k, v] of Object.entries(ICON_MAP)) {
    const key = norm(k);
    if (candidates.some(c => c.includes(key) || key.includes(c))) return `${ICON_CDN}/${v}.png`;
  }
  return null;
}

export default function AppIcon({ name, image="", customIcon, iconData, catColor, size=44, onClick, clickable=false }) {
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const url = resolveIconUrl(name, customIcon, iconData, image);
  const base = { width:size, height:size, borderRadius:size*.27, flexShrink:0,
    cursor:clickable?"pointer":"default", position:"relative" };
  const overlay = clickable && hovered ? (
    <div style={{ position:"absolute",inset:0,background:"rgba(0,0,0,.5)",
      display:"flex",alignItems:"center",justifyContent:"center",
      borderRadius:size*.27,fontSize:size*.3,pointerEvents:"none" }}>+</div>
  ) : null;
  const handlers = clickable ? {
    onMouseEnter:()=>setHovered(true), onMouseLeave:()=>setHovered(false), onClick,
  } : {};
  if (url && !failed) return (
    <div style={{...base,overflow:"hidden",background:catColor+"22",border:`1px solid ${catColor}33`,
      display:"flex",alignItems:"center",justifyContent:"center"}} {...handlers}>
      <img src={url} alt={name} onError={()=>setFailed(true)}
        style={{width:size*.72,height:size*.72,objectFit:"contain"}} draggable={false}/>
      {overlay}
    </div>
  );
  return (
    <div style={{...base,background:catColor+"33",border:`1px solid ${catColor}44`,
      display:"flex",alignItems:"center",justifyContent:"center",
      fontFamily:"'Space Mono',monospace",fontWeight:700,fontSize:size*.29,color:catColor}}
      {...handlers}>
      {name.slice(0,2).toUpperCase()}
      {overlay}
    </div>
  );
}
