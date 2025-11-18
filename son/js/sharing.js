"use strict";
import { getSession } from "./supabase-client.js";
const SUPABASE_URL = "https://vzttszvasssweigpqwcc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dHRzenZhc3Nzd2VpZ3Bxd2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNTM2ODEsImV4cCI6MjA3ODgyOTY4MX0.lRhUUWmtJX5yf-VYrVAIP94OH3ScAL5t3Zo8HrxTvlc";
const LS_SHARE_OUTBOX = "lista:share-outbox";
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const uuid = () => crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
function loadJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function toast(text, timeout = 2800) {
  const sb = qs("#snackbar"); if (!sb) return;
  qs("#snackbar-text").textContent = text;
  const act = qs("#snackbar-action"); if (act) act.hidden = true;
  sb.hidden = false; sb.classList.add("show");
  setTimeout(() => { sb.hidden = true; sb.classList.remove("show"); }, timeout);
}
let _createClient = null;
let _supabase = null;
async function ensureLib() {
  if (_createClient) return _createClient;
  const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
  _createClient = mod.createClient;
  return _createClient;
}
async function ensureClient() {
  if (_supabase) return _supabase;
  const createClient = await ensureLib();
  _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: localStorage.getItem("lista:persistSession") === "1",
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return _supabase;
}
function getActiveListContext() {
  const activeView = document.querySelector(".view.active")?.id || "view-checklist";
  if (activeView === "view-checklist") {
    const listId = qs("#checklist-list-select")?.value || null;
    return { section: "checklist", listId };
  }
  if (activeView === "view-tasks") {
    const listId = qs("#tasks-project-select")?.value || null;
    return { section: "tasks", listId };
  }
  if (activeView === "view-shopping") {
    const listId = qs("#shopping-list-select")?.value || null;
    return { section: "shopping", listId };
  }
  return { section: "other", listId: null };
}
const Rooms = {
  map: new Map(),
  currentBySection: new Map(),
  async join(section, listId) {
    if (!section || !listId) return;
    const key = `${section}:${listId}`;
    if (this.map.has(key)) {
      this.currentBySection.set(section, key);
      return;
    }
    const prevKey = this.currentBySection.get(section);
    if (prevKey && prevKey !== key) await this.leave(prevKey);
    const c = await ensureClient();
    const channel = c.channel(`room:${key}`, {
      config: { broadcast: { ack: true }, presence: { key: uuid() } }
    });
    channel.on("broadcast", { event: "updated" }, (payload) => {
      try {
        window.Bus?.emit?.("shared:changed", payload?.payload || {});
      } catch {}
      toast("Zmieniono współdzieloną listę. Odświeżono widok.");
      try { window.Bus?.emit?.("list:updated"); } catch {}
    });
    channel.on("presence", { event: "sync" }, () => {
    });
    await channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.track({ joined_at: Date.now() });
      }
    });
    this.map.set(key, channel);
    this.currentBySection.set(section, key);
  },
  async leave(key) {
    const ch = this.map.get(key);
    if (!ch) return;
    try {
      await _supabase?.removeChannel?.(ch);
    } catch {}
    this.map.delete(key);
  },
  async broadcastUpdate(section, listId) {
    const key = `${section}:${listId}`;
    const ch = this.map.get(key);
    if (!ch) return;
    try {
      await ch.send({
        type: "broadcast",
        event: "updated",
        payload: { section, listId, ts: Date.now() }
      });
    } catch {}
  }
};
function outboxLoad() { return loadJSON(LS_SHARE_OUTBOX, []); }
function outboxSave(list) { saveJSON(LS_SHARE_OUTBOX, list); }
async function trySendInvite(rec) {
  const sess = await getSession();
  const user = sess?.user;
  if (!user) return { ok: false, reason: "no-user" };
  const c = await ensureClient();
  const { data: existing, error: selErr } = await c.from("shared_lists")
    .select("*").eq("owner_id", user.id)
    .eq("section", rec.section).eq("list_id", rec.list_id)
    .limit(1);
  if (selErr && selErr.code !== "42P01") {
    return { ok: false, reason: selErr.message || "select-failed" };
  }
  let sharedId = existing && existing[0]?.id;
  if (!sharedId) {
    const { data: ins, error: insErr } = await c.from("shared_lists").upsert({
      id: rec.shared_id || uuid(),
      owner_id: user.id,
      section: rec.section,
      list_id: rec.list_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: "id" }).select("*").single();
    if (insErr) return { ok: false, reason: insErr.message || "insert-list-failed" };
    sharedId = ins.id;
  }
  const { error: memErr } = await c.from("shared_members").upsert({
    id: rec.member_id || uuid(),
    shared_id: sharedId,
    member_email: rec.email,
    member_user_id: null,
    permission: rec.permission || "edit",
    status: "invited",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: "id" });
  if (memErr) return { ok: false, reason: memErr.message || "insert-member-failed" };
  return { ok: true };
}
async function processOutbox() {
  const box = outboxLoad();
  let changed = false;
  for (const rec of box) {
    if (rec.status === "sent") continue;
    if (!navigator.onLine) break;
    const res = await trySendInvite(rec);
    if (res.ok) {
      rec.status = "sent"; rec.sent_at = Date.now();
      changed = true;
      toast("Wysłano zaproszenie do współpracy.");
    } else {
      if (res.reason === "no-user") break;
    }
  }
  if (changed) outboxSave(box);
}
export const Sharing = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;
    qs("#checklist-list-select")?.addEventListener("change", (e) => Rooms.join("checklist", e.target.value));
    qs("#tasks-project-select")?.addEventListener("change", (e) => Rooms.join("tasks", e.target.value));
    qs("#shopping-list-select")?.addEventListener("change", (e) => Rooms.join("shopping", e.target.value));
    const ctx = getActiveListContext();
    if (ctx.listId) await Rooms.join(ctx.section, ctx.listId);
    this._bus.on?.("list:updated", async () => {
      const { section, listId } = getActiveListContext();
      if (listId) await Rooms.broadcastUpdate(section, listId);
    });
    await processOutbox();
    window.addEventListener("online", () => processOutbox());
    setInterval(() => { if (navigator.onLine) processOutbox(); }, 45_000);
  },
  async invite({ type, id, email, perm = "edit" }) {
    const section = type;
    if (!section || !id || !email) throw new Error("Brak wymaganych danych zaproszenia.");
    const rec = {
      id: uuid(),
      section,
      list_id: id,
      email: String(email).trim().toLowerCase(),
      permission: perm === "read" ? "read" : "edit",
      status: "queued",
      created_at: Date.now()
    };
    const box = outboxLoad();
    box.push(rec); outboxSave(box);
    try {
      if (navigator.onLine) {
        const res = await trySendInvite(rec);
        if (res.ok) {
          rec.status = "sent"; rec.sent_at = Date.now();
          outboxSave(box);
          toast("Zaproszenie wysłane.");
          return { ok: true };
        }
      }
    } catch {}
    toast("Zaproszenie zapisane. Zostanie wysłane po zalogowaniu i powrocie online.");
    return { ok: false, queued: true };
  },
  async joinRoom(section, listId) { await Rooms.join(section, listId); }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Sharing.init(window.Bus));
} else {
  Sharing.init(window.Bus);
}
export default Sharing;