// ── Category auto-detection keywords ─────────────────────────────────────────

export const CAT_KEYWORDS = {
  Media: ["plex","jellyfin","emby","kodi","navidrome","lidarr","audiobookshelf","kavita","komga","calibre","booksonic","funkwhale","airsonic"],
  Download: ["radarr","sonarr","bazarr","prowlarr","readarr","lidarr","qbittorrent","deluge","transmission","sabnzbd","nzbget","jackett","flaresolverr","nzbhydra"],
  Requests: ["overseerr","jellyseerr","ombi","petio"],
  Photos: ["immich","photoprism","lychee","piwigo","librephotos","photoview"],
  Cloud: ["nextcloud","seafile","owncloud","filebrowser","syncthing"],
  Monitoring: ["grafana","prometheus","loki","influxdb","netdata","uptime","glances","dashdot","telegraf","healthchecks","dozzle"],
  Security: ["vaultwarden","bitwarden","authelia","keycloak","authentik","crowdsec","wireguard","adguard","pihole","wgeasy"],
  Database: ["postgres","mysql","mariadb","mongo","redis","minio","couchdb","elasticsearch"],
  Dev: ["gitea","forgejo","gitlab","jenkins","woodpecker","drone","activepieces","n8n","windmill","nodered","code","vscode"],
  Home: ["homeassistant","mosquitto","zigbee","zwavejs","deconz"],
  Docs: ["bookstack","wikijs","outline","hedgedoc","paperless","stirling"],
  Analytics: ["plausible","matomo","umami","posthog"],
  Feed: ["freshrss","miniflux","wallabag","invidious","piped","nitter","whoogle","searxng"],
  Comms: ["matrix","synapse","element","mattermost","rocketchat","jitsi","ntfy","gotify"],
  AI: ["ollama","openwebui","localai","koboldcpp"],
  Finance: ["actual","firefly","grocy"],
  Proxy: ["nginx","traefik","caddy","haproxy","swag","letsencrypt"],
  Infra: ["portainer","proxmox","unraid","docker","watchtower","diun","duplicati","restic"],
};

export function matchCategory(image="", name="") {
  const haystack = (image + " " + name).toLowerCase().replace(/[-_.:/]/g," ");
  for (const [cat, keywords] of Object.entries(CAT_KEYWORDS)) {
    if (keywords.some(kw => haystack.includes(kw))) return cat;
  }
  return null;
}
