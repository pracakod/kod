"use strict";
import { Storage } from "./storage.js";
const TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const fmtDate = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" });
const TYPE_LABEL = {
  checklist_lists: "Checklista — lista",
  checklist_items: "Checklista — pozycja",
  task_projects: "Zadania — projekt",
  tasks: "Zadania — zadanie",
  shopping_lists: "Zakupy — lista",
  shopping_items: "Zakupy — pozycja",
  loyalty_cards: "Karta lojalnościowa",
  receipts: "Paragon",
  dates: "Ważna data"
};
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
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
function titleFromData(data, type) {
  if (!data) return "(bez nazwy)";
  if (typeof data.name === "string" && data.name.trim()) return data.name.trim();
  if (typeof data.title === "string" && data.title.trim()) return data.title.trim();
  if (type === "receipts") {
    const store = data.store || "Paragon";
    const d = data.date ? fmtDate.format(new Date(data.date)) : "";
    return d ? `${store} (${d})` : store;
  }
  if (type === "dates") {
    const t = data.title || "Wydarzenie";
    const d = data.date ? fmtDate.format(new Date(data.date)) : "";
    return d ? `${t} (${d})` : t;
  }
  return "(bez nazwy)";
}
function daysLeftLabel(deletedAt) {
  const now = Date.now();
  const end = (deletedAt || 0) + TRASH_TTL_MS;
  const ms = end - now;
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  const d = Math.max(0, days);
  const plural = (n) => (n === 1 ? "dzień" : (n >= 2 && n <= 4) ? "dni" : "dni");
  return `Pozostało: ${d} ${plural(d)}`;
}
export const Archive = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  _filter: "",
  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;
    await Storage.init?.();
    qs("#archive-filter-type")?.addEventListener("change", (e) => {
      this._filter = e.target.value || "";
      this.render();
    });
    qs("#archive-list")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (!id) return;
      if (act === "restore") this.restoreFromArchive(id);
      if (act === "delete") this.deleteArchivePermanent(id);
    });
    qs("#trash-list")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (!id) return;
      if (act === "restore") this.restoreFromTrash(id);
      if (act === "delete") this.deleteTrashPermanent(id);
    });
    this._bus.on?.("storage:synced", () => this.render());
    this._bus.on?.("list:updated", () => this.render());
    setInterval(() => this._refreshTrashCountdowns(), 60000);
    this.render();
  },
  async addToArchive(entity, id) {
    try {
      await Storage.archive(entity, id);
      toast("Przeniesiono do archiwum.");
      this.render();
    } catch (e) {
      console.warn("Nie udało się zarchiwizować:", e);
      toast("Operacja archiwizacji nie powiodła się.");
    }
  },
  render() {
    this.renderArchive();
    this.renderTrash();
  },
  renderArchive() {
    const ul = qs("#archive-list");
    if (!ul) return;
    const snap = Storage.getSnapshot();
    const arr = (snap.archive || []).slice().sort((a, b) => (b.archived_at || 0) - (a.archived_at || 0));
    const typeAllow = (() => {
      if (this._filter === "checklist") return new Set(["checklist_lists"]);
      if (this._filter === "tasks") return new Set(["task_projects"]);
      if (this._filter === "shopping") return new Set(["shopping_lists"]);
      return null;
    })();
    ul.innerHTML = "";
    for (const rec of arr) {
      if (typeAllow && !typeAllow.has(rec.type)) continue;
      const li = document.createElement("li");
      li.className = "item";
      li.dataset.id = rec.id;
      const ph1 = document.createElement("span");
      const main = document.createElement("div");
      main.className = "item-main";
      const title = document.createElement("div");
      title.className = "item-title";
      title.textContent = titleFromData(rec.data, rec.type);
      const meta = document.createElement("div");
      meta.className = "item-meta small muted";
      const typeLabel = TYPE_LABEL[rec.type] || rec.type;
      const arch = rec.archived_at ? fmtDate.format(new Date(rec.archived_at)) : "—";
      meta.textContent = `${typeLabel} • Zarchiwizowano: ${arch}`;
      main.appendChild(title);
      main.appendChild(meta);
      const actionsWrap = document.createElement("div");
      actionsWrap.className = "item-actions";
      const btnRestore = document.createElement("button");
      btnRestore.className = "btn-secondary";
      btnRestore.dataset.act = "restore";
      btnRestore.dataset.id = rec.id;
      btnRestore.innerHTML = `<i class="icon icon-archive"></i> Przywróć`;
      const btnDelete = document.createElement("button");
      btnDelete.className = "btn-danger-outline";
      btnDelete.dataset.act = "delete";
      btnDelete.dataset.id = rec.id;
      btnDelete.innerHTML = `<i class="icon icon-delete"></i> Usuń trwale`;
      actionsWrap.appendChild(btnRestore);
      actionsWrap.appendChild(btnDelete);
      const ph2 = document.createElement("span");
      li.appendChild(ph1);
      li.appendChild(main);
      li.appendChild(actionsWrap);
      li.appendChild(ph2);
      ul.appendChild(li);
    }
    if (!ul.children.length) {
      const info = document.createElement("div");
      info.className = "muted small";
      info.textContent = "Brak pozycji w archiwum dla wybranego filtra.";
      ul.appendChild(info);
    }
  },
  renderTrash() {
    const ul = qs("#trash-list");
    if (!ul) return;
    const snap = Storage.getSnapshot();
    const arr = (snap.trash || []).slice().sort((a, b) => (b.deleted_at || 0) - (a.deleted_at || 0));
    ul.innerHTML = "";
    for (const rec of arr) {
      const li = document.createElement("li");
      li.className = "item";
      li.dataset.id = rec.id;
      const ph1 = document.createElement("span");
      const main = document.createElement("div");
      main.className = "item-main";
      const title = document.createElement("div");
      title.className = "item-title";
      title.textContent = titleFromData(rec.data, rec.type);
      const meta = document.createElement("div");
      meta.className = "item-meta small muted";
      const typeLabel = TYPE_LABEL[rec.type] || rec.type;
      const del = rec.deleted_at ? fmtDate.format(new Date(rec.deleted_at)) : "—";
      const left = daysLeftLabel(rec.deleted_at || 0);
      meta.textContent = `${typeLabel} • Usunięto: ${del} • ${left}`;
      main.appendChild(title);
      main.appendChild(meta);
      const actionsWrap = document.createElement("div");
      actionsWrap.className = "item-actions";
      const btnRestore = document.createElement("button");
      btnRestore.className = "btn-secondary";
      btnRestore.dataset.act = "restore";
      btnRestore.dataset.id = rec.id;
      btnRestore.innerHTML = `<i class="icon icon-archive"></i> Przywróć`;
      const btnDelete = document.createElement("button");
      btnDelete.className = "btn-danger-outline";
      btnDelete.dataset.act = "delete";
      btnDelete.dataset.id = rec.id;
      btnDelete.innerHTML = `<i class="icon icon-delete"></i> Usuń trwale`;
      actionsWrap.appendChild(btnRestore);
      actionsWrap.appendChild(btnDelete);
      const ph2 = document.createElement("span");
      li.appendChild(ph1);
      li.appendChild(main);
      li.appendChild(actionsWrap);
      li.appendChild(ph2);
      ul.appendChild(li);
    }
    if (!ul.children.length) {
      const info = document.createElement("div");
      info.className = "muted small";
      info.textContent = "Kosz jest pusty.";
      ul.appendChild(info);
    }
  },
  async restoreFromArchive(archiveId) {
    try {
      const ok = await Storage.restoreFromArchive(archiveId);
      if (ok) {
        toast("Przywrócono z archiwum.");
        this.render();
      } else {
        toast("Nie udało się przywrócić.");
      }
    } catch (e) {
      console.warn("Błąd przywracania z archiwum:", e);
      toast("Operacja nie powiodła się.");
    }
  },
  async deleteArchivePermanent(archiveId) {
    try {
      if (!confirm("Czy na pewno trwale usunąć pozycję z archiwum?")) return;
      const ok = await Storage.remove("archive", archiveId, { permanent: true });
      if (ok) {
        toast("Usunięto trwale z archiwum.");
        this.render();
      } else {
        toast("Nie udało się usunąć.");
      }
    } catch (e) {
      console.warn("Błąd trwałego usuwania z archiwum:", e);
      toast("Operacja nie powiodła się.");
    }
  },
  async restoreFromTrash(trashId) {
    try {
      const ok = await Storage.restoreFromTrash(trashId);
      if (ok) {
        toast("Przywrócono z kosza.");
        this.render();
      } else {
        toast("Nie udało się przywrócić.");
      }
    } catch (e) {
      console.warn("Błąd przywracania z kosza:", e);
      toast("Operacja nie powiodła się.");
    }
  },
  async deleteTrashPermanent(trashId) {
    try {
      if (!confirm("Czy na pewno trwale usunąć pozycję z kosza?")) return;
      const ok = await Storage.remove("trash", trashId, { permanent: true });
      if (ok) {
        toast("Usunięto trwale z kosza.");
        this.render();
      } else {
        toast("Nie udało się usunąć.");
      }
    } catch (e) {
      console.warn("Błąd trwałego usuwania z kosza:", e);
      toast("Operacja nie powiodła się.");
    }
  },
  _refreshTrashCountdowns() {
    const snap = Storage.getSnapshot();
    const byId = new Map((snap.trash || []).map(t => [t.id, t]));
    qsa("#trash-list > .item").forEach(li => {
      const id = li.dataset.id;
      const rec = byId.get(id);
      if (!rec) return;
      const meta = li.querySelector(".item-meta");
      if (!meta) return;
      const typeLabel = TYPE_LABEL[rec.type] || rec.type;
      const del = rec.deleted_at ? fmtDate.format(new Date(rec.deleted_at)) : "—";
      meta.textContent = `${typeLabel} • Usunięto: ${del} • ${daysLeftLabel(rec.deleted_at || 0)}`;
    });
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Archive.init(window.Bus));
} else {
  Archive.init(window.Bus);
}
export default Archive;