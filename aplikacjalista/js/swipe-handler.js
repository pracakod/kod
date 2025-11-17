/* ==========================================================================
   Lista — swipe-handler.js
   Odpowiada za: obsługę gestów przesunięcia (swipe) na elementach list,
   wyświetlanie arkusza akcji oraz podstawowe akcje kontekstowe.
   Współpracuje z UI.openActionSheet() i Bus (wydarzenia).
   ========================================================================== */

"use strict";

import { UI } from "./ui.js";

/* Pomocniczy snackbar (lokalny, bez zależności od app.js) */
function toast(text, actionLabel = null, actionFn = null, timeout = 3500) {
  const sb = document.querySelector("#snackbar");
  if (!sb) return;
  const act = document.querySelector("#snackbar-action");
  document.querySelector("#snackbar-text").textContent = text;
  if (actionLabel && typeof actionFn === "function") {
    act.textContent = actionLabel;
    act.hidden = false;
    const once = () => {
      act.removeEventListener("click", handler);
      act.hidden = true;
      act.onclick = null;
    };
    const handler = () => { try { actionFn(); } finally { once(); } };
    act.addEventListener("click", handler, { once: true });
  } else {
    act.hidden = true;
    act.onclick = null;
  }
  sb.hidden = false;
  sb.classList.add("show");
  setTimeout(() => { sb.hidden = true; sb.classList.remove("show"); }, timeout);
}

/* Bezpieczne otwarcie dialogu po id */
function openDialogById(id) {
  const dlg = document.querySelector(id);
  if (!dlg) return;
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
}

/* Ustal aktywną sekcję i identyfikatory list */
function getActiveContext(li) {
  const activeView = document.querySelector(".view.active");
  if (!activeView) return null;
  const sectionId = activeView.id;
  const itemId = li?.dataset?.id || null;

  if (sectionId === "view-checklist") {
    const listId = document.querySelector("#checklist-list-select")?.value || null;
    return { section: "checklist", itemId, listId, allow: ["delete","edit","move","archive","manage-list","share"] };
  }
  if (sectionId === "view-tasks") {
    const projectId = document.querySelector("#tasks-project-select")?.value || null;
    return { section: "tasks", itemId, projectId, allow: ["delete","edit","move","archive","manage-list","share"] };
  }
  if (sectionId === "view-shopping") {
    const listId = document.querySelector("#shopping-list-select")?.value || null;
    return { section: "shopping", itemId, listId, allow: ["delete","edit","move","archive","manage-list","share","oos"] };
  }
  return { section: "other", itemId, allow: ["delete","edit","archive"] };
}

/* Zarządzanie stanem przeciągnięcia */
const Drag = new Map(); // element -> {startX,startY,dx,dy,active,locked}

/* Granice i progi */
const MAX_X = 112;    // maksymalne przesunięcie wizualne
const THRESHOLD = 56; // próg zadziałania akcji po puszczeniu

/* Użyteczne warunki */
function isInteractiveTarget(evTarget) {
  const btn = evTarget.closest("button, a, input, select, textarea, label");
  const drag = evTarget.closest(".drag-handle");
  return !!btn || !!drag;
}

/* Przywrócenie pozycji elementu */
function resetTransform(el) {
  el.style.transform = "";
  el.classList.remove("swiping-left","swiping-right");
}

/* Akcje kontekstowe — szybkie (bez pełnej integracji danych) */
const QuickActions = {
  delete(ctx) {
    const li = document.querySelector(`.item.swipeable[data-id="${ctx.itemId}"]`);
    if (!li) return;
    li.classList.add("anim-fade-out");
    const parent = li.parentElement;
    const next = li.nextElementSibling;
    const clone = li.cloneNode(true);
    setTimeout(() => li.remove(), 180);
    toast("Usunięto element.", "COFNIJ", () => {
      if (next && next.parentElement === parent) parent.insertBefore(clone, next);
      else parent.appendChild(clone);
    });
  },

  edit(ctx) {
    const li = document.querySelector(`.item.swipeable[data-id="${ctx.itemId}"]`);
    if (!li) return;
    const titleEl = li.querySelector(".item-title");
    const current = titleEl?.textContent?.trim() || "";
    const value = prompt("Wprowadź nową nazwę:", current);
    if (value && titleEl) {
      titleEl.textContent = value.trim();
      li.classList.add("flash-saved");
      setTimeout(() => li.classList.remove("flash-saved"), 900);
      toast("Zmieniono nazwę pozycji.");
    }
  },

  move(ctx) {
    toast("Przeciągnij element za uchwyt, aby zmienić kolejność.");
  },

  archive(ctx) {
    const li = document.querySelector(`.item.swipeable[data-id="${ctx.itemId}"]`);
    if (!li) return;
    li.classList.add("anim-fade-out");
    setTimeout(() => li.remove(), 180);
    toast("Zarchiwizowano element.");
  },

  manageList(ctx) {
    // Zależnie od sekcji tekst etykiety
    if (ctx.section === "tasks") {
      toast("Zarządzanie projektem będzie dostępne po rozszerzeniu modułu list.");
    } else {
      toast("Zarządzanie listą będzie dostępne po rozszerzeniu modułu list.");
    }
  },

  share(ctx) {
    // Otwórz dialog udostępniania; kontekst listy/pr. zostanie podany przez app.js
    openDialogById("#dialog-share");
  },

  oos(ctx) {
    if (ctx.section !== "shopping") return;
    const li = document.querySelector(`.item.swipeable[data-id="${ctx.itemId}"]`);
    if (!li) return;
    // Oznacz status "Brak w sklepie" w metadanych wizualnych
    const meta = li.querySelector(".item-meta");
    if (!meta) return;
    const tagClass = "oos-tag";
    const exist = meta.querySelector(`.${tagClass}`);
    if (exist) {
      exist.remove();
      toast("Usunięto status „Brak w sklepie”.");
    } else {
      const span = document.createElement("span");
      span.className = `small ${tagClass}`;
      span.textContent = "Brak w sklepie";
      meta.appendChild(span);
      toast("Ustawiono status „Brak w sklepie”.");
    }
  }
};

