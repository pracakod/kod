"use strict";

const STORAGE_VERSION = 1;
const TABLES = ["checklists", "tasks", "shopping", "recipes", "vacations", "receipts", "loyalty-cards", "shared-lists"];
const LS_PREFIX = "lista:";
const LS_QUEUE = "lista:offline-queue";
const LS_VERSION = "lista:version";

export class Storage {
  constructor() {
    this.offlineQueue = [];
    this.supabase = null;
  }

  async init() {
    this.checkVersion();
    this.loadOfflineQueue();
    
    // Próba załadowania Supabase
    try {
      const { getSupabase } = await import('./supabase-client.js');
      this.supabase = getSupabase();
    } catch (err) {
      console.log("Supabase niedostępny, tryb offline");
    }
  }

  checkVersion() {
    const stored = localStorage.getItem(LS_VERSION);
    if (!stored || parseInt(stored) < STORAGE_VERSION) {
      console.log("Migracja danych do wersji", STORAGE_VERSION);
      localStorage.setItem(LS_VERSION, STORAGE_VERSION);
    }
  }

  // CREATE
  async create(table, data) {
    if (!TABLES.includes(table)) throw new Error(`Nieznana tabela: ${table}`);
    
    const id = data.id || `${table}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const item = {
      ...data,
      id,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false
    };

    // Zapisz lokalnie
    this.saveLocal(table, id, item);

    // Dodaj do kolejki offline
    this.addToQueue({ action: "create", table, id, data: item });

    // Jeśli online i Supabase dostępny, synchronizuj
    if (navigator.onLine && this.supabase) {
      try {
        await this.supabase.from(table).insert(item);
        this.removeFromQueue(id);
      } catch (err) {
        console.error("Błąd zapisu do Supabase:", err);
      }
    }

    return item;
  }

  // READ
  async get(table, id) {
    if (!TABLES.includes(table)) throw new Error(`Nieznana tabela: ${table}`);
    
    const key = `${LS_PREFIX}${table}:${id}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }

  async getAll(table, filter = {}) {
    if (!TABLES.includes(table)) throw new Error(`Nieznana tabela: ${table}`);
    
    const items = [];
    const prefix = `${LS_PREFIX}${table}:`;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const item = JSON.parse(raw);
          
          // Zastosuj filtry
          let matches = true;
          for (const [field, value] of Object.entries(filter)) {
            if (item[field] !== value) {
              matches = false;
              break;
            }
          }
          
          if (matches) items.push(item);
        }
      }
    }

    return items;
  }

  // UPDATE
  async update(table, id, updates) {
    if (!TABLES.includes(table)) throw new Error(`Nieznana tabela: ${table}`);
    
    const existing = await this.get(table, id);
    if (!existing) throw new Error(`Nie znaleziono: ${id}`);

    const updated = {
      ...existing,
      ...updates,
      id,
      updatedAt: new Date().toISOString()
    };

    this.saveLocal(table, id, updated);
    this.addToQueue({ action: "update", table, id, data: updates });

    if (navigator.onLine && this.supabase) {
      try {
        await this.supabase.from(table).update(updates).eq('id', id);
        this.removeFromQueue(id);
      } catch (err) {
        console.error("Błąd aktualizacji w Supabase:", err);
      }
    }

    return updated;
  }

  // DELETE
  async delete(table, id) {
    if (!TABLES.includes(table)) throw new Error(`Nieznana tabela: ${table}`);
    
    const item = await this.get(table, id);
    if (!item) return;

    // Soft delete
    const deleted = { ...item, deleted: true, updatedAt: new Date().toISOString() };
    this.saveLocal(table, id, deleted);
    this.addToQueue({ action: "delete", table, id });

    if (navigator.onLine && this.supabase) {
      try {
        await this.supabase.from(table).update({ deleted: true }).eq('id', id);
        this.removeFromQueue(id);
      } catch (err) {
        console.error("Błąd usuwania w Supabase:", err);
      }
    }

    return deleted;
  }

  // HARD DELETE (usuwa z localStorage)
  async hardDelete(table, id) {
    const key = `${LS_PREFIX}${table}:${id}`;
    localStorage.removeItem(key);
  }

  // LOCAL STORAGE
  saveLocal(table, id, data) {
    const key = `${LS_PREFIX}${table}:${id}`;
    localStorage.setItem(key, JSON.stringify(data));
  }

  // OFFLINE QUEUE
  loadOfflineQueue() {
    try {
      const raw = localStorage.getItem(LS_QUEUE);
      this.offlineQueue = raw ? JSON.parse(raw) : [];
    } catch {
      this.offlineQueue = [];
    }
  }

  saveOfflineQueue() {
    try {
      localStorage.setItem(LS_QUEUE, JSON.stringify(this.offlineQueue));
    } catch (err) {
      console.error("Błąd zapisu kolejki:", err);
    }
  }

  addToQueue(operation) {
    // Usuń duplikaty dla tego samego id
    this.offlineQueue = this.offlineQueue.filter(op => op.id !== operation.id);
    this.offlineQueue.push(operation);
    this.saveOfflineQueue();
  }

  removeFromQueue(id) {
    this.offlineQueue = this.offlineQueue.filter(op => op.id !== id);
    this.saveOfflineQueue();
  }

  getOfflineQueue() {
    return this.offlineQueue;
  }

  // SYNCHRONIZACJA Z SUPABASE
  async syncWithSupabase() {
    if (!navigator.onLine) {
      console.log("Offline - synchronizacja pominięta");
      return { synced: 0, failed: 0 };
    }

    if (!this.supabase) {
      console.log("Supabase niedostępny");
      return { synced: 0, failed: 0 };
    }

    const queue = this.getOfflineQueue();
    if (!queue.length) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    for (const op of queue) {
      try {
        // Timeout 10 sekund dla każdej operacji
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 10000)
        );
        
        const syncPromise = this.performSync(op);
        
        await Promise.race([syncPromise, timeoutPromise]);
        
        synced++;
        this.removeFromQueue(op.id);
        
      } catch (err) {
        console.error("Sync błąd:", err);
        failed++;
        
        // Jeśli timeout lub błąd sieciowy, zatrzymaj synchronizację
        if (err.message === 'Timeout' || !navigator.onLine) {
          console.log("Synchronizacja przerwana - problemy z siecią");
          break;
        }
      }
    }

    return { synced, failed };
  }

  async performSync(op) {
    if (!this.supabase) throw new Error('Supabase niedostępny');

    switch (op.action) {
      case 'create':
        await this.supabase.from(op.table).insert(op.data);
        break;
      case 'update':
        await this.supabase.from(op.table).update(op.data).eq('id', op.id);
        break;
      case 'delete':
        await this.supabase.from(op.table).update({ deleted: true }).eq('id', op.id);
        break;
      default:
        throw new Error(`Nieznana akcja: ${op.action}`);
    }
  }

  // IMPORT/EXPORT
  exportData() {
    const data = {};
    for (const table of TABLES) {
      data[table] = [];
      const prefix = `${LS_PREFIX}${table}:`;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          const raw = localStorage.getItem(key);
          if (raw) data[table].push(JSON.parse(raw));
        }
      }
    }
    return data;
  }

  async importData(data) {
    for (const [table, items] of Object.entries(data)) {
      if (!TABLES.includes(table)) continue;
      
      for (const item of items) {
        this.saveLocal(table, item.id, item);
      }
    }
  }

  // CZYSZCZENIE
  clearAll() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LS_PREFIX)) {
        keys.push(key);
      }
    }
    keys.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem(LS_QUEUE);
    this.offlineQueue = [];
  }
}
