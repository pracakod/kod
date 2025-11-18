"use strict";

import { toast } from "./ui.js";
import { Storage } from "./storage.js";

const qs = (s) => document.querySelector(s);
const storage = new Storage();

export function initSettings() {
  const view = qs('#view-settings');
  if (!view) return;

  view.innerHTML = `
    <div class="section-header">
      <h2><span class="icon icon-settings"></span> Ustawienia</h2>
    </div>

    <div class="options-group">
      <h3>Wygląd</h3>
      <div class="options-row">
        <label>
          <span>Motyw</span>
          <select id="theme-select">
            <option value="auto">Automatyczny</option>
            <option value="light">Jasny</option>
            <option value="dark">Ciemny</option>
          </select>
        </label>
      </div>
      <div class="options-row">
        <label>
          <span>Kolor akcentu</span>
          <select id="accent-select">
            <option value="blue">Niebieski</option>
            <option value="green">Zielony</option>
            <option value="amber">Bursztynowy</option>
            <option value="rose">Różowy</option>
          </select>
        </label>
      </div>
    </div>

    <div class="options-group">
      <h3>Gęstość interfejsu</h3>
      <div class="options-row">
        <label>
          <span>Rozmiar elementów</span>
          <select id="density-select">
            <option value="compact">Kompaktowy</option>
            <option value="default">Domyślny</option>
            <option value="spacious">Przestronny</option>
          </select>
        </label>
      </div>
    </div>

    <div class="options-group">
      <h3>Powiadomienia</h3>
      <div class="options-row">
        <label class="switch">
          <input type="checkbox" id="notifications-enabled" />
          <span>Włącz powiadomienia</span>
        </label>
      </div>
    </div>

    <div class="options-group">
      <h3>Dane</h3>
      <div class="options-row">
        <button class="btn-secondary" id="export-data-btn">Eksportuj dane</button>
        <button class="btn-secondary" id="import-data-btn">Importuj dane</button>
      </div>
      <div class="options-row">
        <button class="btn-danger" id="clear-data-btn">Wyczyść wszystkie dane</button>
      </div>
    </div>
  `;

  loadSettings();
  attachSettingsListeners();
}

function loadSettings() {
  const theme = localStorage.getItem('lista:theme') || 'auto';
  const accent = localStorage.getItem('lista:accent') || 'blue';
  const density = localStorage.getItem('lista:density') || 'default';
  const notificationsEnabled = localStorage.getItem('lista:notifications') === 'true';

  const themeSelect = qs('#theme-select');
  const accentSelect = qs('#accent-select');
  const densitySelect = qs('#density-select');
  const notificationsCheckbox = qs('#notifications-enabled');

  if (themeSelect) themeSelect.value = theme;
  if (accentSelect) accentSelect.value = accent;
  if (densitySelect) densitySelect.value = density;
  if (notificationsCheckbox) notificationsCheckbox.checked = notificationsEnabled;

  applyTheme(theme);
  applyAccent(accent);
  applyDensity(density);
}

function attachSettingsListeners() {
  const themeSelect = qs('#theme-select');
  const accentSelect = qs('#accent-select');
  const densitySelect = qs('#density-select');
  const notificationsCheckbox = qs('#notifications-enabled');

  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      const value = e.target.value;
      localStorage.setItem('lista:theme', value);
      applyTheme(value);
      toast('Motyw zmieniony');
    });
  }

  if (accentSelect) {
    accentSelect.addEventListener('change', (e) => {
      const value = e.target.value;
      localStorage.setItem('lista:accent', value);
      applyAccent(value);
      toast('Kolor akcentu zmieniony');
    });
  }

  if (densitySelect) {
    densitySelect.addEventListener('change', (e) => {
      const value = e.target.value;
      localStorage.setItem('lista:density', value);
      applyDensity(value);
      toast('Gęstość interfejsu zmieniona');
    });
  }

  if (notificationsCheckbox) {
    notificationsCheckbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('lista:notifications', enabled);
      toast(enabled ? 'Powiadomienia włączone' : 'Powiadomienia wyłączone');
    });
  }

  const exportBtn = qs('#export-data-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportData);
  }

  const importBtn = qs('#import-data-btn');
  if (importBtn) {
    importBtn.addEventListener('click', importData);
  }

  const clearBtn = qs('#clear-data-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearAllData);
  }
}

function applyTheme(theme) {
  document.body.className = document.body.className
    .replace(/theme-\w+/g, '')
    .trim();
  document.body.classList.add(`theme-${theme}`);
}

function applyAccent(accent) {
  document.body.className = document.body.className
    .replace(/accent-\w+/g, '')
    .trim();
  document.body.classList.add(`accent-${accent}`);
}

function applyDensity(density) {
  document.body.className = document.body.className
    .replace(/density-\w+/g, '')
    .trim();
  document.body.classList.add(`density-${density}`);
}

async function exportData() {
  try {
    const data = storage.exportData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `lista-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    toast('Dane wyeksportowane');
  } catch (error) {
    console.error('Błąd eksportu:', error);
    toast('Nie udało się wyeksportować danych');
  }
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (confirm('Czy na pewno chcesz zaimportować dane? To nadpisze istniejące dane.')) {
        await storage.importData(data);
        toast('Dane zaimportowane');
        setTimeout(() => location.reload(), 1000);
      }
    } catch (error) {
      console.error('Błąd importu:', error);
      toast('Nie udało się zaimportować danych');
    }
  });
  
  input.click();
}

function clearAllData() {
  if (!confirm('Czy na pewno chcesz usunąć WSZYSTKIE dane? Tej operacji nie można cofnąć!')) {
    return;
  }

  if (!confirm('Ostatnie ostrzeżenie: wszystkie listy, zadania, przepisy i ustawienia zostaną usunięte. Kontynuować?')) {
    return;
  }

  try {
    storage.clearAll();
    toast('Wszystkie dane usunięte');
    setTimeout(() => location.reload(), 1000);
  } catch (error) {
    console.error('Błąd czyszczenia danych:', error);
    toast('Nie udało się wyczyścić danych');
  }
}

export default { initSettings };
