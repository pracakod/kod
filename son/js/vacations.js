"use strict";
import { Storage } from "./storage.js";
const SUPABASE_URL = "https://vzttszvasssweigpqwcc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dHRzenZhc3Nzd2VpZ3Bxd2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNTM2ODEsImV4cCI6MjA3ODgyOTY4MX0.lRhUUWmtJX5yf-VYrVAIP94OH3ScAL5t3Zo8HrxTvlc";
let _createClient = null, _supabase = null;
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
const LS_VAC_OUTBOX = "lista:vac:outbox";
const LS_VAC_LASTSYNC = "lista:vac:lastSync";
function loadOutbox() { try { return JSON.parse(localStorage.getItem(LS_VAC_OUTBOX)) || []; } catch { return []; } }
function saveOutbox(list) { try { localStorage.setItem(LS_VAC_OUTBOX, JSON.stringify(list)); } catch {} }
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const uuid = () => crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now = () => Date.now();
const fmtDate = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" });
function toast(text, timeout = 3000) {
  const sb = qs("#snackbar"); if (!sb) return;
  qs("#snackbar-text").textContent = text;
  const act = qs("#snackbar-action"); if (act) act.hidden = true;
  sb.hidden = false; sb.classList.add("show");
  setTimeout(() => { sb.hidden = true; sb.classList.remove("show"); }, timeout);
}
function ensureVacationsBucket() {
  if (!Array.isArray(Storage._db.vacations)) {
    Storage._db.vacations = [];
    try { Storage._saveDB?.(); } catch {}
  }
}
const PACK_TEMPLATES = {
  gory: {
    name: "Góry",
    items: [
      ["Dokumenty", "Dowód osobisty", 1], ["Dokumenty", "Ubezpieczenie turystyczne", 1],
      ["Ubrania", "Buty trekkingowe", 1], ["Ubrania", "Kurtka przeciwdeszczowa", 1],
      ["Ubrania", "Bielizna termiczna", 2],
      ["Elektronika", "Powerbank", 1], ["Elektronika", "Latarka czołowa", 1],
      ["Apteczka", "Plastry/Opatrunki", 1], ["Akcesoria", "Plecak 30–40l", 1],
    ]
  },
  morze: {
    name: "Morze",
    items: [
      ["Dokumenty", "Dowód osobisty", 1],
      ["Ubrania", "Strój kąpielowy", 1], ["Ubrania", "Klapki", 1], ["Ubrania", "Okulary przeciwsłoneczne", 1],
      ["Kosmetyki", "Krem z filtrem SPF", 1, true],
      ["Elektronika", "Ładowarka do telefonu", 1],
      ["Akcesoria", "Ręcznik plażowy", 1], ["Akcesoria", "Parasolka/Parasol plażowy", 1],
      ["Jedzenie i napoje", "Woda", 2, true],
    ]
  },
  miasto: {
    name: "Miasto",
    items: [
      ["Dokumenty", "Dowód osobisty", 1], ["Dokumenty", "Bilety/Rezerwacje", 1],
      ["Ubrania", "Wygodne buty", 1], ["Ubrania", "Kurtka lekka", 1],
      ["Elektronika", "Powerbank", 1], ["Elektronika", "Słuchawki", 1],
      ["Akcesoria", "Butelka filtrująca", 1, true],
      ["Jedzenie i napoje", "Przekąski na drogę", 1, true]
    ]
  },
  biznes: {
    name: "Biznes",
    items: [
      ["Dokumenty", "Dowód/Passport", 1], ["Dokumenty", "Bilety/Wejściówki", 1],
      ["Ubrania", "Garnitur/Koszula", 1], ["Ubrania", "Buty wizytowe", 1],
      ["Elektronika", "Laptop + zasilacz", 1], ["Elektronika", "Adapter do gniazdek", 1],
      ["Akcesoria", "Notes/Długopis", 1]
    ]
  }
};
const DEFAULT_BUDGET_CATEGORIES = ["Noclegi", "Transport", "Jedzenie", "Atrakcje", "Inne"];
function dateInRange(iso, from, to) {
  if (!iso) return false;
  const d = new Date(iso).setHours(0,0,0,0);
  const a = new Date(from).setHours(0,0,0,0);
  const b = new Date(to).setHours(0,0,0,0);
  return d >= a && d <= b;
}
function computeBudgetTotals(budget) {
  const items = budget?.items || [];
  const planned = items.reduce((s, i) => s + Number(i.planned || 0), 0);
  const actual = items.reduce((s, i) => s + Number(i.actual || 0), 0);
  return { planned, actual, savings: planned - actual };
}
function packingStats(v) {
  const items = v?.packing || [];
  const total = items.length;
  const packed = items.filter(i => i.packed).length;
  const toBuy = items.filter(i => i.to_buy).length;
  return { total, packed, toBuy };
}
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=7`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Pobieranie prognozy nie powiodło się.");
  const data = await res.json();
  const out = [];
  const days = data?.daily?.time || [];
  for (let i = 0; i < days.length; i++) {
    out.push({
      date: data.daily.time[i],
      tmin: data.daily.temperature_2m_min[i],
      tmax: data.daily.temperature_2m_max[i],
      code: data.daily.weathercode[i]
    });
  }
  return out;
}
export const Vacations = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  _editingId: null,
  _toSectionCache: null,
  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;
    await Storage.init?.();
    ensureVacationsBucket();
    qs("#btn-vacation-create")?.addEventListener("click", () => this.openEditor());
    this._ensureFilters();
    qs("#vacations-filter")?.addEventListener("change", () => this.renderList());
    qs("#vacations-list")?.addEventListener("click", (e) => {
      const li = e.target.closest(".card-item"); if (!li) return;
      const id = li.dataset.id;
      if (e.target.closest(".to-checklist")) { this.openToChecklistDialog(id); return; }
      if (e.target.closest(".to-tasks")) { this.openToTasksDialog(id); return; }
      if (e.target.closest(".to-shopping")) { this.openToShoppingDialog(id); return; }
      if (e.target.closest(".card-actions")) return;
      this.openEditor(id);
    });
    this._bindLongPressDelete();
    this._bus.on?.("storage:synced", () => this.renderList());
    window.addEventListener("online", () => this.processOutbox());
    setInterval(() => { if (navigator.onLine) this.processOutbox(); }, 45000);
    this.renderList();
  },
  getAll() {
    ensureVacationsBucket();
    return (Storage._db.vacations || []).slice().sort((a,b) => (b.updated_at || 0) - (a.updated_at || 0));
  },
  _ensureFilters() {
    const sel = qs("#vacations-filter");
    if (!sel) return;
    if (!sel.dataset.enriched) {
      sel.dataset.enriched = "1";
      const opts = [
        { v: "", t: "Wszystkie plany" },
        { v: "active", t: "W trakcie" },
        { v: "upcoming", t: "Nadchodzące" },
        { v: "past", t: "Zakończone" }
      ];
      sel.innerHTML = "";
      opts.forEach(o => {
        const op = document.createElement("option"); op.value = o.v; op.textContent = o.t; sel.appendChild(op);
      });
    }
  },
  renderList() {
    const ul = qs("#vacations-list"); if (!ul) return;
    const filter = qs("#vacations-filter")?.value || "";
    const all = this.getAll();
    const today = new Date().toISOString().slice(0,10);
    const filtered = all.filter(v => {
      if (!filter) return true;
      if (filter === "active") return v.start_date && v.end_date && dateInRange(today, v.start_date, v.end_date);
      if (filter === "upcoming") return v.start_date && v.start_date > today;
      if (filter === "past") return v.end_date && v.end_date < today;
      return true;
    });
    ul.innerHTML = "";
    for (const v of filtered) {
      const tpl = qs("#tpl-vacation-card");
      const li = tpl?.content?.firstElementChild?.cloneNode(true) || document.createElement("li");
      li.className = li.className || "card-item"; li.dataset.id = v.id;
      li.querySelector(".card-title")?.replaceChildren(document.createTextNode(v.name || "Wyjazd"));
      const meta = li.querySelector(".card-meta");
      if (meta) {
        const dates = (v.start_date && v.end_date) ? `${fmtDate.format(new Date(v.start_date))} – ${fmtDate.format(new Date(v.end_date))}` : "—";
        meta.querySelector(".vacation-dates").textContent = dates;
        meta.querySelector(".vacation-destination").textContent = v.destination?.name || "—";
      }
      const stats = packingStats(v);
      const hint = document.createElement("div");
      hint.className = "small muted";
      hint.textContent = `Spakowano ${stats.packed}/${stats.total}${stats.toBuy ? ` • Do kupienia: ${stats.toBuy}` : ""}`;
      li.appendChild(hint);
      ul.appendChild(li);
    }
    if (!ul.children.length) {
      const info = document.createElement("div");
      info.className = "muted small";
      info.textContent = "Brak planów. Utwórz nowy plan wyjazdu.";
      ul.appendChild(info);
    }
  },
  _bindLongPressDelete() {
    const root = qs("#vacations-list"); if (!root) return;
    let timer = null, targetId = null;
    root.addEventListener("pointerdown", (e) => {
      const li = e.target.closest(".card-item"); if (!li) return;
      targetId = li.dataset.id;
      timer = setTimeout(() => {
        timer = null;
        if (!targetId) return;
        if (confirm("Czy przenieść plan do kosza?")) {
          ensureVacationsBucket();
          const arr = Storage._db.vacations;
          const idx = arr.findIndex(v => v.id === targetId);
          if (idx >= 0) {
            const rec = arr[idx]; arr.splice(idx, 1);
            try { Storage._saveDB?.(); } catch {}
            try { Storage.remove("vacations", rec.id, { permanent: false }); } catch {}
            this._enqueueOutbox("delete", { id: rec.id, updated_at: now() });
            toast("Plan przeniesiono do kosza.");
            this.renderList();
          }
        }
      }, 700);
    }, { passive: true });
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } targetId = null; };
    ["pointerup","pointercancel","pointerleave","scroll"].forEach(ev => root.addEventListener(ev, cancel, { passive: true }));
  },
  openEditor(id = null) {
    this._editingId = id;
    const dlg = this._ensureEditorDialog();
    this._fillEditor(id);
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  },
  _ensureEditorDialog() {
    let dlg = qs("#dialog-vacation");
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.id = "dialog-vacation";
    dlg.className = "dialog dialog-full";
    dlg.innerHTML = `
      <div class="dialog-content">
        <h3><i class="icon icon-vacation"></i> Plan wyjazdu</h3>
        <div class="grid-2">
          <label>Nazwa <input id="vx-name" type="text" required></label>
          <label>Cel podróży <input id="vx-destination" type="text" placeholder="Miasto/Kraj"></label>
        </div>
        <div class="grid-2">
          <label>Data startu <input id="vx-start" type="date"></label>
          <label>Data końca <input id="vx-end" type="date"></label>
        </div>
        <div class="options-group">
          <h3>Szablony wakacyjne</h3>
          <div class="options-row">
            <button type="button" class="btn-secondary" data-tpl="gory"><i class="icon icon-theme"></i> Góry</button>
            <button type="button" class="btn-secondary" data-tpl="morze"><i class="icon icon-theme"></i> Morze</button>
            <button type="button" class="btn-secondary" data-tpl="miasto"><i class="icon icon-theme"></i> Miasto</button>
            <button type="button" class="btn-secondary" data-tpl="biznes"><i class="icon icon-theme"></i> Biznes</button>
          </div>
        </div>
        <div class="options-group">
          <h3>Lista rzeczy</h3>
          <div id="vx-pack-list" style="display:grid;gap:8px;"></div>
          <div class="options-row">
            <button type="button" id="vx-pack-add" class="btn-secondary"><i class="icon icon-plus"></i> Dodaj pozycję</button>
            <button type="button" id="vx-pack-clear-buys" class="btn-secondary"><i class="icon icon-broom"></i> Oznacz kupione</button>
          </div>
        </div>
        <div class="options-group">
          <h3>Harmonogram</h3>
          <div id="vx-sched-list" style="display:grid;gap:8px;"></div>
          <button type="button" id="vx-sched-add" class="btn-secondary"><i class="icon icon-plus"></i> Dodaj zdarzenie</button>
        </div>
        <div class="options-group">
          <h3>Budżet</h3>
          <div id="vx-budget-list" style="display:grid;gap:8px;"></div>
          <div class="options-row">
            <button type="button" id="vx-budget-add" class="btn-secondary"><i class="icon icon-plus"></i> Dodaj kategorię</button>
            <div id="vx-budget-sum" class="small muted" style="margin-left:auto;"></div>
          </div>
        </div>
        <div class="options-group">
          <h3>Pogoda (opcjonalnie)</h3>
          <div class="grid-2">
            <label>Szerokość (lat) <input id="vx-lat" type="number" step="0.000001" placeholder="np. 52.2297"></label>
            <label>Długość (lon) <input id="vx-lon" type="number" step="0.000001" placeholder="np. 21.0122"></label>
          </div>
          <div class="options-row">
            <button type="button" id="vx-weather-fetch" class="btn-secondary"><i class="icon icon-refresh"></i> Pobierz prognozę (online)</button>
            <div id="vx-weather-info" class="small muted"></div>
          </div>
          <div id="vx-weather-rows" class="small" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;"></div>
        </div>
        <div class="options-group">
          <h3>Mapy i lokalizacje</h3>
          <div id="vx-places-list" style="display:grid;gap:8px;"></div>
          <button type="button" id="vx-place-add" class="btn-secondary"><i class="icon icon-plus"></i> Dodaj lokalizację</button>
        </div>
        <div class="options-group">
          <h3>Notatki</h3>
          <textarea id="vx-notes" rows="4" placeholder="Ważne informacje, adresy, numery…"></textarea>
        </div>
        <menu class="dialog-actions">
          <button type="button" id="vx-delete" class="btn-danger-outline"><i class="icon icon-delete"></i> Usuń</button>
          <span style="flex:1 1 auto;"></span>
          <button type="button" id="vx-cancel" class="btn-ghost">Anuluj</button>
          <button type="button" id="vx-save" class="btn-primary"><i class="icon icon-check"></i> Zapisz</button>
        </menu>
      </div>
    `;
    document.body.appendChild(dlg);
    qs('[data-tpl="gory"]', dlg)?.addEventListener("click", () => this._applyTemplate("gory"));
    qs('[data-tpl="morze"]', dlg)?.addEventListener("click", () => this._applyTemplate("morze"));
    qs('[data-tpl="miasto"]', dlg)?.addEventListener("click", () => this._applyTemplate("miasto"));
    qs('[data-tpl="biznes"]', dlg)?.addEventListener("click", () => this._applyTemplate("biznes"));
    qs("#vx-pack-add", dlg)?.addEventListener("click", () => this._addPackRow());
    qs("#vx-pack-clear-buys", dlg)?.addEventListener("click", () => this._markBuysAsBought());
    qs("#vx-sched-add", dlg)?.addEventListener("click", () => this._addSchedRow());
    qs("#vx-budget-add", dlg)?.addEventListener("click", () => this._addBudgetRow());
    qs("#vx-weather-fetch", dlg)?.addEventListener("click", () => this._fetchWeatherForEditing());
    qs("#vx-place-add", dlg)?.addEventListener("click", () => this._addPlaceRow());
    qs("#vx-cancel", dlg)?.addEventListener("click", () => dlg.close());
    qs("#vx-save", dlg)?.addEventListener("click", () => this._saveFromEditor());
    qs("#vx-delete", dlg)?.addEventListener("click", () => this._deleteFromEditor());
    return dlg;
  },
  _fillEditor(id) {
    const v = id ? this.getAll().find(x => x.id === id) : null;
    qs("#vx-name").value = v?.name || "";
    qs("#vx-destination").value = v?.destination?.name || "";
    qs("#vx-start").value = v?.start_date || "";
    qs("#vx-end").value = v?.end_date || "";
    qs("#vx-notes").value = v?.notes || "";
    const wrapPack = qs("#vx-pack-list"); wrapPack.innerHTML = "";
    (v?.packing || []).forEach(item => this._addPackRow(item));
    const wrapSched = qs("#vx-sched-list"); wrapSched.innerHTML = "";
    (v?.schedule || []).forEach(ev => this._addSchedRow(ev));
    const wrapBud = qs("#vx-budget-list"); wrapBud.innerHTML = "";
    const budItems = v?.budget?.items?.length ? v.budget.items : DEFAULT_BUDGET_CATEGORIES.map(c => ({ id: uuid(), category: c, planned: 0, actual: 0, note: "" }));
    budItems.forEach(b => this._addBudgetRow(b));
    this._updateBudgetSum();
    qs("#vx-lat").value = v?.weather?.lat ?? "";
    qs("#vx-lon").value = v?.weather?.lon ?? "";
    this._renderWeatherRows(v?.weather?.forecast || []);
    qs("#vx-weather-info").textContent = v?.weather?.last_fetch ? `Ostatnio zaktualizowano: ${fmtDate.format(new Date(v.weather.last_fetch))}` : "";
    const wrapPl = qs("#vx-places-list"); wrapPl.innerHTML = "";
    (v?.places || []).forEach(p => this._addPlaceRow(p));
    qs("#vx-delete").style.display = id ? "" : "none";
  },
  _addPackRow(data = {}) {
    const wrap = qs("#vx-pack-list");
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr 1.2fr .6fr auto auto auto";
    row.style.gap = "6px"; row.style.alignItems = "center";
    row.innerHTML = `
      <input type="text" placeholder="Kategoria (np. Ubrania)" value="${data.category || ""}">
      <input type="text" placeholder="Rzecz" value="${data.name || ""}">
      <input type="number" placeholder="Ilość" min="0" step="1" value="${data.qty ?? 1}">
      <label class="small muted"><input type="checkbox" ${data.to_buy ? "checked" : ""}> Do kupienia</label>
      <label class="small muted"><input type="checkbox" ${data.packed ? "checked" : ""}> Spakowane</label>
      <button type="button" class="icon-btn" title="Usuń"><i class="icon icon-delete"></i></button>
    `;
    row.querySelector("button").addEventListener("click", () => row.remove());
    wrap.appendChild(row);
  },
  _markBuysAsBought() {
    qsa("#vx-pack-list > div").forEach(row => {
      const buy = row.querySelector('label:nth-of-type(1) input[type="checkbox"]');
      if (buy) buy.checked = false;
    });
    toast("Oznaczono pozycje jako kupione.");
  },
  _addSchedRow(data = {}) {
    const wrap = qs("#vx-sched-list");
    const row = document.createElement("div");
    row.style.display = "grid"; row.style.gridTemplateColumns = "1fr auto auto auto";
    row.style.gap = "6px";
    row.innerHTML = `
      <input type="text" placeholder="Aktywność/Opis" value="${data.title || ""}">
      <input type="date" value="${data.date || ""}">
      <input type="time" value="${data.time || ""}">
      <button type="button" class="icon-btn" title="Usuń"><i class="icon icon-delete"></i></button>
    `;
    row.querySelector("button").addEventListener("click", () => row.remove());
    wrap.appendChild(row);
  },
  _addBudgetRow(data = {}) {
    const wrap = qs("#vx-budget-list");
    const row = document.createElement("div");
    row.style.display = "grid"; row.style.gridTemplateColumns = "1fr .6fr .6fr 1fr auto";
    row.style.gap = "6px"; row.style.alignItems = "center";
    row.innerHTML = `
      <input type="text" placeholder="Kategoria" value="${data.category || ""}">
      <input type="number" placeholder="Plan" step="0.01" min="0" value="${data.planned ?? 0}">
      <input type="number" placeholder="Wykonanie" step="0.01" min="0" value="${data.actual ?? 0}">
      <input type="text" placeholder="Notatka" value="${data.note || ""}">
      <button type="button" class="icon-btn" title="Usuń"><i class="icon icon-delete"></i></button>
    `;
    row.querySelector("button").addEventListener("click", () => { row.remove(); this._updateBudgetSum(); });
    qsa('input[type="number"]', row).forEach(inp => inp.addEventListener("input", () => this._updateBudgetSum()));
    wrap.appendChild(row);
    this._updateBudgetSum();
  },
  _updateBudgetSum() {
    const items = [];
    qsa("#vx-budget-list > div").forEach(row => {
      const [cat, plan, act] = row.querySelectorAll("input");
      items.push({ category: cat.value, planned: Number(plan.value || 0), actual: Number(act.value || 0) });
    });
    const planned = items.reduce((s,i)=>s+i.planned,0);
    const actual = items.reduce((s,i)=>s+i.actual,0);
    const el = qs("#vx-budget-sum");
    if (el) el.textContent = `Plan: ${planned.toFixed(2)} • Wykonanie: ${actual.toFixed(2)} • Różnica: ${(planned-actual).toFixed(2)}`;
  },
  _addPlaceRow(data = {}) {
    const wrap = qs("#vx-places-list");
    const row = document.createElement("div");
    row.style.display = "grid"; row.style.gridTemplateColumns = "1fr .6fr .6fr 1fr auto auto";
    row.style.gap = "6px"; row.style.alignItems = "center";
    row.innerHTML = `
      <input type="text" placeholder="Nazwa" value="${data.name || ""}">
      <input type="number" step="0.000001" placeholder="Lat" value="${data.lat ?? ""}">
      <input type="number" step="0.000001" placeholder="Lon" value="${data.lon ?? ""}">
      <input type="text" placeholder="Notatka" value="${data.note || ""}">
      <button type="button" class="btn-secondary open-map"><i class="icon icon-appearance"></i> Otwórz</button>
      <button type="button" class="icon-btn del"><i class="icon icon-delete"></i></button>
    `;
    row.querySelector(".del").addEventListener("click", () => row.remove());
    row.querySelector(".open-map").addEventListener("click", () => {
      const n = row.querySelector('input[placeholder="Nazwa"]').value.trim() || "Miejsce";
      const lat = row.querySelector('input[placeholder="Lat"]').value;
      const lon = row.querySelector('input[placeholder="Lon"]').value;
      if (!lat || !lon) { toast("Uzupełnij współrzędne."); return; }
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat)},${encodeURIComponent(lon)}(${encodeURIComponent(n)})`;
      window.open(url, "_blank");
    });
    wrap.appendChild(row);
  },
  _applyTemplate(key) {
    const tpl = PACK_TEMPLATES[key];
    if (!tpl) return;
    const wrap = qs("#vx-pack-list");
    if (wrap.children.length && !confirm("Zastąpić bieżącą listę pozycji elementami z szablonu?")) return;
    wrap.innerHTML = "";
    tpl.items.forEach(([category, name, qty, toBuy]) => this._addPackRow({ category, name, qty, to_buy: !!toBuy }));
    toast(`Załadowano szablon: ${tpl.name}.`);
  },
  async _fetchWeatherForEditing() {
    const lat = parseFloat(qs("#vx-lat").value || "");
    const lon = parseFloat(qs("#vx-lon").value || "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { toast("Uzupełnij współrzędne."); return; }
    try {
      if (!navigator.onLine) throw new Error("Brak połączenia.");
      const fc = await fetchWeather(lat, lon);
      this._renderWeatherRows(fc);
      qs("#vx-weather-info").textContent = `Zaktualizowano: ${fmtDate.format(new Date())}`;
      toast("Pobrano prognozę.");
    } catch {
      toast("Nie udało się pobrać prognozy.");
    }
  },
  _renderWeatherRows(items = []) {
    const wrap = qs("#vx-weather-rows");
    wrap.innerHTML = "";
    items.forEach(d => {
      const cell = document.createElement("div");
      cell.style.border = "1px solid var(--border)";
      cell.style.borderRadius = "8px";
      cell.style.padding = "6px";
      cell.innerHTML = `<div class="strong">${d.date}</div><div class="small muted">min ${Math.round(d.tmin)}°C • max ${Math.round(d.tmax)}°C</div>`;
      wrap.appendChild(cell);
    });
  },
  _collectFromEditor() {
    const name = qs("#vx-name").value.trim();
    if (!name) { toast("Uzupełnij nazwę planu."); return null; }
    const destination = { name: qs("#vx-destination").value.trim() };
    const start = qs("#vx-start").value || "";
    const end = qs("#vx-end").value || "";
    const notes = qs("#vx-notes").value || "";
    const packing = [];
    qsa("#vx-pack-list > div").forEach(row => {
      const [catEl, nameEl, qtyEl] = row.querySelectorAll("input");
      const toBuy = row.querySelector('label:nth-of-type(1) input')?.checked || false;
      const packed = row.querySelector('label:nth-of-type(2) input')?.checked || false;
      const cat = catEl.value.trim(); const nm = nameEl.value.trim();
      if (!nm) return;
      packing.push({ id: uuid(), category: cat || "", name: nm, qty: Number(qtyEl.value || 1), to_buy: toBuy, packed });
    });
    const schedule = [];
    qsa("#vx-sched-list > div").forEach(row => {
      const [titleEl, dateEl, timeEl] = row.querySelectorAll("input");
      const title = titleEl.value.trim(); const date = dateEl.value || ""; const time = timeEl.value || "";
      if (!title) return;
      schedule.push({ id: uuid(), title, date, time, notes: "" });
    });
    const budget = { currency: "PLN", items: [] };
    qsa("#vx-budget-list > div").forEach(row => {
      const [catEl, planEl, actEl, noteEl] = row.querySelectorAll("input");
      budget.items.push({
        id: uuid(),
        category: catEl.value.trim() || "Inne",
        planned: Number(planEl.value || 0),
        actual: Number(actEl.value || 0),
        note: noteEl.value || ""
      });
    });
    const lat = parseFloat(qs("#vx-lat").value || "");
    const lon = parseFloat(qs("#vx-lon").value || "");
    const forecast = Array.from(qsa("#vx-weather-rows > div")).map(card => {
      const date = card.querySelector(".strong")?.textContent || "";
      const line = card.querySelector(".small")?.textContent || "";
      const m = /min\s(\-?\d+)°C\s•\smax\s(\-?\d+)°C/.exec(line || "");
      return { date, tmin: m ? Number(m[1]) : null, tmax: m ? Number(m[2]) : null, code: null };
    });
    const weather = {
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      last_fetch: forecast.length ? Date.now() : null,
      forecast
    };
    const places = [];
    qsa("#vx-places-list > div").forEach(row => {
      const [nameEl, latEl, lonEl, noteEl] = row.querySelectorAll("input");
      const nm = nameEl.value.trim();
      if (!nm) return;
      const lat = parseFloat(latEl.value || ""); const lon = parseFloat(lonEl.value || "");
      places.push({ id: uuid(), name: nm, lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null, note: noteEl.value || "" });
    });
    const cur = this._editingId ? this.getAll().find(x => x.id === this._editingId) : null;
    return {
      id: this._editingId || uuid(),
      name,
      start_date: start || "",
      end_date: end || "",
      destination,
      packing,
      schedule,
      budget,
      weather,
      places,
      notes,
      template: null,
      updated_at: now(),
      created_at: cur?.created_at || now()
    };
  },
  _saveLocal(vac) {
    ensureVacationsBucket();
    const arr = Storage._db.vacations;
    const i = arr.findIndex(x => x.id === vac.id);
    if (i >= 0) arr[i] = vac; else arr.push(vac);
    try { Storage._saveDB?.(); } catch {}
  },
  async _saveFromEditor() {
    const vac = this._collectFromEditor();
    if (!vac) return;
    this._saveLocal(vac);
    await this._enqueueOutbox("upsert", vac);
    toast("Plan zapisano.");
    qs("#dialog-vacation")?.close();
    this.renderList();
  },
  async _deleteFromEditor() {
    if (!this._editingId) { qs("#dialog-vacation")?.close(); return; }
    if (!confirm("Czy usunąć plan?")) return;
    ensureVacationsBucket();
    const arr = Storage._db.vacations;
    const idx = arr.findIndex(x => x.id === this._editingId);
    if (idx >= 0) {
      const rec = arr[idx]; arr.splice(idx, 1);
      try { Storage._saveDB?.(); } catch {}
      try { Storage.remove("vacations", rec.id, { permanent: false }); } catch {}
      await this._enqueueOutbox("delete", { id: rec.id, updated_at: now() });
    }
    toast("Plan przeniesiono do kosza.");
    qs("#dialog-vacation")?.close();
    this.renderList();
  },
  openToChecklistDialog(id) {
    const v = this.getAll().find(x => x.id === id); if (!v) return;
    const defaults = [
      "Sprawdź dokumenty tożsamości",
      "Wydrukuj potwierdzenia rezerwacji",
      "Zorganizuj ubezpieczenie",
      "Spakuj apteczkę",
      "Zamknij okna/wyłącz urządzenia"
    ];
    const dlgId = "dialog-vac-to-checklist";
    let dlg = qs("#" + dlgId);
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = dlgId; dlg.className = "dialog";
      dlg.innerHTML = `
        <form class="dialog-content" method="dialog">
          <h3><i class="icon icon-checklist"></i> Do Checklisty</h3>
          <div class="small muted">Wybierz zadania do dodania do aktywnej listy „Checklista”.</div>
          <div id="vtc-list" style="display:grid;gap:8px;margin-top:8px;"></div>
          <menu class="dialog-actions">
            <button value="cancel" class="btn-ghost">Anuluj</button>
            <button id="vtc-add" class="btn-primary"><i class="icon icon-check"></i> Dodaj</button>
          </menu>
        </form>
      `;
      document.body.appendChild(dlg);
      qs("#vtc-add", dlg).addEventListener("click", (e) => { e.preventDefault(); this._confirmToChecklist(); });
    }
    const wrap = qs("#vtc-list", dlg); wrap.innerHTML = "";
    defaults.forEach((t, i) => {
      const lab = document.createElement("label");
      lab.style.display = "grid"; lab.style.gridTemplateColumns = "auto 1fr"; lab.style.gap = "8px";
      lab.innerHTML = `<input type="checkbox" checked data-id="${i}"><div>${t}</div>`;
      wrap.appendChild(lab);
    });
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    this._toSectionCache = { vacId: id, checklistDefaults: defaults };
  },
  _confirmToChecklist() {
    const listId = qs("#checklist-list-select")?.value || null;
    if (!listId) { toast("Brak aktywnej listy w Checkliście."); return; }
    const selIdx = Array.from(qsa('#vtc-list input[type="checkbox"]')).filter(cb => cb.checked).map(cb => Number(cb.dataset.id));
    const tasks = (this._toSectionCache?.checklistDefaults || []).filter((_, i) => selIdx.includes(i));
    tasks.forEach(t => {
      const rec = { id: uuid(), list_id: listId, title: t, done: false, updated_at: now() };
      try { Storage.upsert("checklist_items", rec); } catch {}
    });
    toast(tasks.length ? "Dodano do Checklisty." : "Nie wybrano żadnych pozycji.");
    qs("#dialog-vac-to-checklist")?.close();
    try { this._bus.emit?.("list:updated"); } catch {}
  },
  openToTasksDialog(id) {
    const v = this.getAll().find(x => x.id === id); if (!v) return;
    const dlgId = "dialog-vac-to-tasks";
    let dlg = qs("#" + dlgId);
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = dlgId; dlg.className = "dialog";
      dlg.innerHTML = `
        <form class="dialog-content" method="dialog">
          <h3><i class="icon icon-tasks"></i> Do Zadań</h3>
          <div class="grid-2">
            <label>Projekt
              <select id="vtt-project"></select>
            </label>
            <label>Priorytet
              <select id="vtt-prio">
                <option value="low">Niski</option>
                <option value="medium" selected>Średni</option>
                <option value="high">Wysoki</option>
              </select>
            </label>
          </div>
          <div class="small muted">Zdarzenia z harmonogramu zostaną dodane jako zadania z terminami.</div>
          <menu class="dialog-actions">
            <button value="cancel" class="btn-ghost">Anuluj</button>
            <button id="vtt-add" class="btn-primary"><i class="icon icon-check"></i> Dodaj</button>
          </menu>
        </form>
      `;
      document.body.appendChild(dlg);
      qs("#vtt-add", dlg).addEventListener("click", (e) => { e.preventDefault(); this._confirmToTasks(); });
    }
    const sel = qs("#vtt-project", dlg); sel.innerHTML = "";
    (Storage.getSnapshot?.().task_projects || []).forEach(p => {
      const op = document.createElement("option"); op.value = p.id; op.textContent = p.name || "Projekt"; sel.appendChild(op);
    });
    if (!sel.value && sel.firstElementChild) sel.value = sel.firstElementChild.value;
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    this._toSectionCache = { vacId: id };
  },
  _confirmToTasks() {
    const vac = this.getAll().find(x => x.id === this._toSectionCache?.vacId);
    const projectId = qs("#vtt-project")?.value || null;
    const prio = qs("#vtt-prio")?.value || "medium";
    if (!vac || !projectId) { toast("Brak projektu."); return; }
    const items = (vac.schedule || []).filter(s => s.title && s.date);
    items.forEach(s => {
      const dueIso = s.time ? `${s.date}T${s.time}` : `${s.date}T09:00`;
      const task = {
        id: uuid(), project_id: projectId,
        title: s.title, notes: s.notes || `Plan: ${vac.name}`,
        priority: prio, due: dueIso, category: "wakacje", done: false, subtasks: [],
        updated_at: now()
      };
      try { Storage.upsert("tasks", task); } catch {}
    });
    toast(items.length ? "Dodano zadania do projektu." : "Brak zdarzeń do przeniesienia.");
    qs("#dialog-vac-to-tasks")?.close();
    try { this._bus.emit?.("list:updated"); } catch {}
  },
  openToShoppingDialog(id) {
    const vac = this.getAll().find(x => x.id === id); if (!vac) return;
    const dlgId = "dialog-vac-to-shopping";
    let dlg = qs("#" + dlgId);
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = dlgId; dlg.className = "dialog";
      dlg.innerHTML = `
        <form class="dialog-content" method="dialog">
          <h3><i class="icon icon-cart"></i> Do Zakupów</h3>
          <div class="grid-2">
            <label>Lista zakupów
              <select id="vts-list"></select>
            </label>
            <label>Filtr
              <select id="vts-filter">
                <option value="buy">Tylko „do kupienia”</option>
                <option value="all">Wszystkie</option>
              </select>
            </label>
          </div>
          <div id="vts-rows" style="max-height:40vh;overflow:auto;border:1px solid var(--border);border-radius:12px;padding:8px;display:grid;gap:8px;"></div>
          <menu class="dialog-actions">
            <button value="cancel" class="btn-ghost">Anuluj</button>
            <button id="vts-add" class="btn-primary"><i class="icon icon-check"></i> Dodaj</button>
          </menu>
        </form>
      `;
      document.body.appendChild(dlg);
      qs("#vts-add", dlg).addEventListener("click", (e) => { e.preventDefault(); this._confirmToShopping(); });
      qs("#vts-filter", dlg).addEventListener("change", () => this._populateVtsRows());
    }
    const sel = qs("#vts-list", dlg); sel.innerHTML = "";
    (Storage.getSnapshot?.().shopping_lists || []).forEach(l => {
      const op = document.createElement("option"); op.value = l.id; op.textContent = l.name || "Lista"; sel.appendChild(op);
    });
    if (!sel.value && sel.firstElementChild) sel.value = sel.firstElementChild.value;
    this._toSectionCache = { vacId: id };
    this._populateVtsRows();
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  },
  _populateVtsRows() {
    const vac = this.getAll().find(x => x.id === this._toSectionCache?.vacId); if (!vac) return;
    const filter = qs("#vts-filter")?.value || "buy";
    const rows = qs("#vts-rows"); rows.innerHTML = "";
    const items = (vac.packing || []).filter(i => filter === "buy" ? i.to_buy : true);
    items.forEach((i, idx) => {
      const lab = document.createElement("label");
      lab.style.display = "grid"; lab.style.gridTemplateColumns = "auto 1fr auto"; lab.style.gap = "8px"; lab.style.alignItems = "center";
      lab.innerHTML = `
        <input type="checkbox" checked data-index="${idx}">
        <div><strong>${i.name}</strong><div class="small muted">${i.category || ""}</div></div>
        <div class="small muted">${i.qty ?? 1} szt.</div>
      `;
      rows.appendChild(lab);
    });
  },
  _confirmToShopping() {
    const vac = this.getAll().find(x => x.id === this._toSectionCache?.vacId); if (!vac) return;
    const listId = qs("#vts-list")?.value || null;
    if (!listId) { toast("Brak listy zakupów."); return; }
    const idxs = Array.from(qsa('#vts-rows input[type="checkbox"]')).filter(cb => cb.checked).map(cb => Number(cb.dataset.index));
    const items = (vac.packing || []).filter((_, i) => idxs.includes(i));
    let added = 0;
    items.forEach(i => {
      const rec = {
        id: uuid(), list_id: listId,
        name: i.name, qty: Number(i.qty || 1),
        category: i.category || "", store: "", cost: 0, bought: false, oos: false,
        updated_at: now()
      };
      try { Storage.upsert("shopping_items", rec); added++; } catch {}
    });
    toast(added ? `Dodano ${added} pozycji do zakupów.` : "Nie wybrano żadnych pozycji.");
    qs("#dialog-vac-to-shopping")?.close();
    try { this._bus.emit?.("list:updated"); } catch {}
  },
  async _enqueueOutbox(op, data) {
    const box = loadOutbox();
    box.push({ id: uuid(), op, data: { ...data }, ts: now() });
    saveOutbox(box);
    if (navigator.onLine) await this.processOutbox();
  },
  _toServerRow(local, userId) {
    return {
      id: local.id,
      user_id: userId,
      name: local.name,
      start_date: local.start_date || null,
      end_date: local.end_date || null,
      destination: local.destination || null,
      packing: local.packing || [],
      schedule: local.schedule || [],
      budget: local.budget || { currency: "PLN", items: [] },
      weather: local.weather || null,
      places: local.places || [],
      notes: local.notes || "",
      updated_at: new Date(local.updated_at || now()).toISOString(),
      created_at: new Date(local.created_at || now()).toISOString()
    };
  },
  _fromServerRow(r) {
    return {
      id: r.id,
      name: r.name,
      start_date: r.start_date || "",
      end_date: r.end_date || "",
      destination: r.destination || {},
      packing: r.packing || [],
      schedule: r.schedule || [],
      budget: r.budget || { currency: "PLN", items: [] },
      weather: r.weather || null,
      places: r.places || [],
      notes: r.notes || "",
      updated_at: r.updated_at ? new Date(r.updated_at).getTime() : now(),
      created_at: r.created_at ? new Date(r.created_at).getTime() : now()
    };
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
          const { error } = await c.from("vacations").upsert(row, { onConflict: "id" });
          if (error) throw error;
        } else if (rec.op === "delete") {
          const { error } = await c.from("vacations").delete().eq("id", rec.data.id);
          if (error) throw error;
        }
        rec.status = "sent"; rec.sent_at = now(); changed = true;
      } catch (e) {
        if (String(e?.message || e).includes("42P01")) break;
      }
    }
    if (changed) saveOutbox(box);
  },
  async syncPull() {
    const user = await getUser();
    if (!user || !navigator.onLine) return;
    const c = await ensureSupabase();
    let sinceIso = "1970-01-01T00:00:00.000Z";
    try {
      const since = parseInt(localStorage.getItem(LS_VAC_LASTSYNC) || "0", 10);
      if (since > 0) sinceIso = new Date(since).toISOString();
    } catch {}
    try {
      const { data, error } = await c.from("vacations")
        .select("*").eq("user_id", user.id).gt("updated_at", sinceIso).order("updated_at", { ascending: true });
      if (error) throw error;
      const remote = (data || []).map(r => this._fromServerRow(r));
      ensureVacationsBucket();
      const map = new Map(Storage._db.vacations.map(x => [x.id, x]));
      for (const r of remote) {
        const cur = map.get(r.id);
        if (!cur || (r.updated_at || 0) > (cur.updated_at || 0)) map.set(r.id, r);
      }
      Storage._db.vacations = Array.from(map.values());
      try { Storage._saveDB?.(); } catch {}
      localStorage.setItem(LS_VAC_LASTSYNC, String(now()));
      this.renderList();
    } catch (e) {
    }
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Vacations.init(window.Bus));
} else {
  Vacations.init(window.Bus);
}
export default Vacations;