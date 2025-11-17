/* ==========================================================================
   Lista — supabase-client.js
   Odpowiada za: inicjalizację klienta Supabase, obsługę Auth (Google, e‑mail),
   preferencję „pozostań zalogowany”, synchronizację danych (push/pull),
   Realtime (hooki do wykorzystania w innych modułach).
   Wymagane tabele w bazie (public, z RLS po kolumnie user_id):
   - checklist_lists, checklist_items
   - task_projects, tasks
   - shopping_lists, shopping_items
   - loyalty_cards, receipts, dates
   - archive, trash
   Każda tabela: co najmniej { id (uuid), user_id (uuid), updated_at (timestamptz) }.
   ========================================================================== */

"use strict";

/* Konfiguracja projektu — przekazana przez użytkownika */
const SUPABASE_URL = "https://vzttszvasssweigpqwcc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dHRzenZhc3Nzd2VpZ3Bxd2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNTM2ODEsImV4cCI6MjA3ODgyOTY4MX0.lRhUUWmtJX5yf-VYrVAIP94OH3ScAL5t3Zo8HrxTvlc";

/* Preferencja sesji (persist) — przechowywana lokalnie */
const LS_PERSIST = "lista:persistSession";

/* Dynamiczne ładowanie biblioteki @supabase/supabase-js (ESM) */
let _createClient = null;
let _supabase = null;
let _persistPref = null;

async function ensureLib() {
  if (_createClient) return _createClient;
  // CDN ESM (działa w przeglądarce bez bundlera)
  const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
  _createClient = mod.createClient;
  return _createClient;
}

function getPersistPref() {
  if (_persistPref === null) {
    _persistPref = localStorage.getItem(LS_PERSIST) === "1";
  }
  return _persistPref;
}

/* Inicjalizacja klienta (idempotentna; odtwarzana po zmianie pref.) */
async function ensureClient() {
  if (_supabase) return _supabase;
  const createClient = await ensureLib();
  _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: getPersistPref(),
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    global: {
      headers: { "x-application-name": "Lista DareG 1.0v" }
    }
  });
  return _supabase;
}

/* Użyteczne */
const nowIso = () => new Date().toISOString();
const toIso = (ts) => ts ? new Date(ts).toISOString() : nowIso();
const toMs = (v) => typeof v === "string" ? new Date(v).getTime() : (typeof v === "number" ? v : Date.now());

/* Mapowanie encji lokalnych -> tabele w Supabase */
const ENTITIES = {
  checklist_lists: "checklist_lists",
  checklist_items: "checklist_items",
  task_projects: "task_projects",
  tasks: "tasks",
  shopping_lists: "shopping_lists",
  shopping_items: "shopping_items",
  loyalty_cards: "loyalty_cards",
  receipts: "receipts",
  dates: "dates",
  archive: "archive",
  trash: "trash"
};

function entityToTable(entity) {
  return ENTITIES[entity] || null;
}

/* Ujednolicenie znaczników czasu po stronie klienta (LWW wymaga liczb) */
function normalizeTimestamps(rows) {
  return (rows || []).map(r => {
    const out = { ...r };
    if (typeof out.updated_at === "string") out.updated_at = toMs(out.updated_at);
    if (typeof out.created_at === "string") out.created_at = toMs(out.created_at);
    return out;
  });
}

/* ------------------------- API: Auth ------------------------------------ */

export async function getSession() {
  const c = await ensureClient();
  const { data } = await c.auth.getSession();
  return data?.session || null;
}

export function onAuthStateChange(handler) {
  // handler({ event, user, session })
  ensureClient().then(c => {
    const { data: sub } = c.auth.onAuthStateChange((event, session) => {
      try { handler({ event, user: session?.user || null, session }); } catch {}
    });
    return sub;
  });
  // Zwróć obiekt z metodą unsubscribe kompatybilny z resztą modułów
  return { unsubscribe() {/* noop for async ensure */} };
}

export async function signInWithGoogle({ redirectTo } = {}) {
  const c = await ensureClient();
  const { error } = await c.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo || location.origin, queryParams: { prompt: "select_account" } }
  });
  if (error) throw error;
  return { ok: true };
}

export async function signInWithEmailPassword(email, password) {
  const c = await ensureClient();
  return await c.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmailPassword(email, password, { redirectTo } = {}) {
  const c = await ensureClient();
  return await c.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo || location.origin } });
}

export async function resetPasswordForEmail(email, { redirectTo } = {}) {
  const c = await ensureClient();
  return await c.auth.resetPasswordForEmail(email, { redirectTo: redirectTo || location.origin });
}

export async function verifyOtp({ email, token, type }) {
  const c = await ensureClient();
  return await c.auth.verifyOtp({ email, token, type });
}

export async function updateUser(updates) {
  const c = await ensureClient();
  return await c.auth.updateUser(updates);
}

export async function signOut() {
  const c = await ensureClient();
  return await c.auth.signOut();
}

export function setPersistPreference(on) {
  _persistPref = !!on;
  try { localStorage.setItem(LS_PERSIST, on ? "1" : "0"); } catch {}
  // Przeinicjalizuj klienta, aby zastosować nową opcję persistSession
  _supabase = null;
  return true;
}

