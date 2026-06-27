import { useState, useEffect, useCallback } from "react";
import { stripBlackBackground } from "../services/utils";

const DEFAULT_LOGO_FALLBACK = ""; // App will fall back to LogoSVG when empty

export function useSettings(api, toast) {
  // ── Settings object ────────────────────────────────────────────────────────
  const [settings, setSettings] = useState({
    telegram_token: "",
    telegram_chat_id: "",
    webhook_url: "",
    digest_mode: "immediate",
    digest_time: "09:00",
    digest_day: "",
    digest_interval_hours: "6",
    digest_template: "",
    digest_timezone: "UTC",
    check_interval_hours: "6",
    custom_css: "",
    app_name: "Vigil",
    app_logo: DEFAULT_LOGO_FALLBACK,
    app_accent: "#A0A0B8",
    notify_template: "",
    scan_summary_notify: "off",
  });

  // ── Telegram status ────────────────────────────────────────────────────────
  const [telegramSet, setTelegramSet] = useState(false);
  const [showChatId, setShowChatId] = useState(false);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgTestMsg, setTgTestMsg] = useState("");

  // ── Settings tab ──────────────────────────────────────────────────────────
  const [settingsTab, setSettingsTab] = useState("notifications");

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    if (!api) return;
    try {
      const d = await api("/settings");
      setTelegramSet(d.telegram_token_set === true);
      setSettings((s) => ({
        ...s,
        telegram_chat_id: d.telegram_chat_id || "",
        webhook_url: d.webhook_url || "",
        digest_mode: d.digest_mode || "immediate",
        digest_time: d.digest_time || "09:00",
        digest_day: d.digest_day || "",
        digest_interval_hours: d.digest_interval_hours || "6",
        digest_template: d.digest_template || "",
        digest_timezone: d.digest_timezone || "UTC",
        check_interval_hours: d.check_interval_hours || "6",
        custom_css: d.custom_css || "",
        app_name: d.app_name || "Vigil",
        app_logo: d.app_logo || "",
        app_accent: d.app_accent || "#A0A0B8",
      }));
      // Return branding values for the composition root
      return {
        appName: d.app_name || "Vigil",
        rawLogo: d.app_logo || "",
        appAccent: d.app_accent || "#A0A0B8",
      };
    } catch (_) {}
  }, [api]);

  // ── CSS injection effect ───────────────────────────────────────────────────
  useEffect(() => {
    let el = document.getElementById("dt-custom-css");
    if (!el) {
      el = document.createElement("style");
      el.id = "dt-custom-css";
      document.head.appendChild(el);
    }
    el.textContent = settings.custom_css || "";
  }, [settings.custom_css]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveSettings = useCallback(async () => {
    if (!api) return;
    try {
      const payload = { ...settings };
      if (!payload.telegram_token) delete payload.telegram_token;
      await api("/settings", { method: "POST", body: JSON.stringify(payload) });
      if (settings.telegram_token) setTelegramSet(true);
      setSettings((s) => ({ ...s, telegram_token: "" }));

      // Derive stripped logo
      const rawLogoSave = settings.app_logo || "";
      let strippedLogo = "";
      if (rawLogoSave) {
        strippedLogo = await stripBlackBackground(rawLogoSave);
      }

      await loadSettings();
      if (toast) toast("Saved!");
      return {
        appName: settings.app_name || "Vigil",
        strippedLogo,
        appAccent: settings.app_accent || "#A0A0B8",
      };
    } catch (e) {
      if (toast) toast(e.message || "Failed", "error");
    }
  }, [api, settings, loadSettings, toast]);

  const clearTelegram = useCallback(async () => {
    if (!api) return;
    try {
      await api("/settings", {
        method: "POST",
        body: JSON.stringify({ telegram_token: "", telegram_chat_id: "" }),
      });
      setTelegramSet(false);
      if (toast) toast("Cleared", "info");
    } catch {
      if (toast) toast("Failed", "error");
    }
  }, [api, toast]);

  return {
    settings, setSettings,
    telegramSet, setTelegramSet,
    showChatId, setShowChatId,
    tgTesting, setTgTesting,
    tgTestMsg, setTgTestMsg,
    settingsTab, setSettingsTab,
    loadSettings,
    saveSettings,
    clearTelegram,
  };
}
