"use strict";
import { Storage } from "./storage.js";
const LS_LEGACY = "lista:fallback";
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const uuid = () => crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const COLORS = ["red","orange","yellow","green","teal","blue","indigo","purple","pink","brown","gray"];
const MAP = {
  checklist: {
    label: "lista",
    legacyKey: "checklist",
    legacyLists: "lists",
    legacyItems: "items",
    storageEntity: "checklist_lists",
    selectId: "#checklist-list-select",
    header: "Zarządzaj listami (Checklista)"
  },
  tasks: {
    label: "projekt",
    legacyKey: "tasks",
    legacyLists: "projects",
    legacyItems: "items",
    storageEntity: "task_projects",
    selectId: "#tasks-project-select",
    header: "Zarządzaj projektami (Zadania)"
  },
  shopping: {
    label: "lista",
    legacyKey: "shopping",
    legacyLists: "lists",
    legacyItems: "items",
    storageEntity: "shopping_lists",
    selectId: "#shopping-list-select",
    header: "Zarządzaj listami (Zakupy)"
  }
};
function toast(text, timeout = 2600) {
  const sb = qs("#snackbar"); if (!sb) return;
  qs("#snackbar-text").textContent = text;
  qs("#snackbar-action").hidden = true;
  sb.hidden = false; sb.classList.add("show");
  setTimeout(() => { sb.hidden = true; sb.classList.remove("show"); }, timeout);
}
function loadLegacy() {
  try {
    const raw = localStorage.getItem(LS_LEGACY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveLegacy(obj) {
  try { localStorage.setItem(LS_LEGACY, JSON.stringify(obj)); } catch {}
}
function refreshSectionSelect(section) {
  const map = MAP[section];
  const legacy = loadLegacy();
  if (!legacy || !map) return;
  const sel = qs(map.selectId); if (!sel) return;
  const lists = legacy[map.legacyKey]?.[map.legacyLists] || [];
  const prev = sel.value;
  sel.innerHTML = "";
  for (const l of lists) {
    const opt = document.createElement("option");
    opt.value = l.id; opt.textContent = l.name || "—";
    sel.appendChild(opt);
  }
  if (lists.some(l => l.id === prev)) sel.value = prev;
  else if (lists[0]) sel.value = lists[0].id;
}
function notifyUpdated() {
  try { window.Bus?.emit?.("list:updated"); } catch {}
}
function ensureDialog() {
  let dlg = qs("#dialog-list-manager");
  if (dlg) return dlg;
  dlg = document.createElement("dialog");
  dlg.id = "dialog-list-manager";
  dlg.className = "dialog";
  dlg.innerHTML = `
    <form method="dialog" class="dialog-content" id="lm-form">
      <h3 id="lm-title"><i class="icon icon-settings"></i> Zarządzaj</h3>
      <div id="lm-list" class="lists-wrap" style="display:grid;gap:10px;"></div>
      <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;">
        <div>
          <button type="button" id="lm-add" class="btn-secondary"><i class="icon icon-plus"></i> Dodaj</button>
        </div>
        <div class="muted small">Zmiany zapisywane są natychmiast.</div>
      </div>
      <menu class="dialog-actions">
        <button value="cancel" class="btn-ghost">Zamknij</button>
      </menu>
    </form>
  `;
  document.body.appendChild(dlg);
  return dlg;
}
function renderRow(section, rec, index, total) {
  const map = MAP[section];
  const wrap = document.createElement("div");
  wrap.className = "row";
  wrap.dataset.id = rec.id;
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "1fr auto";
  wrap.style.gap = "8px";
  wrap.style.alignItems = "center";
  const left = document.createElement("div");
  left.style.display = "grid";
  left.style.gridTemplateColumns = "1fr auto";
  left.style.gap = "8px";
  const name = document.createElement("input");
  name.type = "text";
  name.value = rec.name || "";
  name.placeholder = `Nazwa ${map.label}y`;
  name.addEventListener("change", () => ListManager.rename(section, rec.id, name.value.trim()));
  left.appendChild(name);
  const color = document.createElement("select");
  COLORS.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    color.appendChild(opt);
  });
  color.value = rec.color || "blue";
  color.addEventListener("change", () => ListManager.setColor(section, rec.id, color.value));
  left.appendChild(color);
  const right = document.createElement("div");
  right.style.display = "flex"; right.style.gap = "6px";
  const btnUp = document.createElement("button");
  btnUp.type = "button"; btnUp.className = "icon-btn";
  btnUp.title = "Przenieś w górę";
  btnUp.innerHTML = `<i class="icon icon-back"></i>`;
  btnUp.disabled = index === 0;
  btnUp.addEventListener("click", () => ListManager.reorder(section, rec.id, -1));
  const btnDown = document.createElement("button");
  btnDown.type = "button"; btnDown.className = "icon-btn";
  btnDown.title = "Przenieś w dół";
  btnDown.innerHTML = `<i class="icon icon-forward"></i>`;
  btnDown.disabled = index >= total - 1;
  btnDown.addEventListener("click", () => ListManager.reorder(section, rec.id, +1));
  const btnDel = document.createElement("button");
  btnDel.type = "button"; btnDel.className = "icon-btn";
  btnDel.title = "Usuń";
  btnDel.innerHTML = `<i class="icon icon-delete"></i>`;
  btnDel.addEventListener("click", () => ListManager.remove(section, rec.id));
  right.append(btnUp, btnDown, btnDel);
  wrap.append(left, right);
  return wrap;
}
export const ListManager = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  _sectionOpen: null,
  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;
    await Storage.init?.();
    qs("#btn-manage-checklist")?.addEventListener("click", () => this.open("checklist"));
    qs("#btn-manage-project")?.addEventListener("click", () => this.open("tasks"));
    qs("#btn-manage-shopping-list")?.addEventListener("click", () => this.open("shopping"));
    this._bus.on?.("storage:synced", () => {
      ["checklist","tasks","shopping"].forEach(refreshSectionSelect);
    });
  },
  open(section) {
    if (!MAP[section]) return;
    this._sectionOpen = section;
    const dlg = ensureDialog();
    qs("#lm-title", dlg).innerHTML = `<i class="icon icon-settings"></i> ${MAP[section].header}`;
    this._renderList();
    qs("#lm-add", dlg).onclick = () => this.add(section);
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  },
  _renderList() {
    const dlg = ensureDialog();
    const listWrap = qs("#lm-list", dlg);
    listWrap.innerHTML = "";
    const section = this._sectionOpen;
    if (!section) return;
    const legacy = loadLegacy();
    const map = MAP[section];
    const lists = legacy?.[map.legacyKey]?.[map.legacyLists] || [];
    lists.forEach((rec, i) => {
      listWrap.appendChild(renderRow(section, rec, i, lists.length));
    });
    if (!lists.length) {
      const info = document.createElement("div");
      info.className = "muted small";
      info.textContent = "Brak elementów. Dodaj pierwszy element.";
      listWrap.appendChild(info);
    }
  },
  add(section) {
    const map = MAP[section]; if (!map) return;
    const legacy = loadLegacy() || {};
    const bucket = legacy[map.legacyKey] || (legacy[map.legacyKey] = {});
    const arr = bucket[map.legacyLists] || (bucket[map.legacyLists] = []);
    const itemsMap = bucket[map.legacyItems] || (bucket[map.legacyItems] = {});
    const rec = { id: uuid(), name: section === "tasks" ? "Nowy projekt" : "Nowa lista", color: "blue" };
    arr.push(rec);
    itemsMap[rec.id] = itemsMap[rec.id] || [];
    saveLegacy(legacy);
    try {
      Storage.upsert(map.storageEntity, { id: rec.id, name: rec.name, color: rec.color, updated_at: Date.now() });
    } catch {}
    refreshSectionSelect(section);
    notifyUpdated();
    this._renderList();
    toast("Dodano.");
  },
  rename(section, id, name) {
    const map = MAP[section]; if (!map) return;
    const legacy = loadLegacy(); if (!legacy) return;
    const arr = legacy[map.legacyKey]?.[map.legacyLists]; if (!Array.isArray(arr)) return;
    const rec = arr.find(x => x.id === id); if (!rec) return;
    rec.name = name || rec.name;
    saveLegacy(legacy);
    try {
      Storage.upsert(map.storageEntity, { id: rec.id, name: rec.name, color: rec.color, updated_at: Date.now() });
    } catch {}
    refreshSectionSelect(section);
    notifyUpdated();
    toast("Zmieniono nazwę.");
  },
  setColor(section, id, color) {
    const map = MAP[section]; if (!map) return;
    const legacy = loadLegacy(); if (!legacy) return;
    const arr = legacy[map.legacyKey]?.[map.legacyLists]; if (!Array.isArray(arr)) return;
    const rec = arr.find(x => x.id === id); if (!rec) return;
    rec.color = COLORS.includes(color) ? color : "blue";
    saveLegacy(legacy);
    try {
      Storage.upsert(map.storageEntity, { id: rec.id, name: rec.name, color: rec.color, updated_at: Date.now() });
    } catch {}
    refreshSectionSelect(section);
    notifyUpdated();
    toast("Zmieniono kolor.");
  },
  reorder(section, id, dir) {
    const map = MAP[section]; if (!map) return;
    const legacy = loadLegacy(); if (!legacy) return;
    const arr = legacy[map.legacyKey]?.[map.legacyLists]; if (!Array.isArray(arr)) return;
    const i = arr.findIndex(x => x.id === id);
    if (i < 0) return;
    const j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    saveLegacy(legacy);
    refreshSectionSelect(section);
    this._renderList();
    toast("Zmieniono kolejność.");
  },
  remove(section, id) {
    const map = MAP[section]; if (!map) return;
    const legacy = loadLegacy(); if (!legacy) return;
    const bucket = legacy[map.legacyKey]; if (!bucket) return;
    const arr = bucket[map.legacyLists]; if (!Array.isArray(arr)) return;
    const idx = arr.findIndex(x => x.id === id);
    if (idx < 0) return;
    if (!confirm(`Czy usunąć ${map.label}ę wraz z jej zawartością?`)) return;
    const [removed] = arr.splice(idx, 1);
    const itemsMap = bucket[map.legacyItems] || {};
    if (itemsMap[id]) delete itemsMap[id];
    saveLegacy(legacy);
    try {
      Storage.remove(map.storageEntity, id, { permanent: false });
    } catch {}
    refreshSectionSelect(section);
    notifyUpdated();
    this._renderList();
    toast("Usunięto.");
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => ListManager.init(window.Bus));
} else {
  ListManager.init(window.Bus);
}
export default ListManager;