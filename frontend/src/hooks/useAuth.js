import { useState, useEffect, useCallback } from "react";
import {
  apiFetch,
  fetchMe,
  postChangePw,
  postChangeUser,
} from "../services/api";

export function useAuth() {
  // ── Auth state ─────────────────────────────────────────────────────────────
  const [authState, setAuthState] = useState("loading");
  const [currentUser, setCurrentUser] = useState(null);

  // ── TOTP state ─────────────────────────────────────────────────────────────
  const [totpSetup, setTotpSetup] = useState(null);   // {secret, uri} | null
  const [backupCodes, setBackupCodes] = useState(null); // shown once after activation
  const [regenPw, setRegenPw] = useState("");
  const [totpConfirmCode, setTotpConfirmCode] = useState("");
  const [totpDisablePw, setTotpDisablePw] = useState("");
  const [totpError, setTotpError] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);

  // ── Change-password form ───────────────────────────────────────────────────
  const [cpForm, setCpForm] = useState({ current: "", next: "", confirm: "" });
  const [cpError, setCpError] = useState("");

  // ── Change-username form ───────────────────────────────────────────────────
  const [cuForm, setCuForm] = useState({ new_username: "", current_password: "" });
  const [cuError, setCuError] = useState("");

  // ── Authenticated fetch wrapper ────────────────────────────────────────────
  const api = useCallback(
    (path, opts = {}) => apiFetch(path, opts, () => setAuthState("login")),
    []
  );

  // ── Bootstrap: check session on mount ─────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const r = await fetchMe();
        if (!r.ok) { setAuthState("login"); return; }
        const { user } = await r.json();
        setCurrentUser(user);
        setAuthState(user.must_change_pw ? "change_pw" : "app");
      } catch {
        setAuthState("login");
      }
    })();
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleLogin = (user) => {
    setCurrentUser(user);
    setAuthState(user.must_change_pw ? "change_pw" : "app");
  };

  const handlePwChanged = (user) => {
    setCurrentUser(user);
    setAuthState("app");
  };

  const handleLogout = async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch (_) {}
    setCurrentUser(null);
    setAuthState("login");
  };

  const submitChangePw = async (e) => {
    e.preventDefault();
    setCpError("");
    if (cpForm.next !== cpForm.confirm) { setCpError("Passwords don't match."); return; }
    try {
      const r = await postChangePw({ current_password: cpForm.current, new_password: cpForm.next });
      const data = await r.json();
      if (!r.ok) { setCpError(data.error || "Failed."); return; }
      setCurrentUser(data.user);
      setCpForm({ current: "", next: "", confirm: "" });
      return { success: true };
    } catch {
      setCpError("Network error.");
    }
  };

  const submitChangeUsername = async (e) => {
    e.preventDefault();
    setCuError("");
    try {
      const r = await postChangeUser({ new_username: cuForm.new_username, current_password: cuForm.current_password });
      const data = await r.json();
      if (!r.ok) { setCuError(data.error || "Failed."); return; }
      setCurrentUser(data.user);
      setCuForm({ new_username: "", current_password: "" });
      return { success: true };
    } catch {
      setCuError("Network error.");
    }
  };

  return {
    // state
    authState, setAuthState,
    currentUser, setCurrentUser,
    // totp
    totpSetup, setTotpSetup,
    backupCodes, setBackupCodes,
    regenPw, setRegenPw,
    totpConfirmCode, setTotpConfirmCode,
    totpDisablePw, setTotpDisablePw,
    totpError, setTotpError,
    totpLoading, setTotpLoading,
    // change-pw
    cpForm, setCpForm,
    cpError, setCpError,
    // change-username
    cuForm, setCuForm,
    cuError, setCuError,
    // api wrapper (used by all other hooks)
    api,
    // handlers
    handleLogin,
    handlePwChanged,
    handleLogout,
    submitChangePw,
    submitChangeUsername,
  };
}
