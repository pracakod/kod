/* ==========================================================================
   Lista — settings.js
   Odpowiada za: ustawienia motywów i wyglądu (persistencja, podgląd, zastosowanie)
   - Motywy: tryb (auto/jasny/ciemny) + akcent (niebieski/zielony/bursztynowy/różany)
   - Wygląd: rozmiar/krój czcionki, gęstość, rozmiar elementów, promienie, cienie,
             animacje, widoczność paska wyszukiwania
   Integracja: UI (siatka motywów), App (przyciski „Podgląd” i „Zastosuj”)
   ========================================================================== */

"use strict";

import { UI } from "./ui.js";

/* Klucze localStorage */
const LS_THEME_APPLIED = "lista:theme";         // zapisany, zastosowany motyw
const LS_THEME_PENDING = "lista:themePending";  // wybór oczekujący (z siatki UI)
const LS_APPEARANCE    = "lista:appearance";    // ustawienia wyglądu

/* Domyślne wartości */
const DEFAULT_THEME = { mode: "light", accent: "blue" };
const DEFAULT_APPEARANCE = {
  fontSize: "normal",
  fontFamily: "system",
  density: "normal",
  itemSize: "normal",
  radius: "md",
  elevation: "low",
  animations: true,
  showSearch: true
};

/* Pomocnicze */
const qs = (s, r = document) => r.querySelector(s);

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/* Usuwanie i nadawanie klas motywu na <body> */
function applyThemeClasses(theme) {
  const b = document.body;
  const modeClasses = ["theme-auto", "theme-light", "theme-dark"];
  const accentClasses = ["theme-blue", "theme-green", "theme-amber", "theme-rose"];

  b.classList.remove(...modeClasses, ...accentClasses);

  const mode = theme.mode === "auto" ? "theme-auto"
            : theme.mode === "dark" ? "theme-dark"
            : "theme-light";
  const accents = ["blue","green","amber","rose"];
  const accent = accents.includes(theme.accent) ? `theme-${theme.accent}` : "theme-blue";

  b.classList.add(mode, accent);
  // Domyślnie włącz animacje; zostaną skorygowane przez sekcję Wygląd
  b.classList.add("animations-on");
}

/* Zapis/odczyt wyglądu do/z formularza */
function setAppearanceForm(values) {
  const map = {
    "#opt-font-size": "fontSize",
    "#opt-font-family": "fontFamily",
    "#opt-density": "density",
    "#opt-item-size": "itemSize",
    "#opt-radius": "radius",
    "#opt-elevation": "elevation",
    "#opt-animations": "animations",
    "#opt-show-search": "showSearch"
  };
  for (const [sel, key] of Object.entries(map)) {
    const el = qs(sel);
    if (!el) continue;
    if (typeof values[key] === "undefined") continue;
    if (el.type === "checkbox") el.checked = !!values[key];
    else el.value = String(values[key]);
  }
}

function getAppearanceForm() {
  const v = {};
  v.fontSize = qs("#opt-font-size")?.value || DEFAULT_APPEARANCE.fontSize;
  v.fontFamily = qs("#opt-font-family")?.value || DEFAULT_APPEARANCE.fontFamily;
  v.density = qs("#opt-density")?.value || DEFAULT_APPEARANCE.density;
  v.itemSize = qs("#opt-item-size")?.value || DEFAULT_APPEARANCE.itemSize;
  v.radius = qs("#opt-radius")?.value || DEFAULT_APPEARANCE.radius;
  v.elevation = qs("#opt-elevation")?.value || DEFAULT_APPEARANCE.elevation;
  v.animations = !!qs("#opt-animations")?.checked;
  v.showSearch = !!qs("#opt-show-search")?.checked;
  return v;
}

/* Główny moduł */
export const Settings = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  _appliedTheme: { ...DEFAULT_THEME },

  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;

    // 1) Załaduj i zastosuj motyw zapisany
    const applied = loadJSON(LS_THEME_APPLIED, DEFAULT_THEME);
    this._appliedTheme = { ...DEFAULT_THEME, ...applied };
    applyThemeClasses(this._appliedTheme);

    // 2) Upewnij się, że wybór oczekujący nie jest pusty (dla siatki UI)
    const pending = loadJSON(LS_THEME_PENDING, null);
    if (!pending) saveJSON(LS_THEME_PENDING, this._appliedTheme);

    // 3) Załaduj wygląd i uzupełnij formularz (app.js zaczytuje i stosuje)
    const appearance = loadJSON(LS_APPEARANCE, DEFAULT_APPEARANCE);
    setAppearanceForm({ ...DEFAULT_APPEARANCE, ...appearance });

    // 4) Nasłuch zmian wyboru oczekującego – NATYCHMIASTOWY PODGLĄD
    this._bus.on?.("theme:pending-changed", (sel) => {
      const next = { ...DEFAULT_THEME, ...sel };
      saveJSON(LS_THEME_PENDING, next);
      // Natychmiastowy podgląd po kliknięciu kafla w siatce (rozwiązuje brak widocznej zmiany motywu)
      applyThemeClasses(next);
    });

    // 5) Persistencja wyglądu przy zmianach kontrolek
    this._bindAppearancePersistence();
  },

  /* Podgląd motywu – może być wywołany z przycisku „Podgląd” */
  previewTheme() {
    const sel = UI.getSelectedTheme?.() || loadJSON(LS_THEME_PENDING, this._appliedTheme);
    if (!sel) return;
    applyThemeClasses(sel);
    // Nie aktualizujemy _appliedTheme — to wyłącznie podgląd
  },

  /* Zastosowanie motywu na stałe — zapis + użycie */
  applyTheme() {
    const sel = UI.getSelectedTheme?.() || loadJSON(LS_THEME_PENDING, this._appliedTheme);
    const theme = { ...DEFAULT_THEME, ...sel };
    this._appliedTheme = theme;
    applyThemeClasses(theme);
    saveJSON(LS_THEME_APPLIED, theme);
    // Ujednolicenie wyboru oczekującego z zastosowanym
    saveJSON(LS_THEME_PENDING, theme);
  },

  /* Ujawnienie aktualnego motywu */
  getAppliedTheme() {
    return { ...this._appliedTheme };
  },

  /* Persistencja wyglądu */
  _bindAppearancePersistence() {
    const ids = [
      "#opt-font-size",
      "#opt-font-family",
      "#opt-density",
      "#opt-item-size",
      "#opt-radius",
      "#opt-elevation",
      "#opt-animations",
      "#opt-show-search"
    ];
    ids.forEach(id => {
      const el = qs(id);
      if (!el) return;
      el.addEventListener("change", () => {
        const v = getAppearanceForm();
        saveJSON(LS_APPEARANCE, v);
      });
    });
  }
};

/* Inicjalizacja samoczynna (gdy moduł wczytany niezależnie) */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Settings.init(window.Bus));
} else {
  Settings.init(window.Bus);
}

export default Settings;