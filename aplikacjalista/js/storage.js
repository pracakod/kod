/* ==========================================================================
   Lista — storage.js
   Odpowiada za: localStorage (gość i cache), kolejkę offline, migracje,
   synchronizację z chmurą (Supabase), rozwiązywanie konfliktów (LWW),
   „Ostatnio usunięte” (auto-usuwanie po 7 dniach).
   ========================================================================== */

"use strict";

/* Ustalona wersja schematu lokalnego */
const SCHEMA_VERSION = 1;
const TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/* Klucze localStorage */
const LS_DB    = "lista:db";         // znormalizowana baza danych
const LS_META  = "lista:meta";       // metadane storage (wersja, lastSync, userId itp.)
const LS_QUEUE = "lista:queue";      // kolejka operacji offline
const LS_LEGACY = "lista:fallback";  // starszy układ danych (do migracji)

/* Pomocnicze */
const nowTs = () => Date.now();
const uuid = () =>
  crypto?.randomUUID?.() ||
  ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));

const safeBusEmit = (type, detail) => {
  try { window.Bus?.emit?.(type, detail); } catch {}
};

let SupaMod = null;
async function getSupa() {
  if (SupaMod) return SupaMod;
  try {
    SupaMod = await import("./supabase-client.js");
  } catch {
    // Stub (pozwala działać offline bez błędów)
    SupaMod = {
      getSession: async () => null,
      pullChanges: async () => null,
      pushOps: async () => ({ ok: false }),
      onAuthStateChange: () => {},
      setPersistPreference: () => {},
    };
  }
  return SupaMod;
}

/* Struktura znormalizowanej bazy */
function createEmptyDB() {
  return {
    // Checklista
    checklist_lists: [],            // {id, name, color, updated_at}
    checklist_items: [],            // {id, list_id, title, done, updated_at}

    // Zadania
    task_projects: [],              // {id, name, color, updated_at}
    tasks: [],                      // {id, project_id, title, notes, priority, due, category, done, subtasks[], updated_at}

    // Zakupy
    shopping_lists: [],             // {id, name, color, updated_at}
    shopping_items: [],             // {id, list_id, name, qty, category, store, cost, bought, oos, updated_at}

    // Lojalnościowe, paragony, daty
    loyalty_cards: [],              // {id, name, code, store?, updated_at}
    receipts: [],                   // {id, store, date, total, tags, ocr_text?, updated_at}
    dates: [],                      // {id, title, date, category, remind?, updated_at}
    vacations: [],
    // Archiwum i kosz (ostatnio usunięte)
    archive: [],                    // {id, type, ref_id, data, archived_at}
    trash: []                       // {id, type, ref_id, data, deleted_at}
  };
}

/* Metadane */
function defaultMeta() {
  return {
    schema: SCHEMA_VERSION,
    lastSync: 0,
    userId: null,
    migratedLegacyAt: 0,
    guestMigratedFor: null
  };
}

/* Operacje kolejki: {id, op:'upsert'|'delete'|'archive'|'restore', entity, data?, key?, ts} */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/* Normalizacja czasu */
function ensureUpdatedAt(obj) {
  if (!obj) return obj;
  if (!obj.updated_at) obj.updated_at = nowTs();
  return obj;
}

