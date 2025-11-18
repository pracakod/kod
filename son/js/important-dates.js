"use strict";
import { Storage } from "./storage.js";
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const fmt = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" });
const todayISO = () => new Date().toISOString().slice(0,10);
const uuid = () => crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const DEFAULT_CATEGORIES = ["urodziny", "rocznice", "inne"];
function toast(text, timeout = 2800) {
  const sb = qs("#snackbar"); if (!sb) return;
  const act = qs("#snackbar-action"); if (act) act.hidden = true;
  qs("#snackbar-text").textContent = text;
  sb.hidden = false; sb.classList.add("show");
  setTimeout(() => { sb.hidden = true; sb.classList.remove("show"); }, timeout);
}
export const Dates = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  _editingId: null,
  _cursor: new Date(),
  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;
    await Storage.init?.();
    qs("#btn-date-add")?.addEventListener("click", () => this.openEditor());
    qs("#dates-filter-category")?.addEventListener("change", () => { this.renderList(); this.renderCalendar(); });
    qs("#dates-reminders")?.addEventListener("change", (e) => this._toggleSectionReminders(e.target.checked));
    qs("#dates-list")?.addEventListener("click", (e) => {
      const li = e.target.closest("li.item"); if (!li) return;
      const id = li.dataset.id;
      if (e.target.closest(".btn-edit")) { this.openEditor(id); return; }
      if (e.target.closest(".btn-delete")) { this.remove(id); return; }
      if (e.target.closest(".btn-to-task")) { this._openToTaskDialog(id); return; }
    });
    qs("#cal-prev")?.addEventListener("click", () => setTimeout(() => this.renderCalendar(), 0));
    qs("#cal-next")?.addEventListener("click", () => setTimeout(() => this.renderCalendar(), 0));
    qs("#cal-view-mode")?.addEventListener("change", () => setTimeout(() => this.renderCalendar(), 0));
    qs("#calendar")?.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-date]");
      if (!cell) return;
      const date = cell.dataset.date;
      this.openEditor(null, { date });
    });
    this._bus.on?.("storage:synced", () => { this.renderList(); this.renderCalendar(); });
    this._bus.on?.("dates:updated", () => { this.renderList(); this.renderCalendar(); });
    this.renderList();
    this.renderCalendar();
  },
  _getAll() {
    const snap = Storage.getSnapshot?.() || {};
    return (snap.dates || []).slice().sort((a,b) => (a.date || "").localeCompare(b.date || ""));
  },
  _getFiltered() {
    const cat = (qs("#dates-filter-category")?.value || "").toLowerCase();
    const arr = this._getAll();
    if (!cat) return arr;
    return arr.filter(d => String(d.category || "inne").toLowerCase() === cat);
  },
  renderList() {
    const ul = qs("#dates-list"); if (!ul) return;
    const arr = this._getFiltered();
    ul.innerHTML = "";
    for (const d of arr) {
      const li = document.createElement("li");
      li.className = "item"; li.dataset.id = d.id;
      const ph = document.createElement("span");
      const main = document.createElement("div"); main.className = "item-main";
      const title = document.createElement("div"); title.className = "item-title";
      title.textContent = d.title || "Wydarzenie";
      const meta = document.createElement("div"); meta.className = "item-meta small muted";
      const cat = d.category || "inne";
      meta.textContent = `${cat} • ${fmt.format(new Date(d.date))}${d.remind ? ` • przypomnienie: ${this._remindLabel(d)}` : ""}`;
      main.appendChild(title); main.appendChild(meta);
      const actions = document.createElement("div"); actions.className = "item-actions";
      const btnTask = document.createElement("button");
      btnTask.className = "btn-secondary btn-to-task";
      btnTask.innerHTML = `<i class="icon icon-tasks"></i> Do Zadań`;
      const btnEdit = document.createElement("button");
      btnEdit.className = "btn-secondary btn-edit";
      btnEdit.innerHTML = `<i class="icon icon-edit"></i> Edytuj`;
      const btnDel = document.createElement("button");
      btnDel.className = "btn-danger-outline btn-delete";
      btnDel.innerHTML = `<i class="icon icon-delete"></i> Usuń`;
      actions.append(btnTask, btnEdit, btnDel);
      const ph2 = document.createElement("span");
      li.append(ph, main, actions, ph2);
      ul.appendChild(li);
    }
    if (!ul.children.length) {
      const info = document.createElement("div");
      info.className = "muted small";
      info.textContent = "Brak wydarzeń w tej kategorii.";
      ul.appendChild(info);
    }
  },
  renderCalendar() {
    const grid = qs("#calendar"); if (!grid) return;
    try {
      const any = (window).CalendarBasic;
      if (any?.cursor instanceof Date) this._cursor = new Date(any.cursor);
    } catch {}
    const current = new Date(this._cursor);
    const y = current.getFullYear(), m = current.getMonth();
    qs("#cal-current").textContent = current.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
    grid.innerHTML = "";
    const first = new Date(y, m, 1);
    const startDay = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let i=0; i<startDay; i++) {
      const cell = document.createElement("div");
      cell.className = "cal-pad";
      grid.appendChild(cell);
    }
    const eventsAll = this._getFiltered();
    for (let d=1; d<=daysInMonth; d++) {
      const cell = document.createElement("div");
      const dateStr = new Date(y, m, d).toISOString().slice(0,10);
      cell.dataset.date = dateStr;
      cell.textContent = d.toString();
      if (dateStr === todayISO()) cell.classList.add("cal-today");
      const dayEvents = eventsAll.filter(ev => ev.date === dateStr);
      if (dayEvents.length) {
        const wrap = document.createElement("div");
        wrap.style.marginTop = "4px";
        wrap.style.display = "grid"; wrap.style.gap = "2px";
        dayEvents.slice(0,3).forEach(ev => {
          const dot = document.createElement("div");
          dot.className = "small";
          dot.style.whiteSpace = "nowrap";
          dot.style.overflow = "hidden";
          dot.style.textOverflow = "ellipsis";
          dot.innerHTML = `<span class="badge">${ev.category || "inne"}</span> ${ev.title || ""}`;
          wrap.appendChild(dot);
        });
        if (dayEvents.length > 3) {
          const more = document.createElement("div");
          more.className = "small muted"; more.textContent = `+${dayEvents.length - 3} więcej`;
          wrap.appendChild(more);
        }
        cell.appendChild(document.createElement("br"));
        cell.appendChild(wrap);
      }
      grid.appendChild(cell);
    }
  },
  ensureEditor() {
    let dlg = qs("#dialog-date");
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.id = "dialog-date";
    dlg.className = "dialog";
    dlg.innerHTML = `
      <form class="dialog-content" method="dialog">
        <h3><i class="icon icon-calendar"></i> Wydarzenie</h3>
        <label>Tytuł
          <input id="dt-title" type="text" required />
        </label>
        <div class="grid-2">
          <label>Data
            <input id="dt-date" type="date" />
          </label>
          <label>Kategoria
            <select id="dt-category">
              <option value="urodziny">urodziny</option>
              <option value="rocznice">rocznice</option>
              <option value="inne" selected>inne</option>
            </select>
          </label>
        </div>
        <label>Notatki
          <textarea id="dt-notes" rows="3"></textarea>
        </label>
        <div class="grid-2">
          <label class="small"><input id="dt-remind" type="checkbox" /> Przypomnienie</label>
          <label>Dni wcześniej
            <select id="dt-remind-offset">
              <option value="0">W dniu wydarzenia</option>
              <option value="1">1 dzień wcześniej</option>
              <option value="2">2 dni wcześniej</option>
              <option value="3">3 dni wcześniej</option>
              <option value="7">7 dni wcześniej</option>
            </select>
          </label>
        </div>
        <menu class="dialog-actions">
          <button type="button" id="dt-to-task" class="btn-secondary"><i class="icon icon-tasks"></i> Do Zadań</button>
          <span style="flex:1 1 auto;"></span>
          <button type="button" id="dt-delete" class="btn-danger-outline"><i class="icon icon-delete"></i> Usuń</button>
          <button type="button" id="dt-cancel" class="btn-ghost">Anuluj</button>
          <button type="button" id="dt-save" class="btn-primary"><i class="icon icon-check"></i> Zapisz</button>
        </menu>
      </form>
    `;
    document.body.appendChild(dlg);
    qs("#dt-cancel", dlg)?.addEventListener("click", () => dlg.close());
    qs("#dt-save", dlg)?.addEventListener("click", () => this._saveFromEditor());
    qs("#dt-delete", dlg)?.addEventListener("click", () => this._deleteFromEditor());
    qs("#dt-to-task", dlg)?.addEventListener("click", () => this._openToTaskDialog(this._editingId));
    return dlg;
  },
  openEditor(id = null, preset = {}) {
    this._editingId = id;
    const dlg = this.ensureEditor();
    let rec = null;
    if (id) rec = this._getAll().find(x => x.id === id);
    qs("#dt-title").value = rec?.title || "";
    qs("#dt-date").value = rec?.date || preset.date || todayISO();
    qs("#dt-category").value = (rec?.category || "inne").toLowerCase();
    qs("#dt-notes").value = rec?.notes || "";
    qs("#dt-remind").checked = !!rec?.remind;
    qs("#dt-remind-offset").value = String(rec?.remind_offset_days ?? 0);
    qs("#dt-delete").style.display = id ? "" : "none";
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  },
  _collectFromEditor() {
    const title = qs("#dt-title").value.trim();
    const date = qs("#dt-date").value || todayISO();
    const category = (qs("#dt-category").value || "inne").toLowerCase();
    const notes = qs("#dt-notes").value || "";
    const remind = !!qs("#dt-remind").checked;
    const offset = parseInt(qs("#dt-remind-offset").value || "0", 10);
    if (!title) { toast("Uzupełnij tytuł wydarzenia."); return null; }
    const cur = this._editingId ? this._getAll().find(x => x.id === this._editingId) : null;
    return {
      id: this._editingId || uuid(),
      title, date, category, notes,
      remind, remind_offset_days: Math.max(0, offset),
      updated_at: Date.now(),
      created_at: cur?.created_at || Date.now()
    };
  },
  _saveFromEditor() {
    const rec = this._collectFromEditor();
    if (!rec) return;
    Storage.upsert("dates", rec);
    toast("Wydarzenie zapisano.");
    qs("#dialog-date")?.close();
    this.renderList(); this.renderCalendar();
  },
  _deleteFromEditor() {
    if (!this._editingId) { qs("#dialog-date")?.close(); return; }
    if (!confirm("Czy usunąć wydarzenie?")) return;
    Storage.remove("dates", this._editingId, { permanent: false });
    toast("Wydarzenie przeniesiono do kosza.");
    qs("#dialog-date")?.close();
    this.renderList(); this.renderCalendar();
  },
  remove(id) {
    if (!id) return;
    if (!confirm("Czy usunąć wydarzenie?")) return;
    Storage.remove("dates", id, { permanent: false });
    toast("Wydarzenie przeniesiono do kosza.");
    this.renderList(); this.renderCalendar();
  },
  _ensureToTaskDialog() {
    let dlg = qs("#dialog-date-to-task");
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.id = "dialog-date-to-task";
    dlg.className = "dialog";
    dlg.innerHTML = `
      <form class="dialog-content" method="dialog">
        <h3><i class="icon icon-tasks"></i> Utwórz zadanie przypominające</h3>
        <div class="grid-2">
          <label>Projekt
            <select id="dtt-project"></select>
          </label>
          <label>Priorytet
            <select id="dtt-priority">
              <option value="low">Niski</option>
              <option value="medium" selected>Średni</option>
              <option value="high">Wysoki</option>
            </select>
          </label>
        </div>
        <label>Godzina przypomnienia
          <input id="dtt-time" type="time" value="09:00"/>
        </label>
        <div class="small muted">Zadanie zostanie utworzone na datę wydarzenia lub odpowiednio wcześniej (zgodnie z ustawieniem w wydarzeniu).</div>
        <menu class="dialog-actions">
          <button value="cancel" class="btn-ghost">Anuluj</button>
          <button id="dtt-create" class="btn-primary"><i class="icon icon-check"></i> Utwórz zadanie</button>
        </menu>
      </form>
    `;
    document.body.appendChild(dlg);
    qs("#dtt-create", dlg)?.addEventListener("click", (e) => { e.preventDefault(); this._confirmToTask(); });
    return dlg;
  },
  _openToTaskDialog(eventId) {
    const rec = this._getAll().find(x => x.id === eventId);
    if (!rec) { toast("Nie znaleziono wydarzenia."); return; }
    this._editingId = eventId;
    const dlg = this._ensureToTaskDialog();
    const sel = qs("#dtt-project", dlg); sel.innerHTML = "";
    const snap = Storage.getSnapshot?.() || {};
    let projects = Array.isArray(snap.task_projects) ? snap.task_projects.slice() : [];
    if (!projects.length) {
      const pid = uuid();
      const def = { id: pid, name: "Ogólne", color: "green", updated_at: Date.now() };
      try { Storage.upsert("task_projects", def); } catch {}
      projects = [def];
    }
    projects.forEach(p => {
      const op = document.createElement("option"); op.value = p.id; op.textContent = p.name || "Projekt";
      sel.appendChild(op);
    });
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  },
  _confirmToTask() {
    const rec = this._getAll().find(x => x.id === this._editingId);
    if (!rec) return;
    const projectId = qs("#dtt-project")?.value || null;
    const prio = qs("#dtt-priority")?.value || "medium";
    const time = qs("#dtt-time")?.value || "09:00";
    const baseDate = new Date(rec.date);
    if (rec.remind && Number.isFinite(+rec.remind_offset_days) && rec.remind_offset_days > 0) {
      baseDate.setDate(baseDate.getDate() - rec.remind_offset_days);
    }
    const dueIso = `${baseDate.toISOString().slice(0,10)}T${time}`;
    const task = {
      id: uuid(), project_id: projectId,
      title: rec.title || "Przypomnienie",
      notes: rec.notes || `Wydarzenie: ${rec.title} (${fmt.format(new Date(rec.date))})`,
      priority: prio, due: dueIso, category: "ważne-daty",
      done: false, subtasks: [],
      updated_at: Date.now()
    };
    try {
      Storage.upsert("tasks", task);
      toast("Utworzono zadanie przypominające.");
      qs("#dialog-date-to-task")?.close();
      this._bus.emit?.("list:updated");
    } catch {
      toast("Nie udało się utworzyć zadania.");
    }
  },
  _remindLabel(d) {
    const off = Number(d?.remind_offset_days || 0);
    return off === 0 ? "w dniu wydarzenia" : `${off} dni wcześniej`;
  },
  _toggleSectionReminders(on) {
    const master = qs("#notif-dates");
    if (master) {
      master.checked = !!on;
      master.dispatchEvent(new Event("change", { bubbles: true }));
      toast(on ? "Włączono przypomnienia dla ważnych dat." : "Wyłączono przypomnienia dla ważnych dat.");
    } else {
      try {
        const prefs = JSON.parse(localStorage.getItem("lista:notifs:prefs") || "{}");
        prefs.channels = prefs.channels || {};
        prefs.channels.dates = !!on;
        localStorage.setItem("lista:notifs:prefs", JSON.stringify(prefs));
      } catch {}
      toast(on ? "Przypomnienia włączone." : "Przypomnienia wyłączone.");
    }
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Dates.init(window.Bus));
} else {
  Dates.init(window.Bus);
}
export default Dates;