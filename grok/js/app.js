/* ==========================================================================
   Lista — Główna logika aplikacji (PWA, mobile‑first)
   Plik: js/app.js
   Odpowiada za: inicjalizację aplikacji, nawigację, FAB, ekran startowy,
   tryb offline/online, snackbar, rejestrację Service Workera, integrację z
   modułami (Auth, Storage, UI, Settings, Realtime, itd.).
   Wersja UI: Lista DareG 1.0v
   ========================================================================== */

"use strict";

/* --------------------------------------------------------------------------
   Pomocnicze narzędzia
   -------------------------------------------------------------------------- */

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const formatPL = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" });
const formatPLShort = new Intl.DateTimeFormat("pl-PL");
const PLN = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

const uuid = () => crypto?.randomUUID?.() || ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
  (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
);

const debounce = (fn, t = 200) => {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), t);
  };
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/* Prosty Bus zdarzeń międzymodułowych */
const Bus = {
  on(type, handler) {
    document.addEventListener(`bus:${type}`, (e) => handler(e.detail));
  },
  emit(type, detail = undefined) {
    document.dispatchEvent(new CustomEvent(`bus:${type}`, { detail }));
  }
};
window.Bus = Bus;

/* Snackbar / Toast */
function showToast(text, actionLabel = null, actionFn = null, timeout = 3500) {
  const sb = qs("#snackbar");
  if (!sb) return;
  const action = qs("#snackbar-action");
  qs("#snackbar-text").textContent = text;
  if (actionLabel && actionFn) {
    action.textContent = actionLabel;
    action.hidden = false;
    const once = () => {
      action.removeEventListener("click", once);
      action.hidden = true;
      action.onclick = null;
    };
    action.onclick = () => {
      try { actionFn(); } finally { once(); }
    };
  } else {
    action.hidden = true;
    action.onclick = null;
  }
  sb.hidden = false;
  sb.classList.add("show");
  setTimeout(() => { sb.hidden = true; sb.classList.remove("show"); }, timeout);
}

/* Bezpieczne otwarcie/zamknięcie <dialog> */
function openDialog(id) {
  const dlg = qs(id);
  if (!dlg) return;
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
}
function closeDialog(id) {
  const dlg = qs(id);
  if (!dlg) return;
  if (typeof dlg.close === "function") dlg.close();
  else dlg.removeAttribute("open");
}

/* --------------------------------------------------------------------------
   Dynamiczne ładowanie modułów opcjonalnych (zawartość zostanie dostarczona
   w kolejnych plikach). Stosujemy bezpieczne stuby do czasu podmiany.
   -------------------------------------------------------------------------- */

function stubAPI(namespace) {
  return new Proxy({}, {
    get(_t, prop) {
      return (...args) => console.warn(`[STUB:${namespace}] ${String(prop)}()`, args);
    }
  });
}

async function loadModules() {
  const tryImport = async (path, name) => {
    try { return (await import(path)); }
    catch (e) { console.info(`Moduł ${name} (${path}) jeszcze niedostępny — używam stubu.`); return null; }
  };
  const mods = {};
  mods.Supa      = await tryImport("./supabase-client.js", "Supabase");
  mods.Auth      = await tryImport("./auth.js", "Auth");
  mods.Storage   = await tryImport("./storage.js", "Storage");
  mods.UI        = await tryImport("./ui.js", "UI");
  mods.Swipe     = await tryImport("./swipe-handler.js", "Swipe");
  mods.Archive   = await tryImport("./archive.js", "Archive");
  mods.Settings  = await tryImport("./settings.js", "Settings");
  mods.Barcode   = await tryImport("./barcode-scanner.js", "Barcode");
  mods.Stats     = await tryImport("./statistics.js", "Statistics");
  mods.Loyalty   = await tryImport("./loyalty-cards.js", "Loyalty");
  mods.ListMgr   = await tryImport("./list-manager.js", "ListManager");
  mods.Sharing   = await tryImport("./sharing.js", "Sharing");
  mods.Receipts  = await tryImport("./receipts.js", "Receipts");
  mods.Recipes   = await tryImport("./recipes.js", "Recipes");
  mods.Vacations = await tryImport("./vacations.js", "Vacations");
  mods.Notifs    = await tryImport("./notifications.js", "Notifications");
  mods.Dates     = await tryImport("./important-dates.js", "ImportantDates");
  mods.Calendar  = await tryImport("./calendar.js", "Calendar");
  mods.Profile   = await tryImport("./profile.js", "Profile");

  /* Przypisanie stubs */
  return {
    Supa:      mods.Supa      ?? stubAPI("Supabase"),
    Auth:      mods.Auth      ?? stubAPI("Auth"),
    Storage:   mods.Storage   ?? stubAPI("Storage"),
    UI:        mods.UI        ?? stubAPI("UI"),
    Swipe:     mods.Swipe     ?? stubAPI("Swipe"),
    Archive:   mods.Archive   ?? stubAPI("Archive"),
    Settings:  mods.Settings  ?? stubAPI("Settings"),
    Barcode:   mods.Barcode   ?? stubAPI("Barcode"),
    Stats:     mods.Stats     ?? stubAPI("Statistics"),
    Loyalty:   mods.Loyalty   ?? stubAPI("Loyalty"),
    ListMgr:   mods.ListMgr   ?? stubAPI("ListManager"),
    Sharing:   mods.Sharing   ?? stubAPI("Sharing"),
    Receipts:  mods.Receipts  ?? stubAPI("Receipts"),
    Recipes:   mods.Recipes   ?? stubAPI("Recipes"),
    Vacations: mods.Vacations ?? stubAPI("Vacations"),
    Notifs:    mods.Notifs    ?? stubAPI("Notifications"),
    Dates:     mods.Dates     ?? stubAPI("ImportantDates"),
    Calendar:  mods.Calendar  ?? stubAPI("Calendar"),
    Profile:   mods.Profile   ?? stubAPI("Profile"),
  };
}

