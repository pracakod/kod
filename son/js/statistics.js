"use strict";
import { Storage } from "./storage.js";
const qs = (s, r = document) => r.querySelector(s);
const PLN = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const fmtDate = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" });
function chartPalette(n = 6) {
  const styles = getComputedStyle(document.documentElement);
  const vars = ["--chart-1","--chart-2","--chart-3","--chart-4","--chart-5","--chart-6"];
  const base = vars.map(v => styles.getPropertyValue(v)?.trim()).filter(Boolean);
  if (n <= base.length) return base.slice(0, n);
  const extra = [];
  for (let i = 0; i < n - base.length; i++) {
    const hue = Math.floor((i / (n - base.length)) * 360);
    extra.push(`hsl(${hue} 65% 55%)`);
  }
  return base.concat(extra);
}
function toStartOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function toEndOfDay(d)   { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function parseISODate(s) {
  if (!s) return null;
  const t = typeof s === "string" ? s : String(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(`${t}T00:00:00`);
  const d = new Date(t);
  return isNaN(+d) ? null : d;
}
function rangeForPreset(preset) {
  const now = new Date();
  switch (preset) {
    case "day": {
      const from = toStartOfDay(now); const to = toEndOfDay(now);
      return { from, to };
    }
    case "week": {
      const t = new Date(now);
      const day = (t.getDay() + 6) % 7;
      t.setDate(t.getDate() - day);
      const from = toStartOfDay(t);
      const to = toEndOfDay(new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6));
      return { from, to };
    }
    case "month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = toEndOfDay(new Date(now.getFullYear(), now.getMonth()+1, 0));
      return { from, to };
    }
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      const from = new Date(now.getFullYear(), q*3, 1);
      const to = toEndOfDay(new Date(now.getFullYear(), q*3 + 3, 0));
      return { from, to };
    }
    case "year": {
      const from = new Date(now.getFullYear(), 0, 1);
      const to = toEndOfDay(new Date(now.getFullYear(), 12, 0));
      return { from, to };
    }
    default: {
      const from = toStartOfDay(now);
      const to = toEndOfDay(now);
      return { from, to };
    }
  }
}
function inRange(ts, from, to) {
  if (!ts) return false;
  const t = typeof ts === "number" ? ts : +ts;
  return t >= +from && t <= +to;
}
const Chart = {
  setup(canvas) {
    if (!canvas) return null;
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    canvas.width = Math.floor(cssW * ratio);
    canvas.height = Math.floor(cssH * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text") || "#222";
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--border") || "#ccc";
    return { ctx, width: cssW, height: cssH };
  },
  message(canvas, text) {
    const s = this.setup(canvas); if (!s) return;
    const { ctx, width, height } = s;
    ctx.fillStyle = "#888";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width/2, height/2);
  },
  bar(canvas, labels, values, options = {}) {
    const s = this.setup(canvas); if (!s) return;
    const { ctx, width, height } = s;
    const colors = options.colors || chartPalette(values.length);
    const margin = { top: 16, right: 12, bottom: 28, left: 32 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const maxVal = Math.max(1, ...values);
    const step = values.length ? Math.max(1, Math.floor(w / values.length)) : 1;
    const barW = Math.max(10, Math.min(42, step * 0.66));
    const gap = Math.max(6, step - barW);
    ctx.strokeStyle = "rgba(0,0,0,.08)";
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i=0;i<=gridLines;i++) {
      const y = margin.top + h - (i/gridLines)*h;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
    }
    values.forEach((v, i) => {
      const x = margin.left + i * (barW + gap);
      const y = margin.top + h - (v / maxVal) * h;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(x, y, barW, (v / maxVal) * h);
      ctx.save();
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted") || "#666";
      ctx.textAlign = "center";
      ctx.translate(x + barW/2, height - 6);
      ctx.rotate(-Math.PI/12);
      const label = String(labels[i] ?? "");
      ctx.fillText(label.length > 10 ? label.slice(0,10) + "…" : label, 0, 0);
      ctx.restore();
    });
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted") || "#666";
    ctx.textAlign = "right";
    ctx.fillText(Math.round(maxVal).toString(), margin.left - 4, margin.top + 10);
    ctx.fillText("0", margin.left - 4, margin.top + h);
  },
  donut(canvas, labels, values, options = {}) {
    const s = this.setup(canvas); if (!s) return;
    const { ctx, width, height } = s;
    const total = values.reduce((a,b)=>a+b,0);
    if (!total) return this.message(canvas, "Brak danych w wybranym okresie");
    const colors = options.colors || chartPalette(values.length);
    const cx = width/2, cy = height/2;
    const r = Math.min(width, height) * 0.38;
    const inner = r * 0.58;
    let start = -Math.PI/2;
    values.forEach((v, i) => {
      const ang = (v/total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.fillStyle = colors[i % colors.length];
      ctx.arc(cx, cy, r, start, start + ang);
      ctx.lineTo(cx, cy);
      ctx.fill();
      start += ang;
    });
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text") || "#222";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.fillText(PLN.format(total), cx, cy);
  }
};
function computeStats(snapshot, from, to) {
  const data = {
    range: { from, to },
    totals: {
      receipts: 0,
      planned: 0,
      planned_open: 0
    },
    expensesByCategory: [],
    storesTotals: [],
    timeOfDay: [],
    productivityByDay: [],
    comparisons: {
      prevPeriod: {
        receipts: { current: 0, prev: 0, changePct: 0 },
        productivity: { current: 0, prev: 0, changePct: 0 }
      },
      forecastNext: {
        receipts: 0,
        productivity: 0
      }
    },
    top: {
      stores: [],
      categories: []
    }
  };
  const receipts = (snapshot.receipts || []).filter(r => {
    const ts = r.date ? +toStartOfDay(parseISODate(r.date)) : (r.updated_at || r.created_at || 0);
    return inRange(ts, from, to);
  });
  data.totals.receipts = receipts.reduce((s, r) => s + Number(r.total || 0), 0);
  const catMap = new Map();
  for (const r of receipts) {
    const total = Number(r.total || 0);
    const raw = (r.tags || "").trim();
    const tags = raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : ["inne"];
    const share = tags.length ? total / tags.length : 0;
    for (const t of tags) {
      catMap.set(t, (catMap.get(t) || 0) + share);
    }
  }
  data.expensesByCategory = Array.from(catMap.entries()).map(([label, value]) => ({ label, value }))
    .sort((a,b)=>b.value-a.value);
  const storeMap = new Map();
  for (const r of receipts) {
    const name = (r.store || "Inne").trim() || "Inne";
    storeMap.set(name, (storeMap.get(name) || 0) + Number(r.total || 0));
  }
  data.storesTotals = Array.from(storeMap.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a,b)=>b.value-a.value);
  const tod = { Rano: 0, "Popołudnie": 0, "Wieczór": 0, "Noc": 0 };
  for (const r of receipts) {
    const ts = r.updated_at || r.created_at || +toStartOfDay(parseISODate(r.date));
    const h = new Date(ts).getHours();
    const bucket = (h >= 5 && h < 12) ? "Rano" : (h >= 12 && h < 17) ? "Popołudnie" : (h >= 17 && h < 22) ? "Wieczór" : "Noc";
    tod[bucket] += 1;
  }
  data.timeOfDay = Object.entries(tod).map(([label, value]) => ({ label, value }));
  const shopItems = (snapshot.shopping_items || []).filter(i => {
    const ts = i.updated_at || i.created_at || 0;
    return inRange(ts, from, to);
  });
  const plannedAll = shopItems.reduce((s, i) => s + Number(i.cost || 0), 0);
  const plannedOpen = shopItems.filter(i => !i.bought).reduce((s, i) => s + Number(i.cost || 0), 0);
  data.totals.planned = plannedAll;
  data.totals.planned_open = plannedOpen;
  const days = [];
  const dayMap = new Map();
  (snapshot.tasks || []).forEach(t => {
    const ts = t.updated_at || 0;
    if (t.done && inRange(ts, from, to)) {
      const d = new Date(ts).toISOString().slice(0,10);
      dayMap.set(d, (dayMap.get(d) || 0) + 1);
    }
  });
  (snapshot.checklist_items || []).forEach(i => {
    const ts = i.updated_at || 0;
    if (i.done && inRange(ts, from, to)) {
      const d = new Date(ts).toISOString().slice(0,10);
      dayMap.set(d, (dayMap.get(d) || 0) + 1);
    }
  });
  const daysCount = Math.ceil((+to - +from) / (24*60*60*1000)) + 1;
  for (let k=0; k<daysCount; k++) {
    const d = new Date(+from + k * 24*60*60*1000).toISOString().slice(0,10);
    days.push({ label: d, value: dayMap.get(d) || 0 });
  }
  data.productivityByDay = days;
  const periodMs = (+to - +from) + 1;
  const prevFrom = new Date(+from - periodMs);
  const prevTo = new Date(+from - 1);
  const sumReceiptsIn = (a, b) => (snapshot.receipts || [])
    .filter(r => {
      const ts = r.date ? +toStartOfDay(parseISODate(r.date)) : (r.updated_at || r.created_at || 0);
      return inRange(ts, a, b);
    })
    .reduce((s, r) => s + Number(r.total || 0), 0);
  const countProductivityIn = (a, b) => {
    let c = 0;
    (snapshot.tasks || []).forEach(t => { const ts = t.updated_at || 0; if (t.done && inRange(ts, a, b)) c++; });
    (snapshot.checklist_items || []).forEach(i => { const ts = i.updated_at || 0; if (i.done && inRange(ts, a, b)) c++; });
    return c;
  };
  const curR = data.totals.receipts;
  const prevR = sumReceiptsIn(prevFrom, prevTo);
  const curP = days.reduce((s,x)=>s+x.value,0);
  const prevP = countProductivityIn(prevFrom, prevTo);
  const pct = (cur, prev) => {
    if (!prev && !cur) return 0;
    if (!prev) return 100;
    return Math.round(((cur - prev) / prev) * 100);
    };
  data.comparisons.prevPeriod.receipts = { current: curR, prev: prevR, changePct: pct(curR, prevR) };
  data.comparisons.prevPeriod.productivity = { current: curP, prev: prevP, changePct: pct(curP, prevP) };
  const daysLen = Math.max(1, Math.round(periodMs / (24*60*60*1000)));
  const avgDailySpend = curR / daysLen;
  const avgDailyProd = curP / daysLen;
  data.comparisons.forecastNext.receipts = Math.round(avgDailySpend * daysLen);
  data.comparisons.forecastNext.productivity = Math.round(avgDailyProd * daysLen);
  data.top.stores = data.storesTotals.slice(0, 5).map(x => ({ name: x.label, total: x.value }));
  data.top.categories = data.expensesByCategory.slice(0, 5).map(x => ({ name: x.label, total: x.value }));
  return data;
}
function exportReportJSON(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `lista-raport-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function exportReportCSV(report) {
  const rows = [];
  rows.push(["Sekcja","Nazwa","Wartość"].join(";"));
  report.expensesByCategory.forEach(c => rows.push(["Kategoria", c.label, c.value.toFixed(2)].join(";")));
  report.storesTotals.forEach(s => rows.push(["Sklep", s.label, s.value.toFixed(2)].join(";")));
  report.productivityByDay.forEach(d => rows.push(["Produktywność", d.label, d.value].join(";")));
  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `lista-raport-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
export const Statistics = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  _lastReport: null,
  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;
    await Storage.init?.();
    qs("#stats-range")?.addEventListener("change", () => {
      const rng = qs("#stats-range").value;
      if (rng !== "custom") {
        const { from, to } = rangeForPreset(rng);
        qs("#stats-from").value = toStartOfDay(from).toISOString().slice(0,10);
        qs("#stats-to").value = toStartOfDay(to).toISOString().slice(0,10);
      }
    });
    qs("#btn-stats-refresh")?.addEventListener("click", () => this.refresh());
    qs("#btn-export-report")?.addEventListener("click", () => {
      if (!this._lastReport) return;
      const fmt = prompt("Podaj format eksportu: JSON lub CSV", "JSON");
      if (fmt && fmt.toLowerCase() === "csv") exportReportCSV(this._lastReport);
      else exportReportJSON(this._lastReport);
    });
    this._bus.on?.("stats:updated", () => this.refresh());
    this._bus.on?.("storage:synced", () => this.refresh());
    this._bus.on?.("list:updated", () => this.refresh());
    const def = rangeForPreset(qs("#stats-range")?.value || "month");
    qs("#stats-from").value = toStartOfDay(def.from).toISOString().slice(0,10);
    qs("#stats-to").value = toStartOfDay(def.to).toISOString().slice(0,10);
    this.refresh();
  },
  _getSelectedRange() {
    const mode = qs("#stats-range")?.value || "month";
    if (mode !== "custom") {
      return rangeForPreset(mode);
    }
    const fromStr = qs("#stats-from")?.value;
    const toStr = qs("#stats-to")?.value;
    const from = toStartOfDay(parseISODate(fromStr) || new Date());
    const to = toEndOfDay(parseISODate(toStr) || new Date());
    return { from, to };
  },
  refresh() {
    const { from, to } = this._getSelectedRange();
    const snap = Storage.getSnapshot?.() || {};
    const report = computeStats(snap, from, to);
    this._lastReport = this._serializeForExport(report);
    this._render(report);
  },
  _serializeForExport(r) {
    return {
      zakres: { od: r.range.from.toISOString(), do: r.range.to.toISOString() },
      podsumowanie: {
        wydatki_paragony: r.totals.receipts,
        planowane_wydatki: r.totals.planned,
        planowane_otwarte: r.totals.planned_open,
        oszczednosc_szacowana: r.totals.planned - r.totals.receipts
      },
      kategorie: r.expensesByCategory,
      sklepy: r.storesTotals,
      pory_dnia: r.timeOfDay,
      produktywnosc_dzienna: r.productivityByDay,
      porownanie_okresu: r.comparisons.prevPeriod,
      prognoza_nastepnego: r.comparisons.forecastNext,
      top: r.top
    };
  },
  _render(r) {
    const c1 = qs("#chart-expenses");
    if (c1) {
      const labels = r.expensesByCategory.map(x => x.label);
      const values = r.expensesByCategory.map(x => Math.round(x.value));
      if (!values.length || values.every(v => v === 0)) {
        Chart.message(c1, "Brak danych w wybranym okresie");
      } else {
        Chart.donut(c1, labels, values, { colors: chartPalette(values.length) });
      }
    }
    const c2 = qs("#chart-habits");
    if (c2) {
      const topStores = r.storesTotals.slice(0, 5);
      const labels = topStores.map(x => x.label).concat(r.timeOfDay.map(x => x.label));
      const values = topStores.map(x => Math.round(x.value)).concat(r.timeOfDay.map(x => x.value));
      if (!values.length || values.every(v => v === 0)) {
        Chart.message(c2, "Brak danych w wybranym okresie");
      } else {
        Chart.bar(c2, labels, values, { colors: chartPalette(values.length) });
      }
    }
    const c3 = qs("#chart-productivity");
    if (c3) {
      const labels = r.productivityByDay.map(x => x.label.slice(5));
      const values = r.productivityByDay.map(x => x.value);
      if (!values.length || values.every(v => v === 0)) {
        Chart.message(c3, "Brak danych w wybranym okresie");
      } else {
        Chart.bar(c3, labels, values, { colors: chartPalette(6) });
      }
    }
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Statistics.init(window.Bus));
} else {
  Statistics.init(window.Bus);
}
export default Statistics;