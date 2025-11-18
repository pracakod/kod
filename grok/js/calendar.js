/* ==========================================================================
   Lista — calendar.js
   Odpowiada za: widok kalendarza (miesięczny/tygodniowy) w sekcji „Ważne daty”
   - Render trybu miesięcznego i tygodniowego (poniedziałek jako pierwszy dzień)
   - Nawigacja (poprzedni/następny) oraz przełączanie trybów
   - Integracja ze Storage (wydarzenia) i filtrem kategorii
   - Kliknięcie dnia pozostaje obsługiwane przez important-dates.js (otwarcie edycji)
   Uwaga: przechwytuje zdarzenia nawigacji w trybie capture, aby wyłączyć fallback.
   ========================================================================== */

"use strict";

import { Storage } from "./storage.js";

/* Pomocnicze */
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const formatPLMonth = (d) => d.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
const formatPLDay = (d) => d.toLocaleDateString("pl-PL", { day: "numeric" });
const dayNames = ["Pn","Wt","Śr","Cz","Pt","So","Nd"];

function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // pon=0
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function ymd(d) { return new Date(d).toISOString().slice(0,10); }
function todayYMD() { return new Date().toISOString().slice(0,10); }

/* Renderowanie listy wydarzeń w komórce */
function getFilteredEvents(dateStr) {
  const snap = Storage.getSnapshot?.() || {};
  const cat = (qs("#dates-filter-category")?.value || "").toLowerCase();
  let arr = Array.isArray(snap.dates) ? snap.dates : [];
  if (cat) arr = arr.filter(e => String(e.category || "inne").toLowerCase() === cat);
  return arr.filter(e => e.date === dateStr);
}
function renderEventsInCell(cell, dateStr) {
  const events = getFilteredEvents(dateStr);
  if (!events.length) return;

  const wrap = document.createElement("div");
  wrap.style.marginTop = "4px";
  wrap.style.display = "grid";
  wrap.style.gap = "2px";

  events.slice(0, 3).forEach(ev => {
    const line = document.createElement("div");
    line.className = "small";
    line.style.whiteSpace = "nowrap";
    line.style.overflow = "hidden";
    line.style.textOverflow = "ellipsis";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = ev.category || "inne";
    line.appendChild(badge);
    line.append(" " + (ev.title || ""));
    wrap.appendChild(line);
  });
  if (events.length > 3) {
    const more = document.createElement("div");
    more.className = "small muted";
    more.textContent = `+${events.length - 3} więcej`;
    wrap.appendChild(more);
  }
  cell.appendChild(document.createElement("br"));
  cell.appendChild(wrap);
}

/* Główny moduł */
export const Calendar = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  mode: "month", // "month" | "week"
  cursor: new Date(), // referencyjny dzień bieżącego widoku

  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;

    await Storage.init?.();

    // Ustaw tryb z kontrolki (jeśli dostępna)
    const sel = qs("#cal-view-mode");
    if (sel && (sel.value === "week" || sel.value === "month")) this.mode = sel.value;

    // Zdarzenia nawigacji — w capture, by przejąć od fallbacku
    const prev = qs("#cal-prev");
    const next = qs("#cal-next");
    const modeSel = qs("#cal-view-mode");
    prev?.addEventListener("click", (e) => { e.preventDefault(); e.stopImmediatePropagation(); this.goPrev(); }, true);
    next?.addEventListener("click", (e) => { e.preventDefault(); e.stopImmediatePropagation(); this.goNext(); }, true);
    modeSel?.addEventListener("change", (e) => {
      e.stopImmediatePropagation();
      this.mode = e.target.value === "week" ? "week" : "month";
      this.render();
    }, true);

    // Klik w bieżący miesiąc/zakres — powrót do „dziś”
    qs("#cal-current")?.addEventListener("click", () => { this.cursor = new Date(); this.render(); });

    // Aktualizacje po zmianach danych lub filtra
    this._bus.on?.("dates:updated", () => this.render());
    this._bus.on?.("storage:synced", () => this.render());
    qs("#dates-filter-category")?.addEventListener("change", () => this.render());

    // Pierwsze renderowanie
    this.render();
  },

  goPrev() {
    if (this.mode === "month") {
      const m = new Date(this.cursor);
      m.setMonth(m.getMonth() - 1);
      this.cursor = m;
    } else {
      this.cursor = addDays(this.cursor, -7);
    }
    this.render();
  },
  goNext() {
    if (this.mode === "month") {
      const m = new Date(this.cursor);
      m.setMonth(m.getMonth() + 1);
      this.cursor = m;
    } else {
      this.cursor = addDays(this.cursor, +7);
    }
    this.render();
  },

  render() {
    const grid = qs("#calendar"); if (!grid) return;

    // Nagłówek „cal-current”
    if (this.mode === "month") {
      qs("#cal-current").textContent = formatPLMonth(this.cursor);
    } else {
      const start = startOfWeek(this.cursor);
      const end = addDays(start, 6);
      const sameMonth = start.getMonth() === end.getMonth();
      const startStr = `${start.getDate()} ${start.toLocaleDateString("pl-PL", { month: sameMonth ? "long" : "short" })}`;
      const endStr = `${end.getDate()} ${end.toLocaleDateString("pl-PL", { month: "long" })} ${end.getFullYear()}`;
      qs("#cal-current").textContent = `${startStr} – ${endStr}`;
    }

    // Przygotuj siatkę
    grid.innerHTML = "";

    // Pasek nagłówków dni
    dayNames.forEach(n => {
      const h = document.createElement("div");
      h.className = "small muted";
      h.style.fontWeight = "600";
      h.style.padding = "6px";
      h.style.background = "var(--surface-2)";
      h.textContent = n;
      grid.appendChild(h);
    });

    if (this.mode === "month") {
      this._renderMonth(grid);
    } else {
      this._renderWeek(grid);
    }
  },

  _renderMonth(grid) {
    const year = this.cursor.getFullYear();
    const month = this.cursor.getMonth();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7; // pon=0
    const dim = daysInMonth(year, month);
    // Puste wypełnienie
    for (let i = 0; i < offset; i++) {
      const cell = document.createElement("div");
      cell.className = "cal-pad";
      grid.appendChild(cell);
    }
    // Dni miesiąca
    for (let d = 1; d <= dim; d++) {
      const cell = document.createElement("div");
      const current = new Date(year, month, d);
      const dateStr = ymd(current);
      cell.dataset.date = dateStr;
      cell.style.padding = "6px";
      cell.textContent = formatPLDay(current);
      if (dateStr === todayYMD()) cell.classList.add("cal-today");
      renderEventsInCell(cell, dateStr);
      grid.appendChild(cell);
    }

    // Uzupełnij do pełnych tygodni (opcjonalne — niekonieczne dla działania)
  },

  _renderWeek(grid) {
    const start = startOfWeek(this.cursor);
    for (let i = 0; i < 7; i++) {
      const current = addDays(start, i);
      const cell = document.createElement("div");
      const dateStr = ymd(current);
      cell.dataset.date = dateStr;
      cell.style.padding = "6px";
      cell.textContent = `${formatPLDay(current)}`;
      if (dateStr === todayYMD()) cell.classList.add("cal-today");
      renderEventsInCell(cell, dateStr);
      grid.appendChild(cell);
    }
  }
};

/* Inicjalizacja samoczynna */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Calendar.init(window.Bus));
} else {
  Calendar.init(window.Bus);
}

export default Calendar;