/* --------------------------------------------------------------------------
   Fallback lokalny (działa od razu w trybie gościa, bez czekania na moduły)
   Prosty magazyn w localStorage dla sekcji: Checklista, Zadania, Zakupy.
   Docelowo zostanie w pełni przejęty przez storage.js i list-manager.js.
   -------------------------------------------------------------------------- */
const Fallback = {
  key: "lista:fallback",
  data: null,
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) this.data = JSON.parse(raw);
    } catch {}
    if (!this.data) {
      const listId = uuid();
      const projId = uuid();
      const shopId = uuid();
      this.data = {
        checklist: {
          lists: [{ id: listId, name: "Dom", color: "blue" }],
          items: { [listId]: [] }
        },
        tasks: {
          projects: [{ id: projId, name: "Ogólne", color: "green" }],
          items: { [projId]: [] },
          categories: ["praca", "dom", "osobiste"]
        },
        shopping: {
          lists: [{ id: shopId, name: "Bieżące", color: "amber" }],
          items: { [shopId]: [] },
          stores: []
        },
        receipts: [],
        loyalty: [],
        dates: []
      };
      this.save();
    }
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch {} },
  addChecklistItem(listId, title) {
    const it = { id: uuid(), title, done: false, created_at: Date.now() };
    (this.data.checklist.items[listId] ??= []).push(it);
    this.save(); return it;
  },
  toggleChecklistItem(listId, itemId, done) {
    const arr = this.data.checklist.items[listId] || [];
    const it = arr.find(i => i.id === itemId);
    if (it) { it.done = done; it.updated_at = Date.now(); this.save(); }
  },
  addTask(projectId, payload) {
    const it = {
      id: uuid(),
      title: payload.title?.trim() || "Zadanie",
      notes: payload.notes || "",
      priority: payload.priority || "medium",
      due: payload.due || null,
      category: payload.category || "",
      done: false,
      subtasks: payload.subtasks || [],
      created_at: Date.now()
    };
    (this.data.tasks.items[projectId] ??= []).push(it);
    this.save(); return it;
  },
  setTaskDone(projectId, taskId, done) {
    const arr = this.data.tasks.items[projectId] || [];
    const it = arr.find(i => i.id === taskId);
    if (it) { it.done = done; it.updated_at = Date.now(); this.save(); }
  },
  addShoppingItem(listId, payload) {
    const it = {
      id: uuid(),
      name: payload.name || "Produkt",
      qty: Number(payload.qty ?? 1),
      category: payload.category || "",
      store: payload.store || "",
      cost: Number(payload.cost ?? 0),
      bought: false,
      oos: false,
      created_at: Date.now()
    };
    (this.data.shopping.items[listId] ??= []).push(it);
    this.save(); return it;
  },
  setShoppingBought(listId, itemId, bought) {
    const arr = this.data.shopping.items[listId] || [];
    const it = arr.find(i => i.id === itemId);
    if (it) { it.bought = bought; it.updated_at = Date.now(); this.save(); }
  },
  addReceipt(payload) {
    const it = { id: uuid(), ...payload, created_at: Date.now() };
    this.data.receipts.push(it); this.save(); return it;
  },
  addLoyaltyCard(payload) {
    const it = { id: uuid(), ...payload, created_at: Date.now() };
    this.data.loyalty.push(it); this.save(); return it;
  },
  addDate(payload) {
    const it = { id: uuid(), ...payload, created_at: Date.now() };
    this.data.dates.push(it); this.save(); return it;
  }
};

/* --------------------------------------------------------------------------
   Renderery fallback (podstawowy UX do czasu dołączenia wyspecjalizowanych
   modułów zarządzających listami i sekcjami)
   -------------------------------------------------------------------------- */
