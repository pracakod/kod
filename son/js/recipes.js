"use strict";
import { Storage } from "./storage.js";
const LS_RECIPES_OUTBOX = "lista:recipes:outbox";
const LS_RECIPES_LASTSYNC = "lista:recipes:lastSync";
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const uuid = () => crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now = () => Date.now();
const DEFAULT_CATEGORIES = ["śniadania", "obiady", "kolacje", "desery", "wege"];
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
function toast(text, timeout = 2800) {
  const sb = qs("#snackbar");
  if (!sb) return;
  qs("#snackbar-text").textContent = text;
  const act = qs("#snackbar-action"); if (act) act.hidden = true;
  sb.hidden = false; sb.classList.add("show");
  setTimeout(() => { sb.hidden = true; sb.classList.remove("show"); }, timeout);
}
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
function loadOutbox() { try { return JSON.parse(localStorage.getItem(LS_RECIPES_OUTBOX)) || []; } catch { return []; } }
function saveOutbox(list) { try { localStorage.setItem(LS_RECIPES_OUTBOX, JSON.stringify(list)); } catch {} }
function lwwMergeRecipes(localArr, remoteArr) {
  const map = new Map();
  for (const r of localArr || []) map.set(r.id, r);
  for (const r of remoteArr || []) {
    const cur = map.get(r.id);
    if (!cur || (r.updated_at || 0) > (cur.updated_at || 0)) map.set(r.id, r);
  }
  return Array.from(map.values());
}
function ensureRecipesBucket() {
  if (!Array.isArray(Storage._db.recipes)) {
    Storage._db.recipes = [];
    try { Storage._saveDB?.(); } catch {}
  }
}
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
    qs("#btn-recipe-add")?.addEventListener("click", (e) => { e.preventDefault(); this.openDialog(); });
    qs("#recipes-filter-category")?.addEventListener("change", () => this.renderList());
    qs("#recipes-filter-time")?.addEventListener("change", () => this.renderList());
    qs("#recipes-filter-difficulty")?.addEventListener("change", () => this.renderList());
    qs("#recipes-search")?.addEventListener("input", () => this.renderList());
    qs("#recipes-list")?.addEventListener("click", (e) => {
      const li = e.target.closest(".card-item"); if (!li) return;
      const id = li.dataset.id;
      const favBtn = e.target.closest(".mark-favorite");
      const addBtn = e.target.closest(".add-to-shopping");
      if (favBtn) { this.toggleFavorite(id); return; }
      if (addBtn) { this.openToShoppingDialog(id); return; }
      this.openDialog(id);
    });
    await this.syncPull();
    this.renderFilters();
    this.renderList();
    window.addEventListener("online", () => this.processOutbox());
    setInterval(() => { if (navigator.onLine) this.processOutbox(); }, 45000);
  },
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
          <input id="rx-photo-file" type="file" accept="image
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
      console.info("syncPull recipes:", e?.message || e);
    }
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Recipes.init(window.Bus));
} else {
  Recipes.init(window.Bus);
}
export default Recipes;