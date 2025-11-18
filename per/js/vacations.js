"use strict";

import { Storage } from "./storage.js";
import { toast } from "./ui.js";

const qs = (s, r = document) => r.querySelector(s);

let storage = null;
let currentVacations = [];
let editingVacationId = null;

async function ensureStorage() {
  if (!storage) {
    storage = new Storage();
    await storage.init();
  }
}

export async function initVacations() {
  const view = qs("#view-vacations");
  if (!view) return;

  view.innerHTML = `
    <div class="section-header">
      <h2><span class="icon icon-vacation"></span> Wakacje</h2>
      <button id="add-vacation-btn" class="btn-primary">+ Nowy plan</button>
    </div>
    <div class="toolbar">
      <select id="vacations-filter">
        <option value="">Wszystkie plany</option>
        <option value="future">Przyszłe</option>
        <option value="past">Zakończone</option>
      </select>
    </div>
    <ul id="vacations-list" class="card-list"></ul>
  `;

  await ensureStorage();
  await loadVacations();

  qs("#add-vacation-btn")?.addEventListener("click", () => openVacationDialog());
  qs("#vacations-filter")?.addEventListener("change", filterVacations);
}

async function loadVacations() {
  try {
    const all = await storage.getAll("vacations");
    currentVacations = all.filter(v => !v.deleted);
    renderVacations(currentVacations);
  } catch (err) {
    console.error("Błąd ładowania wakacji:", err);
    toast("Nie udało się załadować planów wakacyjnych");
  }
}

function filterVacations() {
  const filter = qs("#vacations-filter")?.value || "";
  const today = new Date().toISOString().slice(0, 10);

  const filtered = currentVacations.filter(v => {
    if (!filter) return true;
    const end = v.endDate || v.startDate || today;
    if (filter === "future") return end >= today;
    if (filter === "past") return end < today;
    return true;
  });

  renderVacations(filtered);
}

function renderVacations(vacations) {
  const list = qs("#vacations-list");
  if (!list) return;

  if (!vacations.length) {
    list.innerHTML = `<li class="small muted">Brak planów wakacyjnych. Dodaj pierwszy plan.</li>`;
    return;
  }

  list.innerHTML = vacations.map(v => `
    <li class="card-item" data-id="${v.id}">
      <div class="card-row">
        <div class="card-main">
          <div class="card-title">${escapeHtml(v.name)}</div>
          <div class="small muted">
            ${formatRange(v.startDate, v.endDate)} • ${escapeHtml(v.destination || "")}
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-secondary" data-action="edit">Edytuj</button>
          <button class="btn-danger-outline" data-action="delete">Usuń</button>
        </div>
      </div>
    </li>
  `).join("");

  list.querySelectorAll("li.card-item").forEach(li => {
    const id = li.dataset.id;
    li.querySelector('[data-action="edit"]')?.addEventListener("click", () => editVacation(id));
    li.querySelector('[data-action="delete"]')?.addEventListener("click", () => deleteVacation(id));
  });
}

function formatRange(from, to) {
  if (!from && !to) return "Brak dat";
  if (from && !to) return from;
  if (!from && to) return to;
  return `${from} – ${to}`;
}

function openVacationDialog(vacation = null) {
  editingVacationId = vacation?.id || null;

  const dialog = document.createElement("dialog");
  dialog.className = "dialog dialog-full";
  dialog.innerHTML = `
    <div class="dialog-content">
      <div>
        <h3>${vacation ? "Edytuj plan wakacyjny" : "Nowy plan wakacyjny"}</h3>
      </div>
      <div style="overflow-y:auto; display:grid; gap:12px;">
        <label>
          <span>Nazwa planu *</span>
          <input type="text" id="vac-name" value="${vacation?.name || ""}" required />
        </label>
        <div class="grid-2">
          <label>
            <span>Data początku</span>
            <input type="date" id="vac-start" value="${vacation?.startDate || ""}" />
          </label>
          <label>
            <span>Data końca</span>
            <input type="date" id="vac-end" value="${vacation?.endDate || ""}" />
          </label>
        </div>
        <label>
          <span>Cel podróży</span>
          <input type="text" id="vac-destination" value="${vacation?.destination || ""}" placeholder="np. Hiszpania, góry" />
        </label>
        <label>
          <span>Notatki</span>
          <textarea id="vac-notes" rows="4">${vacation?.notes || ""}</textarea>
        </label>
      </div>
      <menu class="dialog-actions">
        <button class="btn-secondary" id="vac-cancel">Anuluj</button>
        <button class="btn-primary" id="vac-save">Zapisz</button>
      </menu>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();

  qs("#vac-cancel", dialog)?.addEventListener("click", () => {
    dialog.close();
    dialog.remove();
  });

  qs("#vac-save", dialog)?.addEventListener("click", () => saveVacation(dialog));
}

async function saveVacation(dialog) {
  const name = qs("#vac-name", dialog).value.trim();
  if (!name) {
    toast("Podaj nazwę planu");
    return;
  }

  const payload = {
    name,
    startDate: qs("#vac-start", dialog).value || null,
    endDate: qs("#vac-end", dialog).value || null,
    destination: qs("#vac-destination", dialog).value.trim(),
    notes: qs("#vac-notes", dialog).value.trim(),
    updatedAt: new Date().toISOString()
  };

  try {
    await ensureStorage();

    if (editingVacationId) {
      await storage.update("vacations", editingVacationId, payload);
      toast("Plan zaktualizowany");
    } else {
      payload.id = `vac_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      payload.createdAt = payload.updatedAt;
      await storage.create("vacations", payload);
      toast("Plan zapisany");
    }

    dialog.close();
    dialog.remove();
    await loadVacations();
  } catch (err) {
    console.error("Błąd zapisu wakacji:", err);
    toast("Nie udało się zapisać planu");
  }
}

function editVacation(id) {
  const v = currentVacations.find(x => x.id === id);
  if (v) openVacationDialog(v);
}

async function deleteVacation(id) {
  if (!confirm("Czy na pewno chcesz usunąć ten plan wakacyjny?")) return;

  try {
    await ensureStorage();
    await storage.delete("vacations", id);
    toast("Plan usunięty");
    await loadVacations();
  } catch (err) {
    console.error("Błąd usuwania planu:", err);
    toast("Nie udało się usunąć planu");
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export default { initVacations };