/* ------------------------- API: Synchronizacja -------------------------- */

/* Wysyłka operacji offline do chmury (best‑effort).
   batch: [{ op, entity, data?, key? }, ...]
   Zwraca: { ok: boolean, errors?: [{index, error}...] } */
export async function pushOps(batch = []) {
  if (!Array.isArray(batch) || !batch.length) return { ok: true };
  const c = await ensureClient();
  const sess = await getSession();
  const user = sess?.user;
  if (!user) return { ok: false, reason: "no-user" };

  const errors = [];
  for (let i = 0; i < batch.length; i++) {
    const op = batch[i];
    const table = entityToTable(op.entity);
    if (!table) { errors.push({ index: i, error: "unknown-entity" }); continue; }

    try {
      if (op.op === "upsert") {
        const row = { ...op.data };
        // Dopilnuj user_id i updated_at
        row.user_id = row.user_id || user.id;
        row.updated_at = row.updated_at ? new Date(row.updated_at).toISOString() : nowIso();
        const { error } = await c.from(table).upsert(row, { onConflict: "id" });
        if (error) throw error;
      } else if (op.op === "delete") {
        const id = op.key?.id || op.data?.id;
        if (!id) throw new Error("delete: missing id");
        const { error } = await c.from(table).delete().eq("id", id);
        if (error) throw error;
      } else if (op.op === "archive") {
        // Przeniesienie do tabeli 'archive' (opcjonalnie)
        const srcId = op.key?.id || op.data?.id;
        const payload = {
          id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          user_id: user.id,
          type: op.entity,
          ref_id: srcId,
          data: op.data || null,
          archived_at: nowIso(),
          updated_at: nowIso()
        };
        const { error } = await c.from("archive").upsert(payload, { onConflict: "id" });
        if (error) throw error;
      } else if (op.op === "restore") {
        // Przywrócenie — upsert do tabeli docelowej
        const row = { ...op.data, user_id: user.id, updated_at: nowIso() };
        const { error } = await c.from(table).upsert(row, { onConflict: "id" });
        if (error) throw error;
      } else {
        // Nieznana operacja — pomiń jako błąd
        throw new Error(`unknown-op:${op.op}`);
      }
    } catch (e) {
      errors.push({ index: i, error: e.message || String(e) });
    }
  }

  return { ok: errors.length === 0, errors };
}

/* Pobranie zmian z chmury od znacznika czasu lastSync (ms epoch).
   Zwraca snapshot z tablicami dla każdej encji. W przypadku błędu: null. */
export async function pullChanges(lastSync = 0) {
  const c = await ensureClient();
  const sess = await getSession();
  const user = sess?.user;
  if (!user) return null;

  const sinceIso = new Date(lastSync || 0).toISOString();
  const out = {};
  const tables = Object.values(ENTITIES);

  try {
    for (const table of tables) {
      // Niektóre instancje mogą nie mieć 'archive'/'trash' — w razie błędu pomiń
      const q = c.from(table)
        .select("*")
        .eq("user_id", user.id)
        .gt("updated_at", sinceIso)
        .order("updated_at", { ascending: true });

      const { data, error } = await q;
      if (error) {
        // Pomiń brakujące tabele (np. 42P01) bez przerywania całości
        console.info(`pullChanges: pominięto tabelę ${table}:`, error.message || error);
        out[table] = [];
        continue;
      }
      out[table] = normalizeTimestamps(data || []);
    }
    // Zamiana kluczy tabel na klucze encji (są identyczne wg mapy ENTITIES)
    return {
      checklist_lists: out.checklist_lists || [],
      checklist_items: out.checklist_items || [],
      task_projects:   out.task_projects   || [],
      tasks:           out.tasks           || [],
      shopping_lists:  out.shopping_lists  || [],
      shopping_items:  out.shopping_items  || [],
      loyalty_cards:   out.loyalty_cards   || [],
      receipts:        out.receipts        || [],
      dates:           out.dates           || [],
      archive:         out.archive         || [],
      trash:           out.trash           || []
    };
  } catch (e) {
    console.warn("pullChanges error:", e);
    return null;
  }
}

/* ------------------------- API: Realtime (opcjonalnie) ------------------ */

/* Subskrypcja zmian w wybranej tabeli (INSERT/UPDATE/DELETE).
   Przykład użycia:
   const sub = subscribeTable("checklist_items", (payload) => { ... });
   sub.unsubscribe(); */
export async function subscribeTable(table, callback) {
  const c = await ensureClient();
  const channel = c.channel(`realtime:${table}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => { try { callback(payload); } catch {} }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // ok
      }
    });
  return {
    unsubscribe: () => {
      try { c.removeChannel(channel); } catch {}
    }
  };
}

/* ------------------------- Eksport domyślny ----------------------------- */

export default {
  getSession,
  onAuthStateChange,
  signInWithGoogle,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  resetPasswordForEmail,
  verifyOtp,
  updateUser,
  signOut,
  setPersistPreference,
  pushOps,
  pullChanges,
  subscribeTable
};