const Render = {
  current: {
    checklistListId: null,
    taskProjectId: null,
    shoppingListId: null,
  },

  /* Checklista */
  checklist() {
    const select = qs("#checklist-list-select");
    const { lists, items } = Fallback.data.checklist;
    /* listy */
    select.innerHTML = "";
    for (const l of lists) {
      const opt = document.createElement("option");
      opt.value = l.id; opt.textContent = l.name; select.appendChild(opt);
    }
    if (!this.current.checklistListId) this.current.checklistListId = lists[0]?.id;
    if (this.current.checklistListId) select.value = this.current.checklistListId;

    /* elementy */
    const listId = this.current.checklistListId;
    const todoUL = qs("#checklist-todo");
    const doneUL = qs("#checklist-done");
    todoUL.innerHTML = ""; doneUL.innerHTML = "";

    const arr = (items[listId] || []).slice().sort((a,b)=>a.created_at-b.created_at);
    for (const it of arr) {
      const tpl = qs("#tpl-checklist-item");
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.dataset.id = it.id;
      li.querySelector(".item-title").textContent = it.title;
      const cb = li.querySelector(".item-done");
      cb.checked = !!it.done;
      cb.addEventListener("change", () => {
        Fallback.toggleChecklistItem(listId, it.id, cb.checked);
        Render.checklist(); // przeniesienie do Zrobione
      });
      (it.done ? doneUL : todoUL).appendChild(li);
    }
  },

  /* Zadania */
  tasks() {
    const select = qs("#tasks-project-select");
    const { projects, items } = Fallback.data.tasks;
    select.innerHTML = "";
    for (const p of projects) {
      const opt = document.createElement("option");
      opt.value = p.id; opt.textContent = p.name; select.appendChild(opt);
    }
    if (!this.current.taskProjectId) this.current.taskProjectId = projects[0]?.id;
    if (this.current.taskProjectId) select.value = this.current.taskProjectId;

    const ul = qs("#tasks-list"); ul.innerHTML = "";
    const arr = (items[this.current.taskProjectId] || []).slice().sort((a,b)=>a.created_at-b.created_at);
    for (const it of arr) {
      const tpl = qs("#tpl-task-item");
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.dataset.id = it.id;
      li.querySelector(".item-title").textContent = it.title;
      li.querySelector(".item-category").textContent = it.category || "";
      li.querySelector(".item-due").textContent = it.due ? formatPL.format(new Date(it.due)) : "";
      li.querySelector(".priority-dot").classList.add(`priority-${it.priority}`);
      li.querySelector(".mark-done").addEventListener("click", () => {
        Fallback.setTaskDone(this.current.taskProjectId, it.id, !it.done);
        Render.tasks();
      });
      ul.appendChild(li);
    }
  },

  /* Zakupy */
  shopping() {
    const select = qs("#shopping-list-select");
    const { lists, items } = Fallback.data.shopping;
    select.innerHTML = "";
    for (const l of lists) {
      const opt = document.createElement("option");
      opt.value = l.id; opt.textContent = l.name; select.appendChild(opt);
    }
    if (!this.current.shoppingListId) this.current.shoppingListId = lists[0]?.id;
    if (this.current.shoppingListId) select.value = this.current.shoppingListId;

    const ul = qs("#shopping-list"); ul.innerHTML = "";
    const arr = (items[this.current.shoppingListId] || []).slice().sort((a,b)=>a.created_at-b.created_at);
    let total = 0, count = arr.length;
    for (const it of arr) {
      const tpl = qs("#tpl-shopping-item");
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.dataset.id = it.id;
      li.querySelector(".item-title").textContent = it.name;
      li.querySelector(".item-qty").textContent = it.qty ? `Ilość: ${it.qty}` : "";
      li.querySelector(".item-category").textContent = it.category || "";
      li.querySelector(".item-store").textContent = it.store || "";
      li.querySelector(".item-price").textContent = it.cost ? PLN.format(it.cost) : "";
      const cb = li.querySelector(".item-bought");
      cb.checked = !!it.bought;
      cb.addEventListener("change", () => {
        Fallback.setShoppingBought(this.current.shoppingListId, it.id, cb.checked);
        Render.shopping(); // aktualizacja podsumowania
      });
      ul.appendChild(li);
      if (!it.bought && it.cost) total += Number(it.cost) || 0;
    }
    qs("#shopping-count").textContent = count.toString();
    qs("#shopping-total").textContent = PLN.format(total);
  },

  /* Paragony (lista prosta) */
  receipts() {
    const ul = qs("#receipts-list");
    if (!ul) return;
    ul.innerHTML = "";
    const arr = Fallback.data.receipts.slice().sort((a,b)=>b.created_at-a.created_at);
    for (const r of arr) {
      const li = document.createElement("li"); li.className = "item";
      const main = document.createElement("div"); main.className = "item-main";
      const title = document.createElement("div"); title.className = "item-title";
      title.textContent = r.store || "Paragon";
      const meta = document.createElement("div"); meta.className = "item-meta small muted";
      meta.textContent = `${r.date || formatPLShort.format(new Date(r.created_at))} • ${PLN.format(Number(r.total || 0))}`;
      main.appendChild(title); main.appendChild(meta);
      li.appendChild(document.createElement("span")); // placeholder dla checkbox layoutu
      li.appendChild(main);
      li.appendChild(document.createElement("span")); // placeholder uchwytu
      ul.appendChild(li);
    }
  },

  /* Karty lojalnościowe (lista prosta) */
  loyalty() {
    const ul = qs("#loyalty-list"); if (!ul) return;
    ul.innerHTML = "";
    for (const c of Fallback.data.loyalty) {
      const tpl = qs("#tpl-loyalty-card");
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.dataset.id = c.id;
      li.querySelector(".card-title").textContent = c.name || "Karta";
      li.querySelector(".card-code").textContent = c.code || "";
      li.querySelector(".show-barcode").addEventListener("click", () => {
        showToast("Podgląd kodu w pełnym ekranie zostanie włączony po dodaniu modułu kart.", null, null, 3000);
      });
      ul.appendChild(li);
    }
  },

  /* Ważne daty — lista i kalendarz (minimalny render) */
  dates() {
    const ul = qs("#dates-list"); if (!ul) return;
    ul.innerHTML = "";
    const arr = Fallback.data.dates.slice().sort((a,b)=> new Date(a.date) - new Date(b.date));
    for (const e of arr) {
      const li = document.createElement("li"); li.className = "item";
      const main = document.createElement("div"); main.className = "item-main";
      const title = document.createElement("div"); title.className = "item-title";
      title.textContent = e.title || "Wydarzenie";
      const meta = document.createElement("div"); meta.className = "item-meta small muted";
      meta.textContent = `${e.category || "inne"} • ${formatPL.format(new Date(e.date))}`;
      main.appendChild(title); main.appendChild(meta);
      li.appendChild(document.createElement("span"));
      li.appendChild(main);
      li.appendChild(document.createElement("span"));
      ul.appendChild(li);
    }
    CalendarBasic.render();
  }
};

