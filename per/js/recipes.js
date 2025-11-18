/* ==========================================================================
   Lista — recipes.js
   Odpowiada za: System Przepisów
   - Tworzenie/edycja przepisu (nazwa, opis, kategoria, czas, trudność, porcje)
   - Składniki (ilość, jednostka, opcjonalność, kategoria sklepu)
   - Kroki przygotowania
   - Zdjęcia (kompresja i zapis jako dataURL)
   - Notatki, wartości odżywcze (opcjonalnie)
   - Ulubione i historia przygotowań
   - Wyszukiwanie i filtrowanie, ulubione
   - Szybkie dodanie składników do Zakupów (wybór listy, filtrowanie, przeliczanie porcji)
   - Offline-first + lokalna synchronizacja z Supabase (best-effort przez outbox)
   ========================================================================== */

"use strict";

import { Storage } from "./storage.js";

/* Konfiguracja lokalna */
const LS_RECIPES_OUTBOX = "lista:recipes:outbox";
const LS_RECIPES_LASTSYNC = "lista:recipes:lastSync";

/* Pomocnicze */
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const uuid = () => crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now = () => Date.now();

const DEFAULT_CATEGORIES = ["śniadania", "obiady", "kolacje", "desery", "wege"];

/* Supabase — bezpośrednie użycie klienta (dla tabeli recipes) */
let _createClient = null, _supabase = null;
const SUPABASE_URL = "https://vzttszvasssweigpqwcc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dHRzenZhc3Nzd2VpZ3Bxd2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNTM2ODEsImV4cCI6MjA3ODgyOTY4MX0.lRhUUWmtJX5yf-VYrVAIP94OH3ScAL5t3Zo8HrxTvlc";

async function ensureSupabase() {
  if (_supabase) return _supabase;
  if (!_createClient) {
    const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
    _createClient = mod.createClient;
  }
  _supabase = _createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: localStorage.getItem("lista:persistSession") === "1",
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return _supabase;
}
async function getUser() {
  const c = await ensureSupabase();
  const { data } = await c.auth.getSession();
  return data?.session?.user || null;
}

/* Snackbar */
function toast(text, timeout = 2800) {
  const sb = qs("#snackbar");
  if (!sb) return;
  qs("#snackbar-text").textContent = text;
  const act = qs("#snackbar-action"); if (act) act.hidden = true;
  sb.hidden = false; sb.classList.add("show");
  setTimeout(() => { sb.hidden = true; sb.classList.remove("show"); }, timeout);
}

/* Obraz -> dataURL (kompresja) */
function readFile(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}
async function compressDataURL(dataURL, maxW = 1400, quality = 0.88) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

/* Outbox operacji (offline) */
function loadOutbox() { try { return JSON.parse(localStorage.getItem(LS_RECIPES_OUTBOX)) || []; } catch { return []; } }
function saveOutbox(list) { try { localStorage.setItem(LS_RECIPES_OUTBOX, JSON.stringify(list)); } catch {} }

/* LWW merge dla przepisów */
function lwwMergeRecipes(localArr, remoteArr) {
  const map = new Map();
  for (const r of localArr || []) map.set(r.id, r);
  for (const r of remoteArr || []) {
    const cur = map.get(r.id);
    if (!cur || (r.updated_at || 0) > (cur.updated_at || 0)) map.set(r.id, r);
  }
  return Array.from(map.values());
}

/* Zapewnienie miejsca w Storage._db na recipes (bez kolejkowania Storage.upsert) */
function ensureRecipesBucket() {
  if (!Array.isArray(Storage._db.recipes)) {
    Storage._db.recipes = [];
    try { Storage._saveDB?.(); } catch {}
  }
}