/* Konwersja ze starego formatu (LS_LEGACY) do znormalizowanego */
function convertLegacyToNormalized(legacy) {
  const db = createEmptyDB();
  const ts = nowTs();

  try {
    // Checklista
    const cl = legacy?.checklist || {};
    for (const l of cl.lists || []) {
      db.checklist_lists.push(ensureUpdatedAt({ id: l.id || uuid(), name: l.name || "Lista", color: l.color || "blue", updated_at: ts }));
      const arr = cl.items?.[l.id] || [];
      for (const it of arr) {
        db.checklist_items.push(ensureUpdatedAt({
          id: it.id || uuid(),
          list_id: l.id,
          title: it.title || "Pozycja",
          done: !!it.done,
          updated_at: it.updated_at || ts
        }));
      }
    }

    // Zadania
    const tk = legacy?.tasks || {};
    for (const p of tk.projects || []) {
      db.task_projects.push(ensureUpdatedAt({ id: p.id || uuid(), name: p.name || "Projekt", color: p.color || "green", updated_at: ts }));
      const arr = tk.items?.[p.id] || [];
      for (const it of arr) {
        db.tasks.push(ensureUpdatedAt({
          id: it.id || uuid(),
          project_id: p.id,
          title: it.title || "Zadanie",
          notes: it.notes || "",
          priority: it.priority || "medium",
          due: it.due || null,
          category: it.category || "",
          done: !!it.done,
          subtasks: Array.isArray(it.subtasks) ? it.subtasks : [],
          updated_at: it.updated_at || ts
        }));
      }
    }

    // Zakupy
    const sh = legacy?.shopping || {};
    for (const l of sh.lists || []) {
      db.shopping_lists.push(ensureUpdatedAt({ id: l.id || uuid(), name: l.name || "Zakupy", color: l.color || "amber", updated_at: ts }));
      const arr = sh.items?.[l.id] || [];
      for (const it of arr) {
        db.shopping_items.push(ensureUpdatedAt({
          id: it.id || uuid(),
          list_id: l.id,
          name: it.name || "Produkt",
          qty: Number(it.qty ?? 1),
          category: it.category || "",
          store: it.store || "",
          cost: Number(it.cost ?? 0),
          bought: !!it.bought,
          oos: !!it.oos,
          updated_at: it.updated_at || ts
        }));
      }
    }

    // Paragony, karty, daty
    for (const r of legacy?.receipts || []) {
      db.receipts.push(ensureUpdatedAt({
        id: r.id || uuid(),
        store: r.store || "",
        date: r.date || new Date().toISOString().slice(0,10),
        total: Number(r.total ?? 0),
        tags: r.tags || "",
        ocr_text: r.ocr_text || "",
        updated_at: r.updated_at || ts
      }));
    }
    for (const c of legacy?.loyalty || []) {
      db.loyalty_cards.push(ensureUpdatedAt({
        id: c.id || uuid(),
        name: c.name || "Karta",
        code: c.code || "",
        store: c.store || "",
        updated_at: c.updated_at || ts
      }));
    }
    for (const d of legacy?.dates || []) {
      db.dates.push(ensureUpdatedAt({
        id: d.id || uuid(),
        title: d.title || "Wydarzenie",
        date: d.date || new Date().toISOString().slice(0,10),
        category: (d.category || "inne"),
        remind: d.remind ?? false,
        updated_at: d.updated_at || ts
      }));
    }
  } catch (e) {
    console.warn("Błąd konwersji danych legacy:", e);
  }

  return db;
}

/* Łączenie LWW (last-write-wins) dla tablicy rekordów */
function lwwMerge(localArr, remoteArr) {
  const byId = new Map();
  for (const r of localArr) byId.set(r.id, r);
  for (const r of remoteArr || []) {
    const cur = byId.get(r.id);
    if (!cur || (r.updated_at || 0) > (cur.updated_at || 0)) {
      byId.set(r.id, { ...r });
    }
  }
  return Array.from(byId.values());
}

/* Znajdź i usuń z tablicy po id */
function removeById(arr, id) {
  const idx = arr.findIndex(x => x.id === id);
  if (idx >= 0) arr.splice(idx, 1);
  return idx >= 0;
}