/* Mapowanie nazw przycisków arkusza akcji na funkcje powyżej */
function handleAction(action, context) {
  switch (action) {
    case "delete":       QuickActions.delete(context); break;
    case "edit":         QuickActions.edit(context); break;
    case "move":         QuickActions.move(context); break;
    case "archive":      QuickActions.archive(context); break;
    case "manage-list":  QuickActions.manageList(context); break;
    case "share":        QuickActions.share(context); break;
    case "oos":          QuickActions.oos(context); break;
    default: break;
  }
}

/* Główny moduł exportowany */
export const Swipe = {
  _bus: { on() {}, emit() {} },

  init(Bus) {
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;

    // Delegacja zdarzeń na główny obszar
    const root = document.querySelector("main#main");
    if (!root) return;

    root.addEventListener("pointerdown", this._onPointerDown.bind(this), { passive: true });
    root.addEventListener("pointermove", this._onPointerMove.bind(this), { passive: true });
    root.addEventListener("pointerup", this._onPointerUp.bind(this), { passive: true });
    root.addEventListener("pointercancel", this._onPointerCancel.bind(this), { passive: true });
    root.addEventListener("pointerleave", this._onPointerCancel.bind(this), { passive: true });

    // Nasłuch akcji z arkusza
    this._bus.on?.("swipe:action", ({ action, context }) => {
      // Bezpieczne domknięcie wszelkich wizualnych transformacji
      const li = document.querySelector(`.item.swipeable[data-id="${context?.itemId}"]`);
      if (li) resetTransform(li);
      handleAction(action, context || {});
    });
  },

  _findItem(target) {
    return target?.closest?.(".item.swipeable");
  },

  _onPointerDown(e) {
    const li = this._findItem(e.target);
    if (!li) return;
    if (isInteractiveTarget(e.target)) return; // nie koliduj z innymi kontrolkami

    li.setPointerCapture?.(e.pointerId);
    Drag.set(li, { startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, active: true, locked: null });
  },

  _onPointerMove(e) {
    const li = this._findItem(e.target);
    if (!li) return;
    const st = Drag.get(li);
    if (!st || !st.active) return;

    st.dx = e.clientX - st.startX;
    st.dy = e.clientY - st.startY;

    // Blokada kierunku: gdy wykryto przewagę osi
    if (!st.locked) {
      if (Math.abs(st.dx) > 8 && Math.abs(st.dx) > Math.abs(st.dy)) st.locked = "x";
      else if (Math.abs(st.dy) > 8) st.locked = "y";
    }
    if (st.locked === "y") {
      // Ruch pionowy — anuluj swipe, pozwól na przewijanie
      this._cancel(li);
      return;
    }
    // Ogranicz zakres przesunięcia
    const tx = Math.max(-MAX_X, Math.min(MAX_X, st.dx));
    li.style.transform = `translateX(${tx}px)`;
    li.classList.toggle("swiping-left", tx < -12);
    li.classList.toggle("swiping-right", tx > 12);
  },

  _onPointerUp(e) {
    const li = this._findItem(e.target);
    if (!li) return;
    const st = Drag.get(li);
    if (!st) return;

    const dx = st.dx || 0;
    const abs = Math.abs(dx);
    const left = dx < 0;

    // Przywróć transformację
    resetTransform(li);
    Drag.delete(li);

    // Niewielkie przesunięcie — traktuj jak zwykły tap
    if (abs < THRESHOLD) return;

    // Akcja: lewo => arkusz akcji
    if (left) {
      const ctx = getActiveContext(li);
      if (!ctx) return;
      ctx.itemId = ctx.itemId || li.dataset.id || null;
      UI.openActionSheet(ctx);
      return;
    }

    // Prawy swipe — skrót: oznacz jako wykonane/kupione (jeśli jest checkbox)
    if (!left) {
      const checkbox = li.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        toast("Zmieniono stan elementu.");
      }
    }
  },

  _onPointerCancel(e) {
    const li = this._findItem(e.target);
    if (!li) return;
    this._cancel(li);
  },

  _cancel(li) {
    resetTransform(li);
    Drag.delete(li);
  }
};

export default Swipe;