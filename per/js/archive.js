"use strict";

import { Storage } from "./storage.js";
import { toast } from "./ui.js";

const qs = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));

let storage = null;

async function ensureStorage() {
  if (!storage) {
    storage = new Storage();
    await storage.init();
  }
}

export async function initArchive() {
  const view = qs('#view-archive');
  if (!view) return;

  view.innerHTML = `
    <div class="section-header">
      <h2><span class="icon icon-archive"></span> Archiwum</h2>
      <button class="btn-secondary" id="clear-archive-btn">Wyczyść archiwum</button>
    </div>
    <div class="toolbar">
      <select id="archive-type-filter">
        <option value="">Wszystkie typy</option>
        <option value="checklists">Checklisty</option>
        <option value="tasks">Zadania</option>
        <option value="shopping">Zakupy</option>
        <option value="recipes">Przepisy</option>
        <option value="vacations">Wakacje</option>
      </select>
    </div>
    <div id="archive-content">
      <p class="muted">Ładowanie archiwum...</p>
    </div>
  `;

  await ensureStorage();
  await loadArchive();

  qs('#archive-type-filter')?.addEventListener('change', loadArchive);
  qs('#clear-archive-btn')?.addEventListener('click', clearArchive);
}

async function loadArchive() {
  const content = qs('#archive-content');
  if (!content) return;

  const typeFilter = qs('#archive-type-filter')?.value || '';

  try {
    await ensureStorage();

    const tables = typeFilter 
      ? [typeFilter] 
      : ['checklists', 'tasks', 'shopping', 'recipes', 'vacations'];

    let allArchived = [];

    for (const table of tables) {
      const items = await storage.getAll(table);
      const archived = items.filter(item => item.deleted);
      allArchived = allArchived.concat(
        archived.map(item => ({ ...item, type: table }))
      );
    }

    if (!allArchived.length) {
      content.innerHTML = `<p class="muted">Archiwum jest puste.</p>`;
      return;
    }

    // Sortuj po dacie usunięcia (najnowsze pierwsze)
    allArchived.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0);
      const dateB = new Date(b.updatedAt || b.createdAt || 0);
      return dateB - dateA;
    });

    content.innerHTML = `
      <ul class="card-list">
        ${allArchived.map(item => `
          <li class="card-item" data-id="${item.id}" data-type="${item.type}">
            <div class="card-row">
              <div class="card-main">
                <div class="card-title">${escapeHtml(getItemTitle(item))}</div>
                <div class="small muted">
                  ${getTypeLabel(item.type)} • Usunięto: ${formatDate(item.updatedAt || item.createdAt)}
                </div>
              </div>
              <div class="card-actions">
                <button class="btn-secondary" data-action="restore">Przywróć</button>
                <button class="btn-danger-outline" data-action="delete-permanent">Usuń na stałe</button>
              </div>
            </div>
          </li>
        `).join('')}
      </ul>
    `;

    // Event listeners
    qsa('[data-action="restore"]').forEach(btn => {
      const li = btn.closest('li');
      const id = li.dataset.id;
      const type = li.dataset.type;
      btn.addEventListener('click', () => restoreItem(id, type));
    });

    qsa('[data-action="delete-permanent"]').forEach(btn => {
      const li = btn.closest('li');
      const id = li.dataset.id;
      const type = li.dataset.type;
      btn.addEventListener('click', () => deletePermanent(id, type));
    });

  } catch (error) {
    console.error('Błąd ładowania archiwum:', error);
    content.innerHTML = `<p class="muted">Nie udało się załadować archiwum.</p>`;
  }
}

async function restoreItem(id, type) {
  if (!confirm('Czy na pewno chcesz przywrócić ten element?')) return;

  try {
    await ensureStorage();
    await storage.update(type, id, { deleted: false });
    toast('Element przywrócony');
    await loadArchive();
  } catch (error) {
    console.error('Błąd przywracania:', error);
    toast('Nie udało się przywrócić elementu');
  }
}

async function deletePermanent(id, type) {
  if (!confirm('Czy na pewno chcesz TRWALE usunąć ten element? Tej operacji nie można cofnąć!')) return;

  try {
    await ensureStorage();
    await storage.hardDelete(type, id);
    toast('Element usunięty na stałe');
    await loadArchive();
  } catch (error) {
    console.error('Błąd trwałego usuwania:', error);
    toast('Nie udało się usunąć elementu');
  }
}

async function clearArchive() {
  if (!confirm('Czy na pewno chcesz TRWALE usunąć WSZYSTKIE elementy z archiwum? Tej operacji nie można cofnąć!')) return;

  try {
    await ensureStorage();

    const tables = ['checklists', 'tasks', 'shopping', 'recipes', 'vacations'];

    for (const table of tables) {
      const items = await storage.getAll(table);
      const archived = items.filter(item => item.deleted);
      
      for (const item of archived) {
        await storage.hardDelete(table, item.id);
      }
    }

    toast('Archiwum wyczyszczone');
    await loadArchive();

  } catch (error) {
    console.error('Błąd czyszczenia archiwum:', error);
    toast('Nie udało się wyczyścić archiwum');
  }
}

function getItemTitle(item) {
  return item.title || item.name || item.text || 'Bez nazwy';
}

function getTypeLabel(type) {
  const labels = {
    'checklists': 'Checklista',
    'tasks': 'Zadanie',
    'shopping': 'Zakupy',
    'recipes': 'Przepis',
    'vacations': 'Wakacje'
  };
  return labels[type] || type;
}

function formatDate(dateString) {
  if (!dateString) return 'Nieznana data';
  const date = new Date(dateString);
  return date.toLocaleDateString('pl-PL', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export default { initArchive };
