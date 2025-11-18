"use strict";
import { Storage } from "./storage.js";
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const PLN = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const fmt = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" });
let _tesseractReady = false;
async function ensureTesseract() {
  if (_tesseractReady && window.Tesseract) return true;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.async = true;
    s.onload = () => res(true);
    s.onerror = () => rej(new Error("Nie można załadować biblioteki OCR."));
    document.head.appendChild(s);
  });
  _tesseractReady = !!window.Tesseract;
  return _tesseractReady;
}
function toast(text, timeout = 3200) {
  const sb = qs("#snackbar");
  if (!sb) return;
  qs("#snackbar-text").textContent = text;
  const act = qs("#snackbar-action"); if (act) act.hidden = true;
  sb.hidden = false; sb.classList.add("show");
  setTimeout(() => { sb.hidden = true; sb.classList.remove("show"); }, timeout);
}
function readFile(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}
async function compressImageDataURL(dataURL, maxW = 1400, quality = 0.88) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}
function parseOCRTextToFields(text) {
  const out = { store: "", date: "", total: 0 };
  if (!text) return out;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  out.store = lines[0] || "";
  const dateMatch = text.match(/(\d{2}[.\-\/]\d{2}[.\-\/]\d{4})|(\d{4}[.\-\/]\d{2}[.\-\/]\d{2})/);
  if (dateMatch) {
    const raw = dateMatch[0].replace(/[.\/]/g, "-");
    const [a, b, c] = raw.split("-");
    out.date = a.length === 4 ? `${a}-${b}-${c}` : `${c}-${b}-${a}`;
  }
  const amounts = Array.from(text.matchAll(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/g)).map(m => m[0]);
  const toFloat = (s) => parseFloat(s.replace(/\./g, "").replace(",", "."));
  if (amounts.length) out.total = amounts.map(toFloat).reduce((a, b) => Math.max(a, b), 0);
  return out;
}
function renderList() {
  const ul = qs("#receipts-list");
  if (!ul) return;
  const q = (qs("#receipt-search")?.value || "").trim().toLowerCase();
  const snap = Storage.getSnapshot();
  const arr = (snap.receipts || [])
    .slice()
    .sort((a,b) => new Date(b.date || b.updated_at || 0) - new Date(a.date || a.updated_at || 0));
  ul.innerHTML = "";
  const filtered = arr.filter(r => {
    if (!q) return true;
    const hay = [
      r.store || "",
      r.date || "",
      String(r.total ?? "")
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });
  for (const r of filtered) {
    const li = document.createElement("li");
    li.className = "item";
    li.dataset.id = r.id;
    const ph1 = document.createElement("span");
    const main = document.createElement("div");
    main.className = "item-main";
    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = r.store || "Paragon";
    const meta = document.createElement("div");
    meta.className = "item-meta small muted";
    const dateStr = r.date ? fmt.format(new Date(r.date)) : "—";
    meta.textContent = `${dateStr} • ${PLN.format(Number(r.total || 0))} ${r.tags ? "• " + r.tags : ""}`;
    main.appendChild(title);
    main.appendChild(meta);
    const actions = document.createElement("div");
    actions.className = "item-actions";
    const btnView = document.createElement("button");
    btnView.className = "btn-secondary";
    btnView.innerHTML = `<i class="icon icon-eye"></i> Podgląd`;
    btnView.addEventListener("click", () => openReceiptView(r));
    const btnDel = document.createElement("button");
    btnDel.className = "btn-danger-outline";
    btnDel.innerHTML = `<i class="icon icon-delete"></i> Usuń`;
    btnDel.addEventListener("click", async () => {
      if (!confirm("Czy przenieść paragon do kosza?")) return;
      Storage.remove("receipts", r.id, { permanent: false });
      toast("Paragon przeniesiono do kosza.");
      renderList();
      try { window.Bus?.emit?.("stats:updated"); } catch {}
    });
    actions.append(btnView, btnDel);
    const ph2 = document.createElement("span");
    li.appendChild(ph1);
    li.appendChild(main);
    li.appendChild(actions);
    li.appendChild(ph2);
    ul.appendChild(li);
  }
  if (!ul.children.length) {
    const info = document.createElement("div");
    info.className = "muted small";
    info.textContent = "Brak paragonów. Dodaj zdjęcie lub wprowadź dane ręcznie.";
    ul.appendChild(info);
  }
}
function openReceiptView(rec) {
  const dlgId = "dialog-receipt-view";
  let dlg = qs(`#${dlgId}`);
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = dlgId;
    dlg.className = "dialog dialog-full";
    dlg.innerHTML = `
      <div class="dialog-content">
        <h3><i class="icon icon-receipt"></i> Paragon</h3>
        <div style="display:grid;gap:10px;">
          <img id="rv-img" alt="Zdjęcie paragonu" style="max-width:100%;border:1px solid var(--border);border-radius:12px;display:none;" />
          <label>Sklep <input id="rv-store" type="text"/></label>
          <div class="grid-2">
            <label>Data <input id="rv-date" type="date"/></label>
            <label>Kwota <input id="rv-total" type="number" step="0.01" min="0"/></label>
          </div>
          <label>Kategorie/Tagi <input id="rv-tags" type="text" placeholder="np. spożywcze, chemia"/></label>
          <label>Tekst OCR <textarea id="rv-ocr" rows="6"></textarea></label>
        </div>
        <menu class="dialog-actions">
          <button id="rv-export" class="btn-secondary"><i class="icon icon-download"></i> Eksportuj</button>
          <button id="rv-save" class="btn-primary"><i class="icon icon-check"></i> Zapisz</button>
          <button id="rv-close" class="btn-ghost">Zamknij</button>
        </menu>
      </div>
    `;
    document.body.appendChild(dlg);
    qs("#rv-close", dlg)?.addEventListener("click", () => dlg.close());
  }
  qs("#rv-store", dlg).value = rec.store || "";
  qs("#rv-date", dlg).value = rec.date || "";
  qs("#rv-total", dlg).value = Number(rec.total || 0);
  qs("#rv-tags", dlg).value = rec.tags || "";
  qs("#rv-ocr", dlg).value = rec.ocr_text || "";
  const imgEl = qs("#rv-img", dlg);
  if (rec.image_data_url) {
    imgEl.src = rec.image_data_url;
    imgEl.style.display = "block";
  } else {
    imgEl.removeAttribute("src");
    imgEl.style.display = "none";
  }
  qs("#rv-save", dlg).onclick = () => {
    const upd = {
      ...rec,
      store: qs("#rv-store", dlg).value.trim(),
      date: qs("#rv-date", dlg).value || rec.date,
      total: parseFloat(qs("#rv-total", dlg).value || "0"),
      tags: qs("#rv-tags", dlg).value.trim(),
      ocr_text: qs("#rv-ocr", dlg).value,
      updated_at: Date.now()
    };
    Storage.upsert("receipts", upd);
    toast("Zapisano paragon.");
    dlg.close();
    renderList();
    try { window.Bus?.emit?.("stats:updated"); } catch {}
  };
  qs("#rv-export", dlg).onclick = () => exportSingleReceipt(rec);
  if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
}
function exportSingleReceipt(rec) {
  const mode = prompt("Eksport paragonu: wpisz 'PDF' lub 'IMG'", "PDF");
  if (!mode) return;
  if (mode.toLowerCase() === "img") {
    if (!rec.image_data_url) { toast("Brak obrazu do wyeksportowania."); return; }
    const a = document.createElement("a");
    a.href = rec.image_data_url;
    a.download = `paragon-${rec.date || ""}.jpg`;
    a.click();
    return;
  }
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  const html = `
    <html lang="pl"><head><meta charset="utf-8">
    <title>Paragon – ${rec.store || ""}</title>
    <style>
      body { font: 14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 20px; }
      h1 { font-size: 18px; margin: 0 0 12px; }
      .muted { color: #666; }
      img { max-width: 100%; border: 1px solid #ddd; border-radius: 8px; margin: 10px 0; }
      .row { margin: 6px 0; }
      .label { display:inline-block; width: 120px; color:#555; }
    </style></head><body>
    <h1>Paragon</h1>
    <div class="row"><span class="label">Sklep:</span> <strong>${(rec.store || "").replace(/</g,"&lt;")}</strong></div>
    <div class="row"><span class="label">Data:</span> ${rec.date || "—"}</div>
    <div class="row"><span class="label">Kwota:</span> ${PLN.format(Number(rec.total || 0))}</div>
    <div class="row"><span class="label">Tagi:</span> ${(rec.tags || "—").replace(/</g,"&lt;")}</div>
    ${rec.image_data_url ? `<img src="${rec.image_data_url}" alt="Paragon" />` : ""}
    ${rec.ocr_text ? `<h3>OCR</h3><pre>${(rec.ocr_text || "").replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</pre>` : ""}
    <script>window.onload=()=>setTimeout(()=>window.print(), 200);</script>
    </body></html>
  `;
  w.document.open(); w.document.write(html); w.document.close();
}
function exportList() {
  const fmt = prompt("Eksport: wpisz 'CSV', 'PDF' lub 'IMG'", "CSV");
  if (!fmt) return;
  const snap = Storage.getSnapshot();
  const arr = (snap.receipts || []).slice().sort((a,b) => new Date(b.date || b.updated_at || 0) - new Date(a.date || a.updated_at || 0));
  if (fmt.toLowerCase() === "csv") {
    const rows = [["Sklep","Data","Kwota","Tagi"]];
    arr.forEach(r => rows.push([
      (r.store || "").replace(/;/g, ","),
      r.date || "",
      String(Number(r.total || 0)).replace(".", ","),
      (r.tags || "").replace(/;/g, ",")
    ]));
    const csv = rows.map(r => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `paragony-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  if (fmt.toLowerCase() === "img") {
    let count = 0;
    arr.forEach((r, i) => {
      if (!r.image_data_url) return;
      const a = document.createElement("a");
      a.href = r.image_data_url;
      a.download = `paragon-${r.date || ""}-${i+1}.jpg`;
      a.click();
      count++;
    });
    toast(count ? `Pobrano ${count} plików.` : "Brak obrazów do pobrania.");
    return;
  }
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  const items = arr.map(r => `
    <div class="item">
      <div><strong>${(r.store || "Paragon").replace(/</g,"&lt;")}</strong></div>
      <div class="muted">${r.date || "—"} • ${PLN.format(Number(r.total || 0))} ${r.tags ? "• " + r.tags : ""}</div>
      ${r.image_data_url ? `<img src="${r.image_data_url}" alt="Paragon" />` : ""}
    </div>
  `).join("");
  const html = `
    <html lang="pl"><head><meta charset="utf-8">
    <title>Paragony — eksport</title>
    <style>
      body { font: 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 16px; }
      .muted { color:#666; }
      .item { margin: 0 0 18px; page-break-inside: avoid; }
      img { max-width: 100%; border: 1px solid #ddd; border-radius: 6px; margin-top: 6px; }
    </style></head><body>
    <h1>Paragony</h1>
    ${items}
    <script>window.onload=()=>setTimeout(()=>window.print(), 250);</script>
    </body></html>
  `;
  w.document.open(); w.document.write(html); w.document.close();
}
async function startOCR() {
  const fileInput = qs("#ocr-file");
  const ta = qs("#ocr-text");
  const res = qs("#scanner-result");
  if (!fileInput?.files?.length) { toast("Wybierz zdjęcie paragonu."); return; }
  const info = (msg) => { if (ta) ta.value = (ta.value ? ta.value + "\n" : "") + msg; };
  try {
    ta.value = "";
    info("Inicjalizacja OCR…");
    await ensureTesseract();
    if (!window.Tesseract) throw new Error("Brak silnika OCR.");
    const file = fileInput.files[0];
    const dataURL = await readFile(file);
    const imgCompressed = await compressImageDataURL(dataURL, 1600, 0.9);
    const { Tesseract } = window;
    const resOCR = await Tesseract.recognize(imgCompressed, "pol+eng", {
      logger: (m) => {
        if (m.status && typeof m.progress === "number") {
          info(`${m.status}: ${(m.progress*100).toFixed(0)}%`);
        }
      }
    });
    const text = resOCR?.data?.text || "";
    ta.value = text || "";
    const fields = parseOCRTextToFields(text);
    if (fields.store) qs("#ocr-store").value = fields.store;
    if (fields.date) qs("#ocr-date").value = fields.date;
    if (fields.total) qs("#ocr-total").value = String(fields.total).replace(".", ",");
    const form = qs("#dialog-ocr .dialog-content");
    if (form) form.dataset.imageDataUrl = imgCompressed;
    toast("OCR zakończony.");
  } catch (e) {
    ta.value = (ta.value ? ta.value + "\n" : "") + "Błąd OCR: " + (e.message || e);
    toast("Nie udało się rozpoznać tekstu.");
  }
}
async function saveFromDialog() {
  const store = qs("#ocr-store").value.trim();
  const date = qs("#ocr-date").value || new Date().toISOString().slice(0,10);
  const totalStr = (qs("#ocr-total").value || "0").replace(",", ".");
  const total = parseFloat(totalStr || "0");
  const tags = qs("#ocr-tags").value.trim();
  const ocr_text = qs("#ocr-text").value;
  const form = qs("#dialog-ocr .dialog-content");
  const image_data_url = form?.dataset?.imageDataUrl || null;
  const rec = {
    id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    store, date, total, tags, ocr_text,
    image_data_url,
    updated_at: Date.now()
  };
  Storage.upsert("receipts", rec);
  toast("Paragon zapisano.");
  qs("#ocr-store").value = "";
  qs("#ocr-date").value = "";
  qs("#ocr-total").value = "";
  qs("#ocr-tags").value = "";
  qs("#ocr-text").value = "";
  if (form) delete form.dataset.imageDataUrl;
  const dlg = qs("#dialog-ocr");
  if (dlg?.open) dlg.close();
  renderList();
  try { window.Bus?.emit?.("stats:updated"); } catch {}
}
async function previewSelectedImage() {
  const fileInput = qs("#ocr-file");
  const form = qs("#dialog-ocr .dialog-content");
  if (!fileInput?.files?.length) return;
  const dataURL = await readFile(fileInput.files[0]);
  const compressed = await compressImageDataURL(dataURL, 1600, 0.9);
  form.dataset.imageDataUrl = compressed;
  let img = qs("#ocr-preview");
  if (!img) {
    img = document.createElement("img");
    img.id = "ocr-preview";
    img.alt = "Podgląd paragonu";
    img.style.maxWidth = "100%";
    img.style.border = "1px solid var(--border)";
    img.style.borderRadius = "12px";
    img.style.marginTop = "8px";
    const controls = qs("#dialog-ocr .ocr-controls");
    controls?.insertAdjacentElement("afterend", img);
  }
  img.src = compressed;
}
export const Receipts = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;
    await Storage.init?.();
    qs("#btn-receipt-add-photo")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const dlg = qs("#dialog-ocr");
      if (!dlg) return;
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      setTimeout(() => qs("#ocr-file")?.click(), 30);
    }, { capture: true });
    qs("#btn-receipt-add-manual")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const dlg = qs("#dialog-ocr");
      if (!dlg) return;
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    }, { capture: true });
    qs("#btn-ocr-start")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      startOCR();
    }, { capture: true });
    qs("#ocr-file")?.addEventListener("change", () => previewSelectedImage());
    qs("#btn-ocr-save")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopImmediatePropagation();
      saveFromDialog();
    }, { capture: true });
    qs("#btn-ocr-close")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const dlg = qs("#dialog-ocr"); if (dlg?.open) dlg.close();
    }, { capture: true });
    qs("#receipt-search")?.addEventListener("input", () => renderList());
    qs("#btn-receipt-export")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      exportList();
    }, { capture: true });
    this._bus.on?.("storage:synced", () => renderList());
    renderList();
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Receipts.init(window.Bus));
} else {
  Receipts.init(window.Bus);
}
export default Receipts;