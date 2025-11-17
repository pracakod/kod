/* ==========================================================================
   Lista — ui.js
   Odpowiada za: zachowania interfejsu niezależne od logiki danych:
   - ripple na elementach dotykowych,
   - arkusz akcji (swipe) — otwieranie/zamykanie,
   - rozszerzona obsługa szuflady (backdrop, Escape, fokus),
   - siatka motywów (wybór trybu i akcentu),
   - skróty klawiaturowe (np. / dla wyszukiwania).
   ========================================================================== */

"use strict";

/* Pomocnicze */
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const isInputLike = (el) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable || el.tagName === "SELECT");

/* Globalny obiekt UI */
export const UI = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  _actionSheetCtx: null,
  _drawerPrevFocus: null,
  _themeSelection: { mode: "light", accent: "blue" },

  init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;

    this.initRipples();
    this.initActionSheet();
    this.initDrawerExtras();
    this.initThemesGrid();
    this.initShortcuts();

    // Odtwórz zapisany wybór motywu
    this._loadThemeSelection();
  },

  /* ---------------------------------------------------------------------- */
  /* Ripple na przyciskach i elementach dotykowych                          */
  /* ---------------------------------------------------------------------- */
  initRipples() {
    const selector = 'button, .tab-btn, .icon-btn, .drawer-item, .action-sheet-content > button';
    document.addEventListener("pointerdown", (e) => {
      const el = e.target.closest(selector);
      if (!el || el.disabled) return;
      const rect = el.getBoundingClientRect();
      const rx = e.clientX - rect.left;
      const ry = e.clientY - rect.top;
      el.classList.add("has-ripple");
      el.style.setProperty("--rx", `${rx}px`);
      el.style.setProperty("--ry", `${ry}px`);
      // restart animacji
      el.classList.remove("ripple-animate");
      // wymuszenie reflow
      void el.offsetWidth;
      el.classList.add("ripple-animate");
      setTimeout(() => el.classList.remove("ripple-animate"), 600);
    }, { passive: true });
  },

  /* ---------------------------------------------------------------------- */
  /* Arkusz akcji (swipe)                                                   */
  /* ---------------------------------------------------------------------- */
  initActionSheet() {
    const sheet = qs("#swipe-actions-sheet");
    if (!sheet) return;
    const content = sheet.querySelector(".action-sheet-content");

    // Zamknięcie po kliknięciu tła
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet) this.closeActionSheet();
    });

    // Obsługa przycisków akcji
    content.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const ctx = this._actionSheetCtx || {};
      this.closeActionSheet();
      // Emituj zdarzenie dla modułu swipe lub innych
      try { this._bus.emit("swipe:action", { action, context: ctx }); } catch {}
    });

    // Zamknięcie klawiszem Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !sheet.hidden) this.closeActionSheet();
    });
  },

  openActionSheet(context = {}) {
    const sheet = qs("#swipe-actions-sheet");
    if (!sheet) return;
    this._actionSheetCtx = context;

    // Widoczność pozycji "Brak w sklepie" tylko w sekcji Zakupy
    qsa(".only-shopping", sheet).forEach(b => {
      b.style.display = context.type === "shopping" ? "" : "none";
    });

    // Filtr dostępnych akcji (opcjonalna lista)
    const allowed = Array.isArray(context.allow) ? new Set(context.allow) : null;
    qsa("[data-action]", sheet).forEach(b => {
      const name = b.dataset.action;
      b.style.display = (!allowed || allowed.has(name)) ? "" : "none";
    });

    // Pokaż
    sheet.hidden = false;
    // Zablokuj przewijanie tła
    document.documentElement.style.overflow = "hidden";
  },

  closeActionSheet() {
    const sheet = qs("#swipe-actions-sheet");
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    document.documentElement.style.overflow = "";
    this._actionSheetCtx = null;
  },

  /* ---------------------------------------------------------------------- */
  /* Szuflada (menu boczne): backdrop, Escape, fokus                        */
  /* ---------------------------------------------------------------------- */
  initDrawerExtras() {
    const drawer = qs("#drawer");
    if (!drawer) return;

    // Backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "drawer-backdrop";
    Object.assign(backdrop.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,.35)",
      zIndex: "90",
      display: "none"
    });
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", () => this.setDrawerOpen(false));

    // Reakcja na zmiany aria-hidden
    const obs = new MutationObserver(() => {
      const open = drawer.getAttribute("aria-hidden") === "false";
      backdrop.style.display = open ? "block" : "none";
      if (open) {
        // zapamiętaj fokus i przenieś do szuflady
        this._drawerPrevFocus = document.activeElement;
        const focusable = this._getFocusable(drawer);
        (focusable[0] || drawer).focus?.();
      } else {
        // przywróć fokus
        this._drawerPrevFocus?.focus?.();
      }
    });
    obs.observe(drawer, { attributes: true, attributeFilter: ["aria-hidden"] });

    // Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drawer.getAttribute("aria-hidden") === "false") {
        this.setDrawerOpen(false);
      }
    });
  },

  setDrawerOpen(open) {
    const drawer = qs("#drawer");
    if (!drawer) return;
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
  },

  _getFocusable(root) {
    const sel = [
      "a[href]", "button:not([disabled])", "input:not([disabled])",
      "select:not([disabled])", "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");
    return qsa(sel, root).filter(el => el.offsetParent !== null);
  },

  /* ---------------------------------------------------------------------- */
  /* Siatka motywów (tryb + akcent)                                         */
  /* ---------------------------------------------------------------------- */
  initThemesGrid() {
    const grid = qs("#themes-grid");
    if (!grid) return;

    const items = [
      { id: "mode-auto",   label: "Auto (system)", group: "Tryb",   kind: "mode",   value: "auto",  cls: "is-light" },
      { id: "mode-light",  label: "Jasny",         group: "Tryb",   kind: "mode",   value: "light", cls: "is-light" },
      { id: "mode-dark",   label: "Ciemny",        group: "Tryb",   kind: "mode",   value: "dark",  cls: "is-dark"  },
      { id: "accent-blue", label: "Akcent: niebieski",  group: "Akcent", kind: "accent", value: "blue",  cls: "is-blue"  },
      { id: "accent-green",label: "Akcent: zielony",   group: "Akcent", kind: "accent", value: "green", cls: "is-green" },
      { id: "accent-amber",label: "Akcent: bursztynowy",group: "Akcent", kind: "accent", value: "amber", cls: "is-amber" },
      { id: "accent-rose", label: "Akcent: różany",    group: "Akcent", kind: "accent", value: "rose",  cls: "is-rose"  },
    ];

    grid.innerHTML = "";
    for (const it of items) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `theme-card ${it.cls}`;
      card.setAttribute("role", "listitem");
      card.dataset.kind = it.kind;
      card.dataset.value = it.value;
      card.dataset.group = it.group;
      card.ariaPressed = "false";

      const preview = document.createElement("div");
      preview.className = "preview";
      const barTop = document.createElement("div"); barTop.className = "bar-top";
      const content = document.createElement("div"); content.className = "content";
      const barBottom = document.createElement("div"); barBottom.className = "bar-bottom";
      preview.append(barTop, content, barBottom);

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = it.label;

      card.append(preview, name);
      grid.appendChild(card);

      card.addEventListener("click", () => {
        // aktualizuj wybór
        if (it.kind === "mode") this._themeSelection.mode = it.value;
        else this._themeSelection.accent = it.value;
        this._persistThemeSelection();
        this._updateThemeCardsUI(grid);
        // powiadom Settings
        try { this._bus.emit("theme:pending-changed", { ...this._themeSelection }); } catch {}
      });
    }

    // Zastosuj stan początkowy
    this._updateThemeCardsUI(grid);
  },

  _updateThemeCardsUI(grid) {
    const { mode, accent } = this._themeSelection;
    qsa(".theme-card", grid).forEach(card => {
      const kind = card.dataset.kind;
      const val = card.dataset.value;
      const selected = (kind === "mode" && val === mode) || (kind === "accent" && val === accent);
      card.classList.toggle("selected", selected);
      card.setAttribute("aria-pressed", selected ? "true" : "false");
      // Delikatne podkreślenie ramki
      card.style.outline = selected ? "2px solid var(--primary)" : "none";
      card.style.outlineOffset = selected ? "2px" : "0";
    });
  },

  _persistThemeSelection() {
    try { localStorage.setItem("lista:themePending", JSON.stringify(this._themeSelection)); } catch {}
  },
  _loadThemeSelection() {
    try {
      const raw = localStorage.getItem("lista:themePending");
      if (raw) this._themeSelection = { ...this._themeSelection, ...JSON.parse(raw) };
    } catch {}
  },
  getSelectedTheme() {
    return { ...this._themeSelection };
  },

  /* ---------------------------------------------------------------------- */
  /* Skróty klawiaturowe                                                    */
  /* ---------------------------------------------------------------------- */
  initShortcuts() {
    document.addEventListener("keydown", (e) => {
      // pomiń gdy w polu edycyjnym
      if (isInputLike(e.target)) return;

      // Otwórz/zamknij globalne wyszukiwanie klawiszem "/"
      if (e.key === "/") {
        e.preventDefault();
        const toggle = qs("#btn-toggle-search");
        toggle?.click();
      }

      // Zamknięcia ogólne: Escape zamyka dialogi przeglądarkowe automatycznie,
      // tu domykamy także arkusz akcji i szufladę (bez ingerencji w <dialog>)
      if (e.key === "Escape") {
        this.closeActionSheet();
        const drawer = qs("#drawer");
        if (drawer?.getAttribute("aria-hidden") === "false") this.setDrawerOpen(false);
      }
    });
  }
};

/* Inicjalizacja samoczynna, jeżeli moduł został załadowany poza app.js */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => UI.init(window.Bus));
} else {
  UI.init(window.Bus);
}

export default UI;