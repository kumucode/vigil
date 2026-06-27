// ── Vigil API service layer ───────────────────────────────────────────────────
// All API calls centralised here. Every function returns a promise that resolves
// to parsed JSON or rejects with an Error.  401 responses are signalled via the
// special sentinel Error("Unauthorised") so callers can redirect to login.

/**
 * Base fetch wrapper.
 * @param {string} path  - e.g. "/apps"  (prefixed with /api internally)
 * @param {object} opts  - fetch options merged on top of defaults
 * @param {Function} onUnauthorised - callback invoked when 401 is received
 */
export async function apiFetch(path, opts = {}, onUnauthorised = null) {
  const r = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  if (r.status === 401) {
    if (onUnauthorised) onUnauthorised();
    throw new Error("Unauthorised");
  }
  if (!r.ok) throw new Error(await r.text());
  return r.status === 204 ? null : r.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const fetchMe       = ()      => fetch("/api/auth/me", { credentials: "include" });
export const postLogin     = body    => fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const postTotpLogin = body    => fetch("/api/auth/totp/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const postTotpBackup= body    => fetch("/api/auth/totp/backup", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const postChangePw  = body    => fetch("/api/auth/change-password", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const postChangeUser= body    => fetch("/api/auth/change-username", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ── Apps ──────────────────────────────────────────────────────────────────────
export const fetchApps          = (api) => api("/apps");
export const createApp          = (api, body)         => api("/apps", { method: "POST", body: JSON.stringify(body) });
export const patchApp           = (api, id, body)     => api(`/apps/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteApp          = (api, id)           => api(`/apps/${id}`, { method: "DELETE" });
export const checkApp           = (api, id)           => api(`/apps/${id}/check`, { method: "POST" });
export const fetchAppHistory    = (api, id)           => api(`/apps/${id}/history`);
export const fetchAppLogs       = (api, id)           => api(`/apps/${id}/logs`);
export const updateApp          = (api, id)           => api(`/apps/${id}/update`, { method: "POST" });
export const setAppIcon         = (api, id, dataUri)  => api(`/apps/${id}/icon`, { method: "POST", body: JSON.stringify({ data_uri: dataUri }) });
export const snoozeApp          = (api, id, days)     => api(`/apps/${id}/snooze`, { method: "POST", body: JSON.stringify({ days }) });
export const clearSnooze        = (api, id)           => api(`/apps/${id}/snooze`, { method: "DELETE" });
export const ignoreVersion      = (api, id, version)  => api(`/apps/${id}/ignore`, { method: "POST", body: JSON.stringify({ version }) });
export const importApps         = (api, compose)      => api("/apps/import", { method: "POST", body: JSON.stringify({ compose }) });
export const exportApps         = (api)               => api("/apps/export");
export const recategorizeApps   = (api)               => api("/apps/recategorize", { method: "POST" });
export const checkAll           = (api)               => api("/check", { method: "POST" });

// ── Categories ────────────────────────────────────────────────────────────────
export const fetchCategories    = (api)               => api("/categories");
export const createCategory     = (api, body)         => api("/categories", { method: "POST", body: JSON.stringify(body) });
export const patchCategory      = (api, id, body)     => api(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteCategory     = (api, id)           => api(`/categories/${id}`, { method: "DELETE" });

// Public categories fetch for pre-auth bootstrap (no credentials/401 handling —
// avoids triggering the authenticated apiFetch's 401→login redirect before
// auth state is known).
export const fetchCategoriesPublic = () => fetch("/api/categories").then(r => r.ok ? r.json() : []);
export const fetchBrandingPublic   = () => fetch("/api/settings/branding").then(r => r.ok ? r.json() : null);

// ── Settings ──────────────────────────────────────────────────────────────────
export const fetchSettings      = (api)               => api("/settings");
export const saveSettings       = (api, body)         => api("/settings", { method: "POST", body: JSON.stringify(body) });

// ── Health / scheduler ────────────────────────────────────────────────────────
export const fetchHealth        = (api)               => api("/health");

// ── Hosts / agents ────────────────────────────────────────────────────────────
export const fetchHosts         = (api)               => api("/hosts");
export const fetchCaFingerprint = (api)               => api("/hosts/ca-fingerprint");

// ── External icon libraries (jsDelivr CDN — not /api) ──────────────────────────
// Returns parsed JSON (or null on failure) for both dashboard-icons and
// selfh.st flat package indexes, used to populate the icon search library.
export async function fetchIconLibraries() {
  const dash_url = "https://data.jsdelivr.com/v1/package/gh/walkxcode/dashboard-icons@master/flat";
  const self_url = "https://data.jsdelivr.com/v1/package/gh/selfhst/icons@main/flat";
  const [d1, d2] = await Promise.allSettled([
    fetch(dash_url).then(r => r.json()),
    fetch(self_url).then(r => r.json()),
  ]);
  return {
    dashboard: d1.status === "fulfilled" ? d1.value : null,
    selfhst:   d2.status === "fulfilled" ? d2.value : null,
  };
}