/* Dane + UI */
export const Recipes = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  _editingId: null,

  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;

    await Storage.init?.();
    ensureRecipesBucket();

    // Wiązania UI
    qs("#btn-recipe-add")?.addEventListener("click", (e) => { e.preventDefault(); this.openDialog(); });

    qs("#recipes-filter-category")?.addEventListener("change", () => this.renderList());
    qs("#recipes-filter-time")?.addEventListener("change", () => this.renderList());
    qs("#recipes-filter-difficulty")?.addEventListener("change", () => this.renderList());
    qs("#recipes-search")?.addEventListener("input", () => this.renderList());

    // Delegacja na liście kart
    qs("#recipes-list")?.addEventListener("click", (e) => {
      const li = e.target.closest(".card-item"); if (!li) return;
      const id = li.dataset.id;

      const favBtn = e.target.closest(".mark-favorite");
      const addBtn = e.target.closest(".add-to-shopping");

      if (favBtn) { this.toggleFavorite(id); return; }
      if (addBtn) { this.openToShoppingDialog(id); return; }

      // kliknięcie karty — edycja
      this.openDialog(id);
    });

    // Wczytaj i wyrenderuj
    await this.syncPull();
    this.renderFilters();
    this.renderList();

    // Outbox po powrocie online i okresowo
    window.addEventListener("online", () => this.processOutbox());
    setInterval(() => { if (navigator.onLine) this.processOutbox(); }, 45000);
  },

  /* --------------------------- Render ----------------------------------- */
  getAll() {
    ensureRecipesBucket();
    return (Storage._db.recipes || []).slice().sort((a,b) => (b.updated_at||0) - (a.updated_at||0));
  },

  renderFilters() {
    const all = this.getAll();
    const sel = qs("#recipes-filter-category"); if (!sel) return;
    const prev = sel.value || "";
    const cats = new Set(DEFAULT_CATEGORIES);
    all.forEach(r => { if (r.category) cats.add(String(r.category).toLowerCase()); });
    sel.innerHTML = `<option value="">Kategoria: wszystkie</option>`;
    Array.from(cats).sort((a,b)=>a.localeCompare(b)).forEach(c => {
      const opt = document.createElement("option"); opt.value = c; opt.textContent = c[0].toUpperCase()+c.slice(1);
      sel.appendChild(opt);
    });
    if (Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
  },

  renderList() {
    const ul = qs("#recipes-list"); if (!ul) return;
    const all = this.getAll();

    const q = (qs("#recipes-search")?.value || "").trim().toLowerCase();
    const cat = (qs("#recipes-filter-category")?.value || "").toLowerCase();
    const time = qs("#recipes-filter-time")?.value || "";
    const diff = qs("#recipes-filter-difficulty")?.value || "";

    const timeFilter = (min) => {
      if (!time) return true;
      const v = Number(min || 0);
      if (time === "lt15") return v > 0 && v <= 15;
      if (time === "lt30") return v > 0 && v <= 30;
      if (time === "lt60") return v > 0 && v <= 60;
      if (time === "gte60") return v >= 60;
      return true;
    };

    const filtered = all.filter(r => {
      if (cat && String(r.category || "").toLowerCase() !== cat) return false;
      if (diff && String(r.difficulty || "") !== diff) return false;
      if (!timeFilter(r.time_min)) return false;
      if (q) {
        const hay = [
          r.title || "",
          r.description || "",
          (r.ingredients || []).map(i => i.name || "").join(" ")
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    ul.innerHTML = "";
    for (const r of filtered) {
      const tpl = qs("#tpl-recipe-card");
      const li = tpl?.content?.firstElementChild?.cloneNode(true) || document.createElement("li");
      li.className = li.className || "card-item";
      li.dataset.id = r.id;

      li.querySelector(".card-title")?.replaceChildren(document.createTextNode(r.title || "Przepis"));
      const meta = li.querySelector(".card-meta");
      if (meta) {
        meta.querySelector(".recipe-category").textContent = (r.category || "—");
        meta.querySelector(".recipe-time").textContent = (r.time_min ? `${r.time_min} min` : "czas —");
        meta.querySelector(".recipe-difficulty").textContent = (r.difficulty === "easy" ? "Łatwa" : r.difficulty === "hard" ? "Trudna" : "Średnia");
      }
      const favBtn = li.querySelector(".mark-favorite");
      if (favBtn) {
        if (r.favorite) favBtn.classList.add("notify-dot");
        else favBtn.classList.remove("notify-dot");
      }
      ul.appendChild(li);
    }

    if (!ul.children.length) {
      const info = document.createElement("div");
      info.className = "muted small";
      info.textContent = "Brak przepisów spełniających kryteria. Dodaj nowy przepis.";
      ul.appendChild(info);
    }
  },

  /* ----------------------- Dialog dodawania/edycji ---------------------- */
  ensureDialog() {
    let dlg = qs("#dialog-recipe");
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.id = "dialog-recipe";
    dlg.className = "dialog dialog-full";
    dlg.innerHTML = `
      <div class="dialog-content">
        <h3><i class="icon icon-recipe"></i> Przepis</h3>
        <div class="grid-2">
          <label>Nazwa <input id="rx-title" type="text" required></label>
          <label>Kategoria <input id="rx-category" type="text" placeholder="np. obiady, desery"></label>
        </div>
        <div class="grid-2">
          <label>Czas (min) <input id="rx-time" type="number" min="0" step="1"></label>
          <label>Trudność
            <select id="rx-difficulty">
              <option value="easy">Łatwa</option>
              <option value="medium" selected>Średnia</option>
              <option value="hard">Trudna</option>
            </select>
          </label>
        </div>
        <div class="grid-2">
          <label>Porcje <input id="rx-servings" type="number" min="1" step="1" value="2"></label>
          <label>Ulubione <input id="rx-favorite" type="checkbox"></label>
        </div>
        <label>Opis <textarea id="rx-description" rows="3" placeholder="Krótki opis…"></textarea></label>

        <div id="rx-ingredients">
          <h4>Składniki</h4>
          <div id="rx-ing-list" style="display:grid;gap:8px;"></div>
          <button id="rx-add-ing" type="button" class="btn-secondary"><i class="icon icon-plus"></i> Dodaj składnik</button>
        </div>

        <div id="rx-steps">
          <h4>Kroki</h4>
          <div id="rx-steps-list" style="display:grid;gap:8px;"></div>
          <button id="rx-add-step" type="button" class="btn-secondary"><i class="icon icon-plus"></i> Dodaj krok</button>
        </div>

        <div id="rx-photos">
          <h4>Zdjęcia</h4>
          <input id="rx-photo-file" type="file" accept="image/*" multiple>
          <div id="rx-photo-previews" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;"></div>
        </div>

        <div class="grid-2">
          <label>Notatki <textarea id="rx-notes" rows="3"></textarea></label>
          <div>
            <h4>Wartości odżywcze</h4>
            <div class="grid-2">
              <label>kcal <input id="rx-kcal" type="number" min="0" step="1"></label>
              <label>Białko (g) <input id="rx-prot" type="number" min="0" step="0.1"></label>
              <label>Węgl. (g) <input id="rx-carb" type="number" min="0" step="0.1"></label>
              <label>Tłuszcz (g) <input id="rx-fat" type="number" min="0" step="0.1"></label>
            </div>
          </div>
        </div>

        <menu class="dialog-actions">
          <button id="rx-delete" class="btn-danger-outline" type="button"><i class="icon icon-delete"></i> Usuń</button>
          <span style="flex:1 1 auto;"></span>
          <button id="rx-cancel" class="btn-ghost" type="button">Anuluj</button>
          <button id="rx-save" class="btn-primary" type="button"><i class="icon icon-check"></i> Zapisz</button>
        </menu>
      </div>
    `;
    document.body.appendChild(dlg);

    qs("#rx-add-ing", dlg).addEventListener("click", () => this._addIngRow());
    qs("#rx-add-step", dlg).addEventListener("click", () => this._addStepRow());
    qs("#rx-photo-file", dlg).addEventListener("change", (e) => this._handlePhotos(e));
    qs("#rx-cancel", dlg).addEventListener("click", () => dlg.close());
    qs("#rx-save", dlg).addEventListener("click", () => this._saveFromDialog());
    qs("#rx-delete", dlg).addEventListener("click", () => this._deleteFromDialog());
    return dlg;
  },

  _addIngRow(data = {}) {
    const list = qs("#rx-ing-list");
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1.2fr .6fr .6fr .8fr .8fr auto";
    row.style.gap = "6px"; row.style.alignItems = "center";
    row.innerHTML = `
      <input type="text" placeholder="Składnik" value="${data.name || ""}">
      <input type="number" placeholder="Ilość" step="0.01" min="0" value="${data.qty ?? ""}">
      <input type="text" placeholder="Jedn." value="${data.unit || ""}">
      <input type="text" placeholder="Kategoria sklepu" value="${data.store_category || ""}">
      <label class="small muted"><input type="checkbox" ${data.optional ? "checked" : ""}> Opcjonalne</label>
      <button type="button" class="icon-btn" title="Usuń wiersz"><i class="icon icon-delete"></i></button>
    `;
    row.querySelector("button").addEventListener("click", () => row.remove());
    list.appendChild(row);
  },

  _addStepRow(text = "") {
    const list = qs("#rx-steps-list");
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr auto";
    row.style.gap = "6px";
    row.innerHTML = `
      <input type="text" placeholder="Opis kroku" value="${text || ""}">
      <button type="button" class="icon-btn" title="Usuń krok"><i class="icon icon-delete"></i></button>
    `;
    row.querySelector("button").addEventListener("click", () => row.remove());
    list.appendChild(row);
  },

  async _handlePhotos(e) {
    const list = qs("#rx-photo-previews");
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const dataURL = await readFile(f);
      const compressed = await compressDataURL(dataURL, 1400, 0.9);
      const img = document.createElement("img");
      img.src = compressed;
      img.alt = "Zdjęcie przepisu";
      img.style.width = "96px";
      img.style.height = "96px";
      img.style.objectFit = "cover";
      img.style.border = "1px solid var(--border)";
      img.style.borderRadius = "10px";
      img.dataset.dataUrl = compressed;
      // Kliknięcie usuwa
      img.addEventListener("click", () => img.remove());
      list.appendChild(img);
    }
    // wyczyść input
    e.target.value = "";
  },

  openDialog(id = null) {
    const dlg = this.ensureDialog();
    this._editingId = id;

    // Wyczyść pola
    qs("#rx-title").value = "";
    qs("#rx-category").value = "";
    qs("#rx-time").value = "";
    qs("#rx-difficulty").value = "medium";
    qs("#rx-servings").value = "2";
    qs("#rx-favorite").checked = false;
    qs("#rx-description").value = "";
    qs("#rx-notes").value = "";
    qs("#rx-kcal").value = "";
    qs("#rx-prot").value = "";
    qs("#rx-carb").value = "";
    qs("#rx-fat").value = "";
    qs("#rx-ing-list").innerHTML = "";
    qs("#rx-steps-list").innerHTML = "";
    qs("#rx-photo-previews").innerHTML = "";

    // Gdy edycja — uzupełnij
    if (id) {
      const rec = this.getAll().find(r => r.id === id);
      if (rec) {
        qs("#rx-title").value = rec.title || "";
        qs("#rx-category").value = rec.category || "";
        qs("#rx-time").value = rec.time_min || "";
        qs("#rx-difficulty").value = rec.difficulty || "medium";
        qs("#rx-servings").value = rec.servings || 2;
        qs("#rx-favorite").checked = !!rec.favorite;
        qs("#rx-description").value = rec.description || "";
        qs("#rx-notes").value = rec.notes || "";
        qs("#rx-kcal").value = rec.nutrition?.kcal || "";
        qs("#rx-prot").value = rec.nutrition?.protein || "";
        qs("#rx-carb").value = rec.nutrition?.carbs || "";
        qs("#rx-fat").value = rec.nutrition?.fat || "";
        (rec.ingredients || []).forEach(i => this._addIngRow(i));
        (rec.steps || []).forEach(s => this._addStepRow(s));
        (rec.photos || []).forEach(p => {
          const img = document.createElement("img");
          img.src = p; img.alt = "Zdjęcie przepisu";
          img.style.width = "96px"; img.style.height = "96px"; img.style.objectFit = "cover";
          img.style.border = "1px solid var(--border)"; img.style.borderRadius = "10px";
          img.dataset.dataUrl = p; img.addEventListener("click", () => img.remove());
          qs("#rx-photo-previews").appendChild(img);
        });
      }
    }

    // Widoczność przycisku Usuń
    qs("#rx-delete").style.display = id ? "" : "none";

    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  },

  _collectFromDialog() {
    const title = qs("#rx-title").value.trim();
    if (!title) { toast("Uzupełnij nazwę przepisu."); return null; }
    const servings = Math.max(1, parseInt(qs("#rx-servings").value || "2", 10));
    const ingredients = [];
    qsa("#rx-ing-list > div").forEach(row => {
      const [nameEl, qtyEl, unitEl, catEl, optWrap] = row.querySelectorAll("input");
      const name = nameEl.value.trim();
      if (!name) return;
      const qty = qtyEl.value ? Number(qtyEl.value) : null;
      const unit = unitEl.value.trim();
      const store_category = catEl.value.trim();
      const optional = optWrap.checked;
      ingredients.push({ name, qty, unit, optional, store_category });
    });
    const steps = [];
    qsa("#rx-steps-list > div input").forEach(inp => {
      const t = inp.value.trim(); if (t) steps.push(t);
    });
    const photos = [];
    qsa("#rx-photo-previews img").forEach(img => {
      if (img.dataset.dataUrl) photos.push(img.dataset.dataUrl);
    });
    const rec = {
      id: this._editingId || uuid(),
      title,
      description: qs("#rx-description").value.trim(),
      category: qs("#rx-category").value.trim().toLowerCase(),
      time_min: qs("#rx-time").value ? Number(qs("#rx-time").value) : null,
      difficulty: qs("#rx-difficulty").value || "medium",
      servings,
      ingredients,
      steps,
      photos,
      notes: qs("#rx-notes").value,
      nutrition: {
        kcal: qs("#rx-kcal").value ? Number(qs("#rx-kcal").value) : null,
        protein: qs("#rx-prot").value ? Number(qs("#rx-prot").value) : null,
        carbs: qs("#rx-carb").value ? Number(qs("#rx-carb").value) : null,
        fat: qs("#rx-fat").value ? Number(qs("#rx-fat").value) : null
      },
      favorite: !!qs("#rx-favorite").checked,
      history: (this.getAll().find(r => r.id === (this._editingId || ""))?.history) || [],
      updated_at: now(),
      created_at: this.getAll().find(r => r.id === (this._editingId || ""))?.created_at || now()
    };
    return rec;
  },

  _saveLocal(rec) {
    ensureRecipesBucket();
    const arr = Storage._db.recipes;
    const i = arr.findIndex(x => x.id === rec.id);
    if (i >= 0) arr[i] = rec; else arr.push(rec);
    try { Storage._saveDB?.(); } catch {}
  },

  async _enqueueOutbox(op, rec) {
    const box = loadOutbox();
    box.push({ id: uuid(), op, data: { ...rec }, ts: now() });
    saveOutbox(box);
    // próbuj natychmiast
    if (navigator.onLine) await this.processOutbox();
  },

  async _saveFromDialog() {
    const rec = this._collectFromDialog();
    if (!rec) return;
    this._saveLocal(rec);
    await this._enqueueOutbox("upsert", rec);
    toast("Przepis zapisano.");
    this.renderFilters();
    this.renderList();
    qs("#dialog-recipe")?.close();
  },

  async _deleteFromDialog() {
    const id = this._editingId;
    if (!id) { qs("#dialog-recipe")?.close(); return; }
    if (!confirm("Czy usunąć przepis?")) return;
    ensureRecipesBucket();
    const arr = Storage._db.recipes;
    const idx = arr.findIndex(r => r.id === id);
    if (idx >= 0) {
      const rec = arr[idx];
      arr.splice(idx, 1);
      try { Storage._saveDB?.(); } catch {}
      await this._enqueueOutbox("delete", { id: rec.id, updated_at: now() });
    }
    toast("Przepis usunięto.");
    this.renderFilters();
    this.renderList();
    qs("#dialog-recipe")?.close();
  },

  async toggleFavorite(id) {
    ensureRecipesBucket();
    const arr = Storage._db.recipes;
    const r = arr.find(x => x.id === id);
    if (!r) return;
    r.favorite = !r.favorite;
    r.updated_at = now();
    try { Storage._saveDB?.(); } catch {}
    await this._enqueueOutbox("upsert", r);
    this.renderList();
  },

  /* ----------------------- Do Zakupów (dialog) -------------------------- */
  ensureToShoppingDialog() {
    let dlg = qs("#dialog-recipe-to-shopping");
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.id = "dialog-recipe-to-shopping";
    dlg.className = "dialog";
    dlg.innerHTML = `
      <form class="dialog-content" method="dialog">
        <h3><i class="icon icon-cart"></i> Dodaj składniki do Zakupów</h3>
        <div class="grid-2">
          <label>Lista zakupów
            <select id="rt-list"></select>
          </label>
          <label>Porcje
            <input id="rt-servings" type="number" min="1" step="1" value="2">
          </label>
        </div>
        <div id="rt-ings" style="max-height:40vh;overflow:auto;border:1px solid var(--border);border-radius:12px;padding:8px;display:grid;gap:8px;"></div>
        <menu class="dialog-actions">
          <button value="cancel" class="btn-ghost">Anuluj</button>
          <button id="rt-add" class="btn-primary"><i class="icon icon-check"></i> Dodaj</button>
        </menu>
      </form>
    `;
    document.body.appendChild(dlg);
    qs("#rt-add", dlg).addEventListener("click", (e) => { e.preventDefault(); this._confirmAddToShopping(); });
    return dlg;
  },

  openToShoppingDialog(recipeId) {
    ensureRecipesBucket();
    const rec = Storage._db.recipes.find(r => r.id === recipeId);
    if (!rec) return;
    this._toShopCurrent = rec;

    const dlg = this.ensureToShoppingDialog();
    const sel = qs("#rt-list", dlg);
    sel.innerHTML = "";
    const snap = Storage.getSnapshot?.() || {};
    (snap.shopping_lists || []).forEach(l => {
      const opt = document.createElement("option"); opt.value = l.id; opt.textContent = l.name || "Lista";
      sel.appendChild(opt);
    });
    if (!sel.value && sel.firstElementChild) sel.value = sel.firstElementChild.value;

    qs("#rt-servings", dlg).value = String(rec.servings || 2);

    const wrap = qs("#rt-ings", dlg);
    wrap.innerHTML = "";
    (rec.ingredients || []).forEach((i, idx) => {
      const row = document.createElement("label");
      row.style.display = "grid"; row.style.gridTemplateColumns = "auto 1fr auto"; row.style.gap = "8px"; row.style.alignItems = "center";
      row.innerHTML = `
        <input type="checkbox" checked data-index="${idx}">
        <div><strong>${i.name}</strong> <span class="small muted">${i.optional ? "(opcjonalne)" : ""}</span><div class="small muted">${i.store_category || ""}</div></div>
        <div class="small muted">${i.qty ?? ""} ${i.unit ?? ""}</div>
      `;
      wrap.appendChild(row);
    });

    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  },

  _confirmAddToShopping() {
    const rec = this._toShopCurrent; if (!rec) return;
    const listId = qs("#rt-list").value;
    if (!listId) { toast("Brak listy zakupów."); return; }
    const targetServ = Math.max(1, parseInt(qs("#rt-servings").value || String(rec.servings || 2), 10));
    const scale = (rec.servings && rec.servings > 0) ? (targetServ / rec.servings) : 1;

    const checkedIdx = Array.from(qsa('#rt-ings input[type="checkbox"]')).filter(cb => cb.checked).map(cb => Number(cb.dataset.index));

    let added = 0;
    (rec.ingredients || []).forEach((i, idx) => {
      if (!checkedIdx.includes(idx)) return;
      const qty = (typeof i.qty === "number" ? (Math.round(i.qty * scale * 100) / 100) : null);
      const name = i.name + (i.unit ? ` (${qty ?? ""} ${i.unit})` : (qty ? ` (${qty})` : ""));
      const payload = {
        id: uuid(),
        list_id: listId,
        name,
        qty: qty ?? 1,
        category: i.store_category || "",
        store: "",
        cost: 0,
        bought: false,
        oos: false,
        updated_at: now()
      };
      try { Storage.upsert("shopping_items", payload); added++; } catch {}
    });

    toast(added ? `Dodano ${added} pozycji do zakupów.` : "Nie wybrano żadnych składników.");
    qs("#dialog-recipe-to-shopping")?.close();
  },

  /* ----------------------------- Sync ----------------------------------- */
  async processOutbox() {
    const user = await getUser();
    if (!user || !navigator.onLine) return;
    const c = await ensureSupabase();
    const box = loadOutbox();
    let changed = false;

    for (const rec of box) {
      if (rec.status === "sent") continue;
      try {
        if (rec.op === "upsert") {
          const row = this._toServerRow(rec.data, user.id);
          const { error } = await c.from("recipes").upsert(row, { onConflict: "id" });
          if (error) throw error;
        } else if (rec.op === "delete") {
          const { error } = await c.from("recipes").delete().eq("id", rec.data.id);
          if (error) throw error;
        }
        rec.status = "sent"; rec.sent_at = now(); changed = true;
      } catch (e) {
        // pozostaw w kolejce
        // jeżeli błąd krytyczny (np. brak tabeli), przerwij, by nie zapętlać
        if (String(e?.message || e).includes("42P01")) break;
      }
    }
    if (changed) saveOutbox(box);
  },

  _toServerRow(local, userId) {
    return {
      id: local.id,
      user_id: userId,
      title: local.title,
      description: local.description,
      category: local.category,
      time_min: local.time_min,
      difficulty: local.difficulty,
      servings: local.servings,
      ingredients: local.ingredients,
      steps: local.steps,
      photos: local.photos,
      notes: local.notes,
      nutrition: local.nutrition,
      favorite: local.favorite,
      history: local.history,
      updated_at: new Date(local.updated_at || now()).toISOString(),
      created_at: new Date(local.created_at || now()).toISOString()
    };
  },

  async syncPull() {
    const user = await getUser();
    if (!user || !navigator.onLine) return;
    const c = await ensureSupabase();
    let sinceIso = "1970-01-01T00:00:00.000Z";
    try {
      const since = parseInt(localStorage.getItem(LS_RECIPES_LASTSYNC) || "0", 10);
      if (since > 0) sinceIso = new Date(since).toISOString();
    } catch {}

    try {
      const { data, error } = await c.from("recipes")
        .select("*")
        .eq("user_id", user.id)
        .gt("updated_at", sinceIso)
        .order("updated_at", { ascending: true });
      if (error) throw error;

      const remote = (data || []).map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        time_min: r.time_min,
        difficulty: r.difficulty,
        servings: r.servings,
        ingredients: r.ingredients || [],
        steps: r.steps || [],
        photos: r.photos || [],
        notes: r.notes || "",
        nutrition: r.nutrition || {},
        favorite: !!r.favorite,
        history: r.history || [],
        updated_at: r.updated_at ? new Date(r.updated_at).getTime() : now(),
        created_at: r.created_at ? new Date(r.created_at).getTime() : now()
      }));

      ensureRecipesBucket();
      Storage._db.recipes = lwwMergeRecipes(Storage._db.recipes, remote);
      try { Storage._saveDB?.(); } catch {}
      localStorage.setItem(LS_RECIPES_LASTSYNC, String(now()));
    } catch (e) {
      // brak tabeli lub inne — pomiń
      console.info("syncPull recipes:", e?.message || e);
    }
  }
};

/* Inicjalizacja samoczynna */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Recipes.init(window.Bus));
} else {
  Recipes.init(window.Bus);
}

export default Recipes;