"use strict";
const SCHEMA_VERSION = 1;
const TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LS_DB    = "lista:db";
const LS_META  = "lista:meta";
const LS_QUEUE = "lista:queue";
const LS_LEGACY = "lista:fallback";
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
function createEmptyDB() {
  return {
    checklist_lists: [],
    checklist_items: [],
    task_projects: [],
    tasks: [],
    shopping_lists: [],
    shopping_items: [],
    loyalty_cards: [],
    receipts: [],
    dates: [],
    archive: [],
    trash: []
  };
}
function defaultMeta() {
  return {
    schema: SCHEMA_VERSION,
    lastSync: 0,
    userId: null,
    migratedLegacyAt: 0,
    guestMigratedFor: null
  };
}
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function ensureUpdatedAt(obj) {
  if (!obj) return obj;
  if (!obj.updated_at) obj.updated_at = nowTs();
  return obj;
}
function convertLegacyToNormalized(legacy) {
  const db = createEmptyDB();
  const ts = nowTs();
  try {
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
function removeById(arr, id) {
  const idx = arr.findIndex(x => x.id === id);
  if (idx >= 0) arr.splice(idx, 1);
  return idx >= 0;
}
export const Storage = {
  _db: createEmptyDB(),
  _meta: defaultMeta(),
  _queue: [],
  _initialized: false,
  _syncing: false,
  async init() {
    if (this._initialized) return;
    this._db = loadJSON(LS_DB, createEmptyDB());
    this._meta = { ...defaultMeta(), ...loadJSON(LS_META, {}) };
    this._queue = loadJSON(LS_QUEUE, []);
    const legacy = loadJSON(LS_LEGACY, null);
    if (legacy && !this._meta.migratedLegacyAt) {
      const normalized = convertLegacyToNormalized(legacy);
      this._db = this._mergeSnapshots(this._db, normalized);
      this._meta.migratedLegacyAt = nowTs();
      saveJSON(LS_DB, this._db);
      saveJSON(LS_META, this._meta);
    }
    this._cleanupTrash();
    window.addEventListener("online", () => this.syncNow().catch(()=>{}));
    try {
      const Supa = await getSupa();
      Supa.onAuthStateChange?.(evt => {
        const user = evt?.user || null;
        this._meta.userId = user?.id || null;
        saveJSON(LS_META, this._meta);
        if (user && localStorage.getItem("lista:guest") === "1" && this._meta.guestMigratedFor !== user.id) {
          this.migrateGuestToUser().catch(()=>{});
        }
        this.syncNow().catch(()=>{});
      });
      const sess = await Supa.getSession?.();
      this._meta.userId = sess?.user?.id || null;
      saveJSON(LS_META, this._meta);
    } catch {}
    setInterval(() => {
      if (navigator.onLine && this._meta.userId) this.syncNow().catch(()=>{});
    }, 60000);
    this._initialized = true;
  },
  _saveDB()   { saveJSON(LS_DB, this._db); }
  _saveMeta() { saveJSON(LS_META, this._meta); }
  _saveQueue(){ saveJSON(LS_QUEUE, this._queue); }
  _enqueue(op) {
    const rec = { id: uuid(), ts: nowTs(), ...op };
    this._queue.push(rec);
    this._saveQueue();
    return rec.id;
  },
  enqueue(op) { return this._enqueue(op); },
  getSnapshot() {
    return JSON.parse(JSON.stringify(this._db));
  },
  upsert(entity, data) {
    ensureUpdatedAt(data);
    const arr = this._db[entity];
    if (!Array.isArray(arr)) throw new Error(`Nieznany entity: ${entity}`);
    const exists = arr.find(x => x.id === data.id);
    if (exists) {
      if ((data.updated_at || 0) >= (exists.updated_at || 0)) {
        Object.assign(exists, data);
      } else {
      }
    } else {
      arr.push({ ...data });
    }
    this._saveDB();
    this._enqueue({ op: "upsert", entity, data: { ...data } });
    this._emitUpdateForEntity(entity);
  },
  remove(entity, id, options = {}) {
    const arr = this._db[entity];
    if (!Array.isArray(arr)) throw new Error(`Nieznany entity: ${entity}`);
    const removed = arr.find(x => x.id === id);
    if (!removed) return false;
    if (options.permanent) {
      removeById(arr, id);
      this._enqueue({ op: "delete", entity, key: { id } });
    } else {
      removeById(arr, id);
      this._db.trash.push({ id: uuid(), type: entity, ref_id: id, data: removed, deleted_at: nowTs() });
      this._enqueue({ op: "delete", entity, key: { id } });
    }
    this._saveDB();
    this._emitUpdateForEntity(entity);
    return true;
  },
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
  restoreFromArchive(archiveId) {
    const idx = this._db.archive.findIndex(x => x.id === archiveId);
    if (idx < 0) return false;
    const item = this._db.archive[idx]; this._db.archive.splice(idx, 1);
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
  _cleanupTrash() {
    const now = nowTs();
    const before = this._db.trash.length;
    this._db.trash = (this._db.trash || []).filter(x => (now - (x.deleted_at || 0)) < TRASH_TTL_MS);
    if (this._db.trash.length !== before) this._saveDB();
  },
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
      if (this._queue.length) {
        const batch = this._queue.slice();
        const res = await Supa.pushOps?.(batch);
        if (res?.ok) {
          this._queue = [];
          this._saveQueue();
        } else {
        }
      }
      const changes = await Supa.pullChanges?.(this._meta.lastSync || 0);
      if (changes && typeof changes === "object") {
        this._db = this._mergeSnapshots(this._db, changes);
        this._saveDB();
      }
      this._meta.lastSync = nowTs();
      this._meta.userId = user.id;
      this._saveMeta();
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
  async migrateGuestToUser() {
    await this.init();
    const Supa = await getSupa();
    const sess = await Supa.getSession?.();
    const user = sess?.user;
    if (!user) return { ok: false, reason: "no-user" };
    try {
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
      this._meta.guestMigratedFor = user.id;
      this._saveMeta();
      localStorage.removeItem("lista:guest");
      await this.syncNow();
      return { ok: true };
    } catch (e) {
      console.warn("Błąd migracji danych gościa:", e);
      return { ok: false, reason: "error" };
    }
  },
  _mergeSnapshots(local, incoming) {
    const out = createEmptyDB();
    const keys = Object.keys(out);
    for (const k of keys) {
      out[k] = lwwMerge(local[k] || [], incoming[k] || []);
    }
    return out;
  },
  _emitUpdateForEntity(entity) {
    if (entity.startsWith("checklist_") || entity.startsWith("task") || entity.startsWith("shopping_")) {
      safeBusEmit("list:updated");
    } else if (entity === "dates") {
      safeBusEmit("dates:updated");
    }
  }
};
Storage.init().catch(() => {});
export default Storage;