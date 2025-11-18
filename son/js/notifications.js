"use strict";
import { Storage } from "./storage.js";
const LS_PREFS = "lista:notifs:prefs";
const LS_SEEN  = "lista:notifs:seen";
const DEFAULT_PREFS = {
  global: true,
  channels: {
    checklist: true,
    tasks: true,
    shopping: true,
    dates: true,
    shared: true
  },
  quiet: {
    enabled: false,
    from: "22:00",
    to: "07:00"
  }
};
const CHANNEL_KEYS = ["checklist","tasks","shopping","dates","shared"];
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const fmt = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" });
function loadJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function parseHHMM(s) {
  if (!s || typeof s !== "string" || !/^\d{2}:\d{2}$/.test(s)) return 0;
  const [h, m] = s.split(":").map(n => parseInt(n, 10) || 0);
  return (h % 24) * 60 + (m % 60);
}
function minutesNow() {
  const d = new Date(); return d.getHours() * 60 + d.getMinutes();
}
function isQuietNow(prefs) {
  if (!prefs?.quiet?.enabled) return false;
  const from = parseHHMM(prefs.quiet.from || "22:00");
  const to   = parseHHMM(prefs.quiet.to   || "07:00");
  const nowM = minutesNow();
  if (from === to) return true;
  if (from < to) return nowM >= from && nowM < to;
  return (nowM >= from) || (nowM < to);
}
function loadSeen() { return loadJSON(LS_SEEN, {}); }
function saveSeen(obj) { saveJSON(LS_SEEN, obj); }
function seenKey(kind, id, stamp) { return `${kind}:${id}:${stamp}`; }
function markSeen(kind, id, stamp) {
  const s = loadSeen();
  s[seenKey(kind, id, stamp)] = Date.now();
  const limit = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const k of Object.keys(s)) if ((s[k] || 0) < limit) delete s[k];
  saveSeen(s);
}
function wasSeen(kind, id, stamp) {
  const s = loadSeen();
  return !!s[seenKey(kind, id, stamp)];
}
async function showNative(title, body, tag) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg && "showNotification" in reg && Notification.permission === "granted") {
      await reg.showNotification(title, { body, tag, renotify: true });
      return true;
    }
  } catch {}
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body, tag, renotify: true }); return true; } catch {}
  }
  return false;
}
function showToast(text) {
  const sb = qs("#snackbar"); if (!sb) return;
  const act = qs("#snackbar-action");
  qs("#snackbar-text").textContent = text;
  if (act) act.hidden = true;
  sb.hidden = false; sb.classList.add("show");
  setTimeout(() => { sb.hidden = true; sb.classList.remove("show"); }, 3500);
}
function readLegacyTasks() {
  try {
    const raw = localStorage.getItem("lista:fallback");
    if (!raw) return [];
    const legacy = JSON.parse(raw);
    const itemsByProject = legacy?.tasks?.items || {};
    const out = [];
    Object.values(itemsByProject).forEach(arr => (arr || []).forEach(t => out.push(t)));
    return out;
  } catch { return []; }
}
function readLegacyDates() {
  try {
    const raw = localStorage.getItem("lista:fallback");
    if (!raw) return [];
    const legacy = JSON.parse(raw);
    return legacy?.dates || [];
  } catch { return []; }
}
export const Notifications = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  _prefs: { ...DEFAULT_PREFS },
  _timer: null,
  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;
    this._prefs = { ...DEFAULT_PREFS, ...loadJSON(LS_PREFS, {}) };
    this._applyPrefsToUI();
    this._requestPermissionIfNeeded();
    this._bus.on?.("shared:changed", (p) => {
      this.notify("shared", "Zmiana w liście współdzielonej", "Współpracownik wprowadził zmiany.");
    });
    this._startScheduler();
    window.addEventListener("online", () => this._startScheduler(true));
  },
  setPref(key, value) {
    if (key === "global") {
      this._prefs.global = !!value;
    } else if (CHANNEL_KEYS.includes(key)) {
      this._prefs.channels[key] = !!value;
    }
    saveJSON(LS_PREFS, this._prefs);
    if (this._prefs.global && Object.values(this._prefs.channels).some(Boolean)) {
      this._requestPermissionIfNeeded();
    }
  },
  setQuietHours(qh) {
    if (!qh) {
      this._prefs.quiet = { enabled: false, from: "22:00", to: "07:00" };
    } else {
      this._prefs.quiet = {
        enabled: true,
        from: qh.from || "22:00",
        to: qh.to || "07:00"
      };
    }
    saveJSON(LS_PREFS, this._prefs);
  },
  getPrefs() {
    return JSON.parse(JSON.stringify(this._prefs));
  },
  async notify(channel, title, body, { urgent = false, tag = undefined } = {}) {
    if (!this._prefs.global) return false;
    if (!this._prefs.channels[channel]) return false;
    if (!urgent && isQuietNow(this._prefs)) return false;
    const ok = await showNative(title, body, tag);
    if (!ok) showToast(`${title} — ${body}`);
    return true;
  },
  _startScheduler(immediate = false) {
    if (this._timer) clearInterval(this._timer);
    const run = () => this._tick().catch(()=>{});
    if (immediate) run();
    const msToNextMinute = 60000 - (Date.now() % 60000);
    setTimeout(() => {
      run();
      this._timer = setInterval(run, 60000);
    }, msToNextMinute);
  },
  async _tick() {
    try { await Storage.init?.(); } catch {}
    const now = Date.now();
    const in60s = now + 60000;
    if (this._prefs.channels.tasks && this._prefs.global) {
      this._checkTasksDue(now, in60s);
    }
    if (this._prefs.channels.dates && this._prefs.global) {
      this._checkImportantDates(now);
    }
  },
  _flattenTasksFromSnapshot() {
    const snap = Storage.getSnapshot?.() || {};
    const arr = Array.isArray(snap.tasks) ? snap.tasks.slice() : [];
    const legacy = readLegacyTasks();
    const byId = new Map();
    for (const t of arr) if (t?.id) byId.set(t.id, t);
    for (const t of legacy) if (t?.id && !byId.has(t.id)) byId.set(t.id, t);
    return Array.from(byId.values());
  },
  _checkTasksDue(now, in60s) {
    const tasks = this._flattenTasksFromSnapshot()
      .filter(t => t && !t.done && t.due);
    for (const t of tasks) {
      const dueMs = Date.parse(t.due);
      if (!Number.isFinite(dueMs)) continue;
      if (dueMs >= now && dueMs < in60s) {
        const stamp = Math.floor(dueMs / 60000);
        if (!wasSeen("task", t.id, stamp)) {
          markSeen("task", t.id, stamp);
          const ttl = t.title || "Zadanie";
          const when = new Date(dueMs).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
          this.notify("tasks", "Termin zadania", `${ttl} — ${when}`, { tag: `task:${t.id}` });
        }
      }
    }
  },
  _readDatesMerged() {
    const snap = Storage.getSnapshot?.() || {};
    const arr = Array.isArray(snap.dates) ? snap.dates.slice() : [];
    const legacy = readLegacyDates();
    const byId = new Map();
    for (const d of arr) if (d?.id) byId.set(d.id, d);
    for (const d of legacy) if (d?.id && !byId.has(d.id)) byId.set(d.id, d);
    return Array.from(byId.values()).filter(d => d?.date);
  },
  _checkImportantDates(now) {
    const today = new Date();
    const ymd = today.toISOString().slice(0,10);
    const targetHM = { h: 9, m: 0 };
    const msToday0900 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), targetHM.h, targetHM.m).getTime();
    const windowStart = msToday0900;
    const windowEnd = msToday0900 + 60000;
    const dates = this._readDatesMerged();
    for (const d of dates) {
      if (d.date === ymd && now >= windowStart && now < windowEnd) {
        const key = `date:${d.id}:today:${ymd}`;
        if (!wasSeen("date", key, 0)) {
          markSeen("date", key, 0);
          const ttl = d.title || "Wydarzenie";
          this.notify("dates", "Dziś: ważne wydarzenie", `${ttl} — ${fmt.format(new Date(d.date))}`, { tag: `date:${d.id}` });
        }
      }
      const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      const yYmd = y.toISOString().slice(0,10);
      if (d.date === yYmd && now >= windowStart && now < windowEnd) {
        const key = `date:${d.id}:prev:${yYmd}`;
        if (!wasSeen("date", key, 0)) {
          markSeen("date", key, 0);
          const ttl = d.title || "Wydarzenie";
          this.notify("dates", "Jutro: przypomnienie o wydarzeniu", `${ttl} — ${fmt.format(new Date(ymd))}`, { tag: `date:${d.id}:prev` });
        }
      }
    }
  },
  _applyPrefsToUI() {
    try {
      const p = this._prefs;
      const map = {
        "#notif-global-toggle": p.global,
        "#notif-checklist": p.channels.checklist,
        "#notif-tasks": p.channels.tasks,
        "#notif-shopping": p.channels.shopping,
        "#notif-dates": p.channels.dates,
        "#notif-shared": p.channels.shared,
        "#notif-quiet-hours": p.quiet.enabled
      };
      for (const [sel, val] of Object.entries(map)) {
        const el = qs(sel); if (el) el.checked = !!val;
      }
      if (qs("#quiet-from")) qs("#quiet-from").value = p.quiet.from || "22:00";
      if (qs("#quiet-to")) qs("#quiet-to").value   = p.quiet.to   || "07:00";
    } catch {}
  },
  async _requestPermissionIfNeeded() {
    if (!("Notification" in window)) return;
    try {
      if (Notification.permission === "default" && this._prefs.global && Object.values(this._prefs.channels).some(Boolean)) {
        await Notification.requestPermission();
      }
    } catch {}
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Notifications.init(window.Bus));
} else {
  Notifications.init(window.Bus);
}
export default Notifications;