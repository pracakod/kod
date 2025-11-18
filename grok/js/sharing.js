/* ==========================================================================
   Lista — sharing.js
   Odpowiada za: udostępnianie list i współpracę w czasie rzeczywistym.
   Funkcje:
   - Zapraszanie przez e‑mail do konkretnej listy/projektu (uprawnienia: read/edit)
   - Kolejka zaproszeń offline (outbox) i wysyłka po zalogowaniu/powrocie online
   - Pokoje Realtime (kanały) per lista: sygnalizacja zmian i obecności
   - Powiadamianie interfejsu o zmianach w listach współdzielonych (Bus)
   Uwaga: Wymaga tabel (z RLS) po stronie Supabase:
     shared_lists(id, owner_id, section, list_id, created_at, updated_at)
     shared_members(id, shared_id, member_email, member_user_id, permission, status, created_at, updated_at)
   Z kodu klienta obsługujemy wstawianie danych; polityki RLS należy opisać w README.
   ========================================================================== */

"use strict";

import { getSession } from "./supabase-client.js";

/* Konfiguracja dostępu do Supabase (duplikat jawny, aby móc użyć kanałów Realtime) */
const SUPABASE_URL = "https://vzttszvasssweigpqwcc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dHRzenZhc3Nzd2VpZ3Bxd2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNTM2ODEsImV4cCI6MjA3ODgyOTY4MX0.lRhUUWmtJX5yf-VYrVAIP94OH3ScAL5t3Zo8HrxTvlc";

/* Outbox zaproszeń (kolejka offline) */
const LS_SHARE_OUTBOX = "lista:share-outbox";

/* Pomocnicze */
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

/* Uproszczony dostęp do biblioteki supabase-js (ESM z CDN) */
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

/* Bieżący wybór listy w każdej sekcji (dla kanałów) */
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

/* Zarządzanie kanałami współdzielonymi */
const Rooms = {
  map: new Map(), // key -> channel
  currentBySection: new Map(), // section -> key

  async join(section, listId) {
    if (!section || !listId) return;
    const key = `${section}:${listId}`;
    // Jeśli już połączono, nic nie rób
    if (this.map.has(key)) {
      this.currentBySection.set(section, key);
      return;
    }
    // Zostaw poprzedni kanał tej sekcji
    const prevKey = this.currentBySection.get(section);
    if (prevKey && prevKey !== key) await this.leave(prevKey);

    const c = await ensureClient();
    const channel = c.channel(`room:${key}`, {
      config: { broadcast: { ack: true }, presence: { key: uuid() } }
    });

    // Broadcast — ktoś zmienił listę
    channel.on("broadcast", { event: "updated" }, (payload) => {
      try {
        window.Bus?.emit?.("shared:changed", payload?.payload || {});
      } catch {}
      toast("Zmieniono współdzieloną listę. Odświeżono widok.");
      // Odświeżenie widoków (bez precyzyjnego zakresu)
      try { window.Bus?.emit?.("list:updated"); } catch {}
    });

    // Presence — nieobowiązkowy podgląd liczby współpracujących
    channel.on("presence", { event: "sync" }, () => {
      // Można wykorzystać channel.presenceState() do policzenia aktywnych użytkowników
      // (dla uproszczenia nie renderujemy wskaźnika w UI w tym module)
    });

    // Subskrypcja
    await channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Dołącz do presence
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

/* Kolejka zaproszeń (outbox) */
function outboxLoad() { return loadJSON(LS_SHARE_OUTBOX, []); }
function outboxSave(list) { saveJSON(LS_SHARE_OUTBOX, list); }

async function trySendInvite(rec) {
  // Wymagane: sesja i klient
  const sess = await getSession();
  const user = sess?.user;
  if (!user) return { ok: false, reason: "no-user" };
  const c = await ensureClient();

  // 1) Zapewnij rekord shared_lists dla tej listy i właściciela
  const { data: existing, error: selErr } = await c.from("shared_lists")
    .select("*").eq("owner_id", user.id)
    .eq("section", rec.section).eq("list_id", rec.list_id)
    .limit(1);
  if (selErr && selErr.code !== "42P01") {
    // błąd inny niż brak tabeli
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

  // 2) Dodaj/aktualizuj membera
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
      // pozostaw w kolejce; przerwij na błędzie krytycznym (np. brak usera)
      if (res.reason === "no-user") break;
    }
  }
  if (changed) outboxSave(box);
}

/* Główny moduł */
export const Sharing = {
  _inited: false,
  _bus: { on() {}, emit() {} },

  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;

    // Dołącz do kanałów bieżących list (po zmianach selektorów)
    qs("#checklist-list-select")?.addEventListener("change", (e) => Rooms.join("checklist", e.target.value));
    qs("#tasks-project-select")?.addEventListener("change", (e) => Rooms.join("tasks", e.target.value));
    qs("#shopping-list-select")?.addEventListener("change", (e) => Rooms.join("shopping", e.target.value));

    // Po pierwszym uruchomieniu — dołącz do aktywnej
    const ctx = getActiveListContext();
    if (ctx.listId) await Rooms.join(ctx.section, ctx.listId);

    // Gdy lokalne dane się zmieniają — sygnalizuj na kanale aktywnej listy
    this._bus.on?.("list:updated", async () => {
      const { section, listId } = getActiveListContext();
      if (listId) await Rooms.broadcastUpdate(section, listId);
    });

    // Przetwarzanie outbox: przy starcie, po zalogowaniu i po powrocie online
    await processOutbox();
    window.addEventListener("online", () => processOutbox());
    // Nasłuch zmian sesji pośrednio przez polling getSession (prosto i skutecznie)
    setInterval(() => { if (navigator.onLine) processOutbox(); }, 45_000);
  },

  /* Publiczne API: wysyłka zaproszenia */
  async invite({ type, id, email, perm = "edit" }) {
    const section = type; // zgodnie z app.js: 'checklist' | 'tasks' | 'shopping'
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

    // Natychmiastowa próba wysyłki
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

  /* Możliwość jawnego dołączenia do pokoju (jeżeli potrzebne z innych modułów) */
  async joinRoom(section, listId) { await Rooms.join(section, listId); }
};

/* Inicjalizacja samoczynna (jak w pozostałych modułach) */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Sharing.init(window.Bus));
} else {
  Sharing.init(window.Bus);
}

export default Sharing;