/* Kalendarz bazowy (fallback) — miesięczny */
const CalendarBasic = {
  cursor: new Date(),
  mode: "month",
  render() {
    const grid = qs("#calendar"); if (!grid) return;
    const current = new Date(this.cursor);
    const y = current.getFullYear(), m = current.getMonth();
    qs("#cal-current").textContent = current.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });

    grid.innerHTML = "";
    const first = new Date(y, m, 1);
    const startDay = (first.getDay() + 6) % 7; // pon=0
    const daysInMonth = new Date(y, m+1, 0).getDate();

    for (let i=0;i<startDay;i++) {
      const cell = document.createElement("div");
      cell.className = "cal-pad";
      grid.appendChild(cell);
    }
    for (let d=1; d<=daysInMonth; d++) {
      const cell = document.createElement("div");
      const dateStr = new Date(y, m, d).toISOString().slice(0,10);
      cell.textContent = d.toString();
      if (dateStr === todayISO()) cell.classList.add("cal-today");
      // znaczniki wydarzeń
      const evCount = Fallback.data.dates.filter(e => e.date === dateStr).length;
      if (evCount > 0) {
        const dot = document.createElement("div");
        dot.style.width = "6px"; dot.style.height = "6px";
        dot.style.background = "var(--primary)"; dot.style.borderRadius = "50%";
        dot.style.marginTop = "4px";
        cell.appendChild(document.createElement("br"));
        cell.appendChild(dot);
      }
      grid.appendChild(cell);
    }
  }
};

/* --------------------------------------------------------------------------
   Aplikacja
   -------------------------------------------------------------------------- */
const App = {
  mods: null,
  state: {
    online: navigator.onLine,
    user: null,
    guest: false,
    activeViewId: "view-checklist"
  },

  async init() {
    // data wydania
    const rd = qs("#release-date"); if (rd) rd.textContent = formatPL.format(new Date());

    // Załadowanie danych fallback (zawsze dostępne)
    Fallback.load();

    // Rejestracja SW (pozwoli na PWA i cache offline)
    this.registerServiceWorker();

    // Załaduj moduły (jeśli jeszcze nie dostarczone — użyj stubów)
    this.mods = await loadModules();

    // Ustawienia i motywy
    try { await this.mods.Settings.init?.(); } catch {}
    // Zastosowanie ustawień Wyglądu (przełączniki)
    this.applyAppearanceToggles();

    // Inicjalizacja UI/specjalizowanych modułów (swipe, itp.)
    try { this.mods.Swipe.init?.(Bus); } catch {}

    // Obsługa statusu online/offline
    this.initNetworkBanner();

    // Nawigacja i interfejs
    this.initNav();
    this.initDrawer();
    this.initGlobalSearch();
    this.initFAB();
    this.initOptions();
    this.initAbout();
    this.initProfile();

    // Inicjalizacja sekcji bazowych (render fallback)
    Render.checklist();
    Render.tasks();
    Render.shopping();
    Render.receipts();
    Render.loyalty();
    Render.dates();

    // Zdarzenia selectów list/projektów
    qs("#checklist-list-select")?.addEventListener("change", (e) => {
      Render.current.checklistListId = e.target.value; Render.checklist();
    });
    qs("#tasks-project-select")?.addEventListener("change", (e) => {
      Render.current.taskProjectId = e.target.value; Render.tasks();
    });
    qs("#shopping-list-select")?.addEventListener("change", (e) => {
      Render.current.shoppingListId = e.target.value; Render.shopping();
    });

    // Podłącz przyciski sekcji
    this.initSectionButtons();

    // Autentykacja i ekran startowy
    await this.initAuthAndStartScreen();

    // Powiadomienia
    try { await this.mods.Notifs.init?.(); } catch {}
  },

  /* ------------------------ Service Worker ------------------------------- */
  async registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            showToast("Dostępna nowa wersja aplikacji.", "Odśwież", () => location.reload());
          }
        });
      });
    } catch (e) {
      console.warn("Rejestracja Service Workera nie powiodła się:", e);
    }
  },

  /* --------------------- Online / Offline banner ------------------------ */
  initNetworkBanner() {
    const banner = qs("#offline-banner");
    const syncBtn = qs("#btn-sync-now");
    const update = () => {
      this.state.online = navigator.onLine;
      banner.hidden = this.state.online;
      if (!this.state.online) banner.classList.add("show");
      else banner.classList.remove("show");
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    syncBtn?.addEventListener("click", async () => {
      try { await this.mods.Storage.syncNow?.(); showToast("Synchronizacja zakończona."); }
      catch { showToast("Nie udało się zsynchronizować. Spróbuj ponownie później."); }
    });
  },

  /* ------------------------ Nawigacja i widoki -------------------------- */
  switchView(viewId) {
    if (this.state.activeViewId === viewId) return;
    qsa(".view").forEach(v => { v.hidden = v.id !== viewId; v.classList.toggle("active", v.id === viewId); });
    qsa(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.target === viewId));
    this.state.activeViewId = viewId;
    // Drobne: animacja FAB po zmianie
    const fab = qs("#fab"); fab?.classList.add("appear");
    setTimeout(() => fab?.classList.remove("appear"), 320);
  },

  initNav() {
    // Dolne menu
    qsa(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => this.switchView(btn.dataset.target));
    });
  },

  initDrawer() {
    const drawer = qs("#drawer");
    qs("#btn-open-drawer")?.addEventListener("click", () => drawer.setAttribute("aria-hidden", "false"));
    qs("#btn-close-drawer")?.addEventListener("click", () => drawer.setAttribute("aria-hidden", "true"));
    qsa(".drawer-item").forEach(item => {
      item.addEventListener("click", () => {
        const target = item.dataset.targetView;
        if (target) this.switchView(`view-${target}`);
        drawer.setAttribute("aria-hidden", "true");
      });
    });
  },

  /* -------------------------- Wyszukiwanie ------------------------------ */
  initGlobalSearch() {
    const panel = qs("#global-search");
    const toggle = qs("#btn-toggle-search");
    const clear = qs("#btn-clear-search");
    const input = qs("#global-search-input");

    const apply = debounce(() => {
      const q = (input.value || "").trim().toLowerCase();
      // Proste filtrowanie w obrębie aktualnego widoku
      const view = qs(`#${this.state.activeViewId}`);
      const lists = qsa(".list-items > li, .card-list > li", view);
      lists.forEach(li => {
        const text = (li.textContent || "").toLowerCase();
        li.style.display = text.includes(q) ? "" : "none";
      });
    }, 120);

    toggle?.addEventListener("click", () => {
      const isHidden = panel.hasAttribute("hidden");
      if (isHidden) {
        panel.removeAttribute("hidden");
        toggle.setAttribute("aria-expanded", "true");
        input.focus();
      } else {
        panel.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
        input.value = ""; apply();
      }
    });
    clear?.addEventListener("click", () => { input.value = ""; input.focus(); apply(); });
    input?.addEventListener("input", apply);
  },

  /* ------------------------------ FAB ----------------------------------- */
  initFAB() {
    const fab = qs("#fab");
    fab?.addEventListener("click", () => {
      const active = this.state.activeViewId;
      if (active === "view-checklist") {
        const title = prompt("Nazwa zadania:");
        if (title && Render.current.checklistListId) {
          Fallback.addChecklistItem(Render.current.checklistListId, title.trim());
          Render.checklist();
          showToast("Dodano do Checklisty.");
        }
      } else if (active === "view-tasks") {
        // pełny formularz
        openDialog("#dialog-task");
      } else if (active === "view-shopping") {
        // formularz pozycji zakupowej
        openDialog("#dialog-shopping");
      } else if (active === "view-recipes") {
        // dodanie przepisu (po dostarczeniu modułu)
        showToast("Formularz dodawania przepisu będzie dostępny wkrótce.");
      } else if (active === "view-vacations") {
        showToast("Formularz planu wakacyjnego będzie dostępny wkrótce.");
      } else if (active === "view-dates") {
        this.addDateQuick();
      } else {
        // domyślnie nic
        showToast("Brak akcji dla bieżącego widoku.");
      }
    });

    // Zapis z dialogów
    qs("#btn-save-task")?.addEventListener("click", (e) => {
      e.preventDefault();
      const payload = {
        title: qs("#task-title").value,
        notes: qs("#task-notes").value,
        priority: qs("#task-priority").value,
        due: qs("#task-due").value || null,
        category: qs("#task-category").value
      };
      if (!payload.title?.trim()) return;
      Fallback.addTask(Render.current.taskProjectId, payload);
      closeDialog("#dialog-task");
      Render.tasks();
      showToast("Zadanie zapisano.");
    });

    qs("#btn-save-shopping")?.addEventListener("click", (e) => {
      e.preventDefault();
      const payload = {
        name: qs("#shop-name").value,
        qty: qs("#shop-qty").value,
        category: qs("#shop-category").value,
        cost: qs("#shop-cost").value,
        store: qs("#shop-store").value
      };
      if (!payload.name?.trim()) return;
      Fallback.addShoppingItem(Render.current.shoppingListId, payload);
      closeDialog("#dialog-shopping");
      Render.shopping();
      showToast("Pozycję dodano.");
    });
  },

  /* ------------------------------ Sekcje -------------------------------- */
  initSectionButtons() {
    // Checklista
    qs("#btn-clear-completed-checklist")?.addEventListener("click", () => {
      const id = Render.current.checklistListId;
      if (!id) return;
      const arr = Fallback.data.checklist.items[id] || [];
      const before = arr.length;
      Fallback.data.checklist.items[id] = arr.filter(i => !i.done);
      Fallback.save();
      Render.checklist();
      showToast(`Usunięto ${before - Fallback.data.checklist.items[id].length} elementów.`);
    });
    qs("#btn-share-checklist")?.addEventListener("click", () => this.openShareDialog("checklist", Render.current.checklistListId));

    // Zadania
    qs("#btn-clear-completed-tasks")?.addEventListener("click", () => {
      const id = Render.current.taskProjectId;
      if (!id) return;
      const arr = Fallback.data.tasks.items[id] || [];
      const before = arr.length;
      Fallback.data.tasks.items[id] = arr.filter(i => !i.done);
      Fallback.save();
      Render.tasks();
      showToast(`Usunięto ${before - Fallback.data.tasks.items[id].length} zadań.`);
    });
    qs("#btn-share-project")?.addEventListener("click", () => this.openShareDialog("tasks", Render.current.taskProjectId));

    // Zakupy
    qs("#btn-share-shopping")?.addEventListener("click", () => this.openShareDialog("shopping", Render.current.shoppingListId));

    // Paragony — OCR i ręczne
    qs("#btn-receipt-add-manual")?.addEventListener("click", () => openDialog("#dialog-ocr"));
    qs("#btn-ocr-close")?.addEventListener("click", () => closeDialog("#dialog-ocr"));
    qs("#btn-ocr-save")?.addEventListener("click", () => {
      const payload = {
        store: qs("#ocr-store").value,
        date: qs("#ocr-date").value || todayISO(),
        total: parseFloat(qs("#ocr-total").value || "0"),
        tags: qs("#ocr-tags").value,
        ocr_text: qs("#ocr-text").value
      };
      Fallback.addReceipt(payload);
      closeDialog("#dialog-ocr");
      Render.receipts();
      showToast("Paragon zapisany.");
      Bus.emit("stats:updated");
    });

    // Karty lojalnościowe
    qs("#btn-loyalty-add")?.addEventListener("click", () => {
      const name = prompt("Nazwa karty (np. Biedronka):");
      const code = name ? prompt("Kod karty:") : null;
      if (name && code) {
        Fallback.addLoyaltyCard({ name: name.trim(), code: code.trim() });
        Render.loyalty();
        showToast("Kartę zapisano.");
      }
    });

    // Przepisy / Wakacje — zostaną rozszerzone przez dedykowane moduły
  },

  openShareDialog(type, id) {
    if (!id) return;
    openDialog("#dialog-share");
    qs("#btn-share-send").onclick = (e) => {
      e.preventDefault();
      const email = qs("#share-email").value.trim();
      const perm = qs("#share-permissions").value;
      if (!email) return;
      try {
        this.mods.Sharing.invite?.({ type, id, email, perm });
        showToast("Zaproszenie wysłano.");
      } catch {
        showToast("Zaproszenie zostało zapamiętane i zostanie wysłane po zalogowaniu.");
      }
      closeDialog("#dialog-share");
      qs("#form-share").reset();
    };
  },

  addDateQuick() {
    const title = prompt("Tytuł wydarzenia:");
    if (!title) return;
    const date = prompt("Data (RRRR-MM-DD):", todayISO());
    if (!date) return;
    const cat = prompt("Kategoria (urodziny/rocznice/inne):", "inne");
    Fallback.addDate({ title: title.trim(), date, category: (cat || "inne").toLowerCase() });
    Render.dates();
    showToast("Wydarzenie dodane.");
  },

  /* ------------------------------ Opcje --------------------------------- */
  initOptions() {
    // Eksport/Import
    qs("#btn-export-json")?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(Fallback.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `lista-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
      URL.revokeObjectURL(url);
    });
    const importJSON = () => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = "application/json";
      inp.onchange = () => {
        const file = inp.files?.[0]; if (!file) return;
        const fr = new FileReader();
        fr.onload = () => {
          try {
            const obj = JSON.parse(fr.result);
            if (obj && typeof obj === "object") {
              Fallback.data = obj; Fallback.save();
              Render.checklist(); Render.tasks(); Render.shopping(); Render.receipts(); Render.loyalty(); Render.dates();
              showToast("Dane zaimportowano.");
            }
          } catch { showToast("Nieprawidłowy plik."); }
        };
        fr.readAsText(file);
      };
      inp.click();
    };
    qs("#btn-import-json")?.addEventListener("click", importJSON);
    qs("#btn-export-csv")?.addEventListener("click", () => {
      // przykładowy eksport CSV zakupów
      const listId = Render.current.shoppingListId;
      const rows = (Fallback.data.shopping.items[listId] || []).map(i =>
        [i.name, i.qty, i.category, i.store, i.cost, i.bought ? "TAK" : "NIE"].join(";")
      );
      const csv = ["Produkt;Ilość;Kategoria;Sklep;Koszt;Kupione", ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `lista-zakupy-${new Date().toISOString().slice(0,10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    });

    // Powiadomienia — preferencje (zostaną obsłużone przez notifications.js)
    const bindToggle = (id, key) => {
      qs(id)?.addEventListener("change", (e) => {
        this.mods.Notifs.setPref?.(key, e.target.checked);
        showToast("Ustawienia powiadomień zapisane.");
      });
    };
    bindToggle("#notif-global-toggle", "global");
    bindToggle("#notif-checklist", "checklist");
    bindToggle("#notif-tasks", "tasks");
    bindToggle("#notif-shopping", "shopping");
    bindToggle("#notif-dates", "dates");
    bindToggle("#notif-shared", "shared");

    // Ciche godziny
    qs("#notif-quiet-hours")?.addEventListener("change", (e) => {
      const on = e.target.checked;
      const from = qs("#quiet-from").value; const to = qs("#quiet-to").value;
      this.mods.Notifs.setQuietHours?.(on ? { from, to } : null);
      showToast("Zaktualizowano ciche godziny.");
    });

    // Motywy (podgląd i zastosowanie)
    qs("#btn-theme-preview")?.addEventListener("click", () => this.mods.Settings.previewTheme?.());
    qs("#btn-theme-apply")?.addEventListener("click", () => {
      this.mods.Settings.applyTheme?.();
      showToast("Motyw zastosowano.");
    });
  },

  applyAppearanceToggles() {
    // Wygląd — wiązanie pól do klas body
    const fontSize = qs("#opt-font-size");
    const fontFamily = qs("#opt-font-family");
    const density = qs("#opt-density");
    const itemSize = qs("#opt-item-size");
    const radius = qs("#opt-radius");
    const elevation = qs("#opt-elevation");
    const anim = qs("#opt-animations");
    const showSearch = qs("#opt-show-search");

    const apply = () => {
      const b = document.body;
      b.classList.remove("font-base","font-serif","font-mono");
      b.classList.add(fontFamily?.value === "serif" ? "font-serif" : fontFamily?.value === "mono" ? "font-mono" : "font-base");

      b.style.setProperty("--fs-3", fontSize?.value === "small" ? "0.95rem" : fontSize?.value === "large" ? "1.06rem" : fontSize?.value === "xlarge" ? "1.16rem" : "1rem");

      b.classList.remove("density-compact","density-normal","density-spacious");
      b.classList.add(density?.value === "compact" ? "density-compact" : density?.value === "spacious" ? "density-spacious" : "density-normal");

      b.classList.remove("radius-none","radius-small","radius-medium","radius-large");
      b.classList.add(radius?.value === "none" ? "radius-none" : radius?.value === "sm" ? "radius-small" : radius?.value === "lg" ? "radius-large" : "radius-medium");

      b.classList.remove("elevation-none","elevation-low","elevation-high");
      b.classList.add(elevation?.value === "none" ? "elevation-none" : elevation?.value === "high" ? "elevation-high" : "elevation-low");

      b.classList.toggle("animations-on", !!anim?.checked);
      qs("#global-search")?.toggleAttribute("hidden", !showSearch?.checked);
    };

    [fontSize,fontFamily,density,itemSize,radius,elevation,anim,showSearch].forEach(el => el?.addEventListener("change", apply));
    apply();
  },

  /* ------------------------------ O aplikacji --------------------------- */
  initAbout() {
    qs("#btn-user-guide")?.addEventListener("click", () => showToast("Przewodnik użytkownika będzie dostępny po publikacji."));
    qs("#btn-faq")?.addEventListener("click", () => showToast("Sekcja FAQ zostanie opublikowana wkrótce."));
    qs("#btn-tips")?.addEventListener("click", () => showToast("Porady i wskazówki zostaną dodane."));
    qs("#btn-support")?.addEventListener("click", () => showToast("Formularz kontaktowy zostanie uruchomiony."));
    qs("#btn-community")?.addEventListener("click", () => showToast("Forum społeczności w przygotowaniu."));
    qs("#btn-video")?.addEventListener("click", () => showToast("Samouczki wideo w przygotowaniu."));
  },

  /* ------------------------------ Profil -------------------------------- */
  initProfile() {
    const logout = qs("#btn-logout");
    const persist = qs("#persist-session");
    const del = qs("#btn-delete-account");

    persist?.addEventListener("change", () => {
      const on = persist.checked;
      try { this.mods.Supa.setPersistPreference?.(on); } catch {}
      localStorage.setItem("lista:persistSession", on ? "1" : "0");
      showToast("Preferencja sesji zapisana.");
    });
    logout?.addEventListener("click", async () => {
      try { await this.mods.Auth.signOut?.(); } catch {}
      this.state.user = null;
      this.state.guest = true;
      this.updateUserUI();
      showToast("Wylogowano.");
    });
    del?.addEventListener("click", async () => {
      if (!confirm("Czy na pewno chcesz usunąć konto? Tej operacji nie można cofnąć.")) return;
      try { await this.mods.Auth.deleteAccount?.(); showToast("Konto usunięto."); }
      catch { showToast("Operacja nie powiodła się. Spróbuj ponownie."); }
    });
  },

  updateUserUI() {
    const name = qs("#user-display-name");
    const email = qs("#user-display-email");
    const profEmail = qs("#profile-email");
    const profMethod = qs("#profile-method");
    if (this.state.user) {
      name.textContent = this.state.user.user_metadata?.full_name || "Użytkownik";
      email.textContent = this.state.user.email || "—";
      profEmail.textContent = this.state.user.email || "—";
      profMethod.textContent = `Metoda logowania: ${this.state.user.app_metadata?.provider || "e‑mail"}`;
      qs("#email-auth-actions")?.toggleAttribute("hidden", this.state.user.app_metadata?.provider !== "email");
    } else {
      name.textContent = "Gość";
      email.textContent = "Niezalogowano";
      profEmail.textContent = "—";
      profMethod.textContent = "Metoda logowania: —";
      qs("#email-auth-actions")?.setAttribute("hidden", "");
    }
  },

  /* ------------------------------ Auth + Start -------------------------- */
  async initAuthAndStartScreen() {
    const start = qs("#start-screen");

    // Obsługa przycisków
    qs("#btn-login-google")?.addEventListener("click", async () => {
      try {
        await this.mods.Auth.signInWithGoogle?.();
        start?.setAttribute("hidden", "");
      } catch {
        showToast("Logowanie przez Google nie powiodło się.");
      }
    });

    qs("#btn-login-email")?.addEventListener("click", () => openDialog("#dialog-auth-email"));
    qs("#btn-continue-guest")?.addEventListener("click", () => {
      this.state.guest = true;
      localStorage.setItem("lista:guest", "1");
      start?.setAttribute("hidden", "");
      showToast("Kontynuujesz jako gość.");
    });

    // Formularz e‑mail/hasło
    qs("#btn-email-signin")?.addEventListener("click", async (e) => {
      e.preventDefault();
      const email = qs("#auth-email").value.trim();
      const pass = qs("#auth-password").value;
      if (!email || !pass) return;
      try {
        await this.mods.Auth.signInWithEmail?.(email, pass);
        closeDialog("#dialog-auth-email");
        start?.setAttribute("hidden", "");
        showToast("Zalogowano.");
      } catch {
        showToast("Logowanie nie powiodło się.");
      }
    });

    // Reset hasła: wysyłka kodu i potwierdzenie
    qs("#btn-send-reset-code")?.addEventListener("click", async () => {
      const email = qs("#reset-email").value.trim();
      if (!email) return;
      try { await this.mods.Auth.sendResetCode?.(email); showToast("Kod wysłano na e‑mail."); }
      catch { showToast("Nie udało się wysłać kodu resetu."); }
    });
    qs("#btn-confirm-reset")?.addEventListener("click", async () => {
      const email = qs("#reset-email").value.trim();
      const code = qs("#reset-code").value.trim();
      const newPass = qs("#reset-new-pass").value;
      if (!email || !code || !newPass) return;
      try { await this.mods.Auth.confirmPasswordReset?.(email, code, newPass); showToast("Hasło zmienione."); }
      catch { showToast("Zmiana hasła nie powiodła się."); }
    });

    // Aktualizacja UI użytkownika po zmianie stanu sesji
    try {
      this.mods.Auth.onAuthStateChange?.((evt) => {
        this.state.user = evt?.user || null;
        if (this.state.user) this.state.guest = false;
        this.updateUserUI();
      });
      // Pobierz bieżącą sesję (jeżeli istnieje)
      const sess = await this.mods.Supa.getSession?.();
      this.state.user = sess?.user || null;
    } catch {}

    // Pokaż start screen, jeżeli brak użytkownika i brak trybu gościa
    const hasGuest = localStorage.getItem("lista:guest") === "1";
    if (!this.state.user && !hasGuest) {
      start?.removeAttribute("hidden");
    } else {
      this.state.guest = !this.state.user;
      start?.setAttribute("hidden", "");
    }
    this.updateUserUI();
  }
};