/* Główny moduł Storage */
export const Storage = {
  _db: createEmptyDB(),
  _meta: defaultMeta(),
  _queue: [],
  _initialized: false,
  _syncing: false,

  /* Inicjalizacja: ładowanie LS, migracje, cleanup kosza, nasłuch online/auth */
  async init() {
    if (this._initialized) return;
    this._db = loadJSON(LS_DB, createEmptyDB());
    this._meta = { ...defaultMeta(), ...loadJSON(LS_META, {}) };
    this._queue = loadJSON(LS_QUEUE, []);

    // Migracja legacy -> normalized (jednorazowo)
    const legacy = loadJSON(LS_LEGACY, null);
    if (legacy && !this._meta.migratedLegacyAt) {
      const normalized = convertLegacyToNormalized(legacy);
      this._db = this._mergeSnapshots(this._db, normalized);
      this._meta.migratedLegacyAt = nowTs();
      saveJSON(LS_DB, this._db);
      saveJSON(LS_META, this._meta);
      // Nie usuwamy LS_LEGACY — może być jeszcze używany przez fallback UI.
    }

    // Sprzątanie kosza
    this._cleanupTrash();

    // Nasłuch online
    window.addEventListener("online", () => this.syncNow().catch(()=>{}));

    // Zmiany auth (jeśli Supabase dostępny)
    try {
      const Supa = await getSupa();
      Supa.onAuthStateChange?.(evt => {
        const user = evt?.user || null;
        this._meta.userId = user?.id || null;
        saveJSON(LS_META, this._meta);
        if (user && localStorage.getItem("lista:guest") === "1" && this._meta.guestMigratedFor !== user.id) {
          this.migrateGuestToUser().catch(()=>{});
        }
        // Po zmianie auth warto próbować synchronizacji
        this.syncNow().catch(()=>{});
      });
      // Wstępne przypisanie usera
      const sess = await Supa.getSession?.();
      this._meta.userId = sess?.user?.id || null;
      saveJSON(LS_META, this._meta);
    } catch {}

    // Okresowa synchronizacja (co 60s, jeśli online i zalogowano)
    setInterval(() => {
      if (navigator.onLine && this._meta.userId) this.syncNow().catch(()=>{});
    }, 60000);

    this._initialized = true;
  },

  /* Zapis lokalny i obsługa kolejki */
  _saveDB()   { saveJSON(LS_DB, this._db); },
  _saveMeta() { saveJSON(LS_META, this._meta); },
  _saveQueue(){ saveJSON(LS_QUEUE, this._queue); },

  _enqueue(op) {
    const rec = { id: uuid(), ts: nowTs(), ...op };
    this._queue.push(rec);
    this._saveQueue();
    return rec.id;
  },

  /* Ekspozycja kolejki (opcjonalnie) */
  enqueue(op) { return this._enqueue(op); },

  /* Snapshot do użycia przez UI / moduły */
  getSnapshot() {
    return JSON.parse(JSON.stringify(this._db));
  },

  /* Upsert rekordu w lokalnej bazie + kolejka */
  upsert(entity, data) {
    ensureUpdatedAt(data);
    const arr = this._db[entity];
    if (!Array.isArray(arr)) throw new Error(`Nieznany entity: ${entity}`);
    const exists = arr.find(x => x.id === data.id);
    if (exists) {
      if ((data.updated_at || 0) >= (exists.updated_at || 0)) {
        Object.assign(exists, data);
      } else {
        // LWW: lokalny wygrywa, jeśli nowszy — pozostawiamy
      }
    } else {
      arr.push({ ...data });
    }
    this._saveDB();

    // Kolejka tylko dla zalogowanych (dla gościa nie ma sensu wysyłać)
    this._enqueue({ op: "upsert", entity, data: { ...data } });

    // Emisja zdarzeń aktualizacji
    this._emitUpdateForEntity(entity);
  },

  /* Usuwanie: soft do kosza lub permanentne (options.permanent) */
  remove(entity, id, options = {}) {
    const arr = this._db[entity];
    if (!Array.isArray(arr)) throw new Error(`Nieznany entity: ${entity}`);
    const removed = arr.find(x => x.id === id);
    if (!removed) return false;

    if (options.permanent) {
      removeById(arr, id);
      this._enqueue({ op: "delete", entity, key: { id } });
    } else {
      // soft delete => kosz
      removeById(arr, id);
      this._db.trash.push({ id: uuid(), type: entity, ref_id: id, data: removed, deleted_at: nowTs() });
      this._enqueue({ op: "delete", entity, key: { id } });
    }
    this._saveDB();
    this._emitUpdateForEntity(entity);
    return true;
  },

  /* Archiwizacja */
  archive(entity, id) {
    const arr = this._db[entity];
    if (!Array.isArray(arr)) throw new Error(`Nieznany entity: ${entity}`);
    const rec = arr.find(x => x.id === id);
    if (!rec) return false;
    removeById(arr, id);
    this._db.archive.push({ id: uuid(), type: entity, ref_id: id, data: rec, archived_at: nowTs() });
    this._enqueue({ op: "archive", entity, key: { id } });
    this._saveDB();
    this._emitUpdateForEntity(entity);
    return true;
  },

  /* Przywracanie z archiwum/kosza */
  restoreFromArchive(archiveId) {
    const idx = this._db.archive.findIndex(x => x.id === archiveId);
    if (idx < 0) return false;
    const item = this._db.archive[idx]; this._db.archive.splice(idx, 1);
    const arr = this._db[item.type];
    if (Array.isArray(arr)) {
      ensureUpdatedAt(item.data);
      // Unikalność id
      const exist = arr.find(x => x.id === item.ref_id);
      if (exist) removeById(arr, item.ref_id);
      arr.push(item.data);
      this._enqueue({ op: "restore", entity: item.type, data: { ...item.data } });
      this._saveDB();
      this._emitUpdateForEntity(item.type);
      return true;
    }
    return false;
  },
  restoreFromTrash(trashId) {
    const idx = this._db.trash.findIndex(x => x.id === trashId);
    if (idx < 0) return false;
    const item = this._db.trash[idx]; this._db.trash.splice(idx, 1);
    const arr = this._db[item.type];
    if (Array.isArray(arr)) {
      ensureUpdatedAt(item.data);
      const exist = arr.find(x => x.id === item.ref_id);
      if (exist) removeById(arr, item.ref_id);
      arr.push(item.data);
      this._enqueue({ op: "restore", entity: item.type, data: { ...item.data } });
      this._saveDB();
      this._emitUpdateForEntity(item.type);
      return true;
    }
    return false;
  },

  /* Czyszczenie kosza starszego niż 7 dni */
  _cleanupTrash() {
    const now = nowTs();
    const before = this._db.trash.length;
    this._db.trash = (this._db.trash || []).filter(x => (now - (x.deleted_at || 0)) < TRASH_TTL_MS);
    if (this._db.trash.length !== before) this._saveDB();
  },

  /* Synchronizacja — push kolejki, pull zmian, scalenie LWW */
  async syncNow() {
    await this.init();
    if (!navigator.onLine) return { ok: false, reason: "offline" };

    const Supa = await getSupa();
    const sess = await Supa.getSession?.();
    const user = sess?.user;
    if (!user) return { ok: false, reason: "no-user" };

    if (this._syncing) return { ok: false, reason: "busy" };
    this._syncing = true;

    try {
      // 1) Wyślij operacje z kolejki (batch)
      if (this._queue.length) {
        const batch = this._queue.slice();
        const res = await Supa.pushOps?.(batch);
        if (res?.ok) {
          this._queue = [];
          this._saveQueue();
        } else {
          // Nie czyścimy kolejki — spróbujemy później
        }
      }

      // 2) Pobierz zmiany z chmury od lastSync i włącz LWW
      const changes = await Supa.pullChanges?.(this._meta.lastSync || 0);
      if (changes && typeof changes === "object") {
        this._db = this._mergeSnapshots(this._db, changes);
        this._saveDB();
      }

      // 3) Uaktualnij znacznik lastSync
      this._meta.lastSync = nowTs();
      this._meta.userId = user.id;
      this._saveMeta();

      // 4) Emisja zdarzeń
      safeBusEmit("storage:synced");
      safeBusEmit("list:updated");
      safeBusEmit("dates:updated");

      return { ok: true };
    } catch (e) {
      console.warn("Błąd synchronizacji:", e);
      return { ok: false, reason: "error" };
    } finally {
      this._syncing = false;
    }
  },

  /* Migracja danych gościa na konto użytkownika (po zalogowaniu) */
  async migrateGuestToUser() {
    await this.init();
    const Supa = await getSupa();
    const sess = await Supa.getSession?.();
    const user = sess?.user;
    if (!user) return { ok: false, reason: "no-user" };

    try {
      // Zepchnij cały lokalny snapshot jako upserty
      const ops = [];
      const pushAll = (entity) => {
        const arr = this._db[entity] || [];
        for (const r of arr) ops.push({ op: "upsert", entity, data: { ...r, updated_at: ensureUpdatedAt({ ...r }).updated_at } });
      };
      [
        "checklist_lists","checklist_items",
        "task_projects","tasks",
        "shopping_lists","shopping_items",
        "loyalty_cards","receipts","dates",
        "archive","trash"
      ].forEach(pushAll);

      if (ops.length) {
        const res = await Supa.pushOps?.(ops);
        if (!res?.ok) throw new Error("pushOps failed");
      }

      // Oznacz migrację
      this._meta.guestMigratedFor = user.id;
      this._saveMeta();
      // Usuń flagę trybu gościa
      localStorage.removeItem("lista:guest");

      // Po migracji odśwież pull, by wyrównać ewent. różnice
      await this.syncNow();

      return { ok: true };
    } catch (e) {
      console.warn("Błąd migracji danych gościa:", e);
      return { ok: false, reason: "error" };
    }
  },

  /* Pomocniczo: scalenie dwóch snapshotów baz (LWW dla każdej kolekcji) */
  _mergeSnapshots(local, incoming) {
    const out = createEmptyDB();
    const keys = Object.keys(out);
    for (const k of keys) {
      out[k] = lwwMerge(local[k] || [], incoming[k] || []);
    }
    return out;
  },

  /* Emisja zdarzeń aktualizacji wg sekcji (dla UI) */
  _emitUpdateForEntity(entity) {
    // grupowanie – wysyłamy ogólne sygnały rozumiane przez app.js
    if (entity.startsWith("checklist_") || entity.startsWith("task") || entity.startsWith("shopping_")) {
      safeBusEmit("list:updated");
    } else if (entity === "dates") {
      safeBusEmit("dates:updated");
    }
  }
};

/* Automatyczna inicjalizacja w tle (niezależnie od wywołań) */
Storage.init().catch(() => {});

/* Eksport domyślny (opcjonalnie) */
export default Storage;