/* Uruchomienie aplikacji */
App.init().catch(err => {
  console.error("Błąd inicjalizacji aplikacji:", err);
  showToast("Wystąpił błąd inicjalizacji.");
});

/* --------------------------------------------------------------------------
   Zdarzenia kalendarza (fallback)
   -------------------------------------------------------------------------- */
qs("#cal-prev")?.addEventListener("click", () => {
  CalendarBasic.cursor.setMonth(CalendarBasic.cursor.getMonth() - 1);
  CalendarBasic.render();
});
qs("#cal-next")?.addEventListener("click", () => {
  CalendarBasic.cursor.setMonth(CalendarBasic.cursor.getMonth() + 1);
  CalendarBasic.render();
});
qs("#cal-view-mode")?.addEventListener("change", (e) => {
  CalendarBasic.mode = e.target.value;
  CalendarBasic.render(); // w wersji fallback tylko widok miesięczny
});

// Inicjalne odświeżenie kalendarza (jeśli widok już otwarty)
CalendarBasic.render();

/* --------------------------------------------------------------------------
   Użyteczne zdarzenia Bus (przykładowe)
   -------------------------------------------------------------------------- */
Bus.on("storage:synced", () => showToast("Dane zsynchronizowane."));
Bus.on("list:updated", () => {
  Render.checklist();
  Render.tasks();
  Render.shopping();
});
Bus.on("dates:updated", () => Render.dates());

/* Koniec pliku js/app.js */