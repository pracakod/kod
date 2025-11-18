"use strict";
import { Storage } from "./storage.js";
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const isDigits = (s) => /^\d+$/.test(s);
function toast(text, actionLabel = null, actionFn = null, timeout = 3200) {
  const sb = qs("#snackbar");
  if (!sb) return;
  const act = qs("#snackbar-action");
  qs("#snackbar-text").textContent = text;
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
const EAN_L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const EAN_G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const EAN_R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const EAN_PARITY = {
  "0":"LLLLLL","1":"LLGLGG","2":"LLGGLG","3":"LLGGGL","4":"LGLLGG",
  "5":"LGGLLG","6":"LGGGLL","7":"LGLGLG","8":"LGLGGL","9":"LGGLGL"
};
const EAN_GUARD_START = "101";
const EAN_GUARD_MIDDLE = "01010";
const EAN_GUARD_END = "101";
function ean13Checksum12(d12) {
  const ds = d12.split("").map(n => +n);
  const sum = ds.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const mod = sum % 10;
  return (10 - mod) % 10;
}
function drawEAN13(canvas, raw) {
  try {
    const code = raw.trim();
    if (!isDigits(code) || (code.length !== 12 && code.length !== 13)) return false;
    const digits = code.length === 12 ? code + String(ean13Checksum12(code)) : code;
    const first = digits[0];
    const left = digits.slice(1, 7);
    const right = digits.slice(7);
    const parity = EAN_PARITY[first] || "LLLLLL";
    let bits = EAN_GUARD_START;
    for (let i = 0; i < 6; i++) {
      const d = +left[i];
      const set = parity[i] === "L" ? EAN_L : EAN_G;
      bits += set[d];
    }
    bits += EAN_GUARD_MIDDLE;
    for (let i = 0; i < 6; i++) {
      const d = +right[i];
      bits += EAN_R[d];
    }
    bits += EAN_GUARD_END;
    const ctx = canvas.getContext("2d");
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssW = canvas.clientWidth || 360;
    const cssH = canvas.clientHeight || 200;
    canvas.width = Math.floor(cssW * ratio);
    canvas.height = Math.floor(cssH * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0,0,cssW,cssH);
    const margin = 12;
    const H = cssH - 36;
    const x0 = margin;
    const totalModules = bits.length;
    const moduleW = Math.max(1, Math.floor((cssW - 2*margin) / totalModules));
    const barH = H;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,cssW,cssH);
    let x = x0;
    ctx.fillStyle = "#000";
    for (let i = 0; i < bits.length; i++) {
      const isBar = bits[i] === "1";
      let h = barH;
      const inStart = i < 3;
      const inMiddle = i >= (3 + 42) && i < (3 + 42 + 5);
      const inEnd = i >= (3 + 42 + 5 + 42);
      if (inStart || inMiddle || inEnd) h = barH + 8;
      if (isBar) ctx.fillRect(x, 16, moduleW, h);
      x += moduleW;
    }
    ctx.fillStyle = "#111";
    ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(first, margin + moduleW * 1.5, 16 + barH + 4);
    for (let i = 0; i < 6; i++) {
      const cx = x0 + moduleW * (3 + (i*7) + 3.5);
      ctx.fillText(left[i], cx, 16 + barH + 4);
    }
    for (let i = 0; i < 6; i++) {
      const cx = x0 + moduleW * (3 + 42 + 5 + (i*7) + 3.5);
      ctx.fillText(right[i], cx, 16 + barH + 4);
    }
    return true;
  } catch {
    return false;
  }
}
const CODE128_PATTERNS = [
  [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],[1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
  [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],[1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
  [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],[3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
  [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],[1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
  [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],[1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
  [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],[3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
  [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],[1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
  [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],[2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
  [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],[1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
  [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],[1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
  [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],[2,1,1,2,3,2],[2,3,3,1,1,1,2]
];
function drawCode128(canvas, text) {
  try {
    const data = String(text ?? "").split("").map(ch => ch.charCodeAt(0));
    if (!data.length || data.some(n => n < 32 || n > 126)) return false;
    const codes = [104, ...data.map(n => n - 32)];
    let sum = 104;
    for (let i = 0; i < data.length; i++) sum += (i + 1) * (data[i] - 32);
    const check = sum % 103;
    codes.push(check);
    codes.push(106);
    const modules = [];
    for (const c of codes) {
      const pat = CODE128_PATTERNS[c];
      if (!pat) continue;
      modules.push(...pat);
    }
    const ctx = canvas.getContext("2d");
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssW = canvas.clientWidth || 360;
    const cssH = canvas.clientHeight || 200;
    canvas.width = Math.floor(cssW * ratio);
    canvas.height = Math.floor(cssH * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0,0,cssW,cssH);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,cssW,cssH);
    const margin = 16;
    const barH = cssH - 36;
    const total = modules.reduce((a,b)=>a+b,0);
    const unit = Math.max(1, Math.floor((cssW - 2*margin) / total));
    let x = margin;
    let isBar = true;
    for (const w of modules) {
      if (isBar) {
        ctx.fillStyle = "#000";
        ctx.fillRect(x, 16, unit * w, barH);
      }
      x += unit * w;
      isBar = !isBar;
    }
    ctx.fillStyle = "#111";
    ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, cssW/2, 16 + barH + 4);
    return true;
  } catch {
    return false;
  }
}
function ensureBarcodeDialog() {
  let dlg = qs("#dialog-loyalty-barcode");
  if (dlg) return dlg;
  dlg = document.createElement("dialog");
  dlg.id = "dialog-loyalty-barcode";
  dlg.className = "dialog dialog-full";
  dlg.innerHTML = `
    <div class="dialog-content">
      <h3><i class="icon icon-barcode"></i> Kod karty</h3>
      <div style="display:grid;gap:8px;place-items:center;">
        <canvas id="loyalty-barcode-canvas" style="width:100%;height:220px;border:1px solid var(--border);border-radius:12px;background:#fff;"></canvas>
        <div id="loyalty-barcode-text" class="strong" style="letter-spacing:1px;"></div>
        <div class="muted small">Upewnij się, że jasność ekranu jest wystarczająca.</div>
      </div>
      <menu class="dialog-actions">
        <button id="btn-loyalty-copy" class="btn-secondary"><i class="icon icon-download"></i> Kopiuj kod</button>
        <button id="btn-loyalty-close" class="btn-ghost">Zamknij</button>
      </menu>
    </div>
  `;
  document.body.appendChild(dlg);
  qs("#btn-loyalty-close", dlg)?.addEventListener("click", () => dlg.close());
  qs("#btn-loyalty-copy", dlg)?.addEventListener("click", async () => {
    const txt = qs("#loyalty-barcode-text", dlg)?.textContent || "";
    try { await navigator.clipboard.writeText(txt); toast("Skopiowano kod do schowka."); }
    catch { toast("Nie udało się skopiować kodu."); }
  });
  return dlg;
}
function openBarcodeDialogFor(code) {
  const dlg = ensureBarcodeDialog();
  const canvas = qs("#loyalty-barcode-canvas", dlg);
  const textEl = qs("#loyalty-barcode-text", dlg);
  textEl.textContent = code;
  const ok = isDigits(code) && (code.length === 12 || code.length === 13)
    ? drawEAN13(canvas, code)
    : drawCode128(canvas, code);
  if (!ok) {
    const ctx = canvas.getContext("2d");
    const cssW = canvas.clientWidth || 360;
    const cssH = canvas.clientHeight || 200;
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(cssW * ratio);
    canvas.height = Math.floor(cssH * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0,0,cssW,cssH);
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,cssW,cssH);
    ctx.fillStyle = "#111"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "600 18px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.fillText(code, cssW/2, cssH/2);
  }
  if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
}
export const Loyalty = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;
    await Storage.init?.();
    this._bus.on?.("loyalty:add", ({ name, code, store }) => {
      if (!code || !name) return;
      this._addCard({ name: String(name).trim(), code: String(code).trim(), store: String(store || "").trim() });
    });
    qs("#btn-loyalty-add")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const name = prompt("Nazwa karty (np. Biedronka, Lidl, Żabka):");
      if (!name) return;
      const code = prompt("Kod karty (cyfry lub tekst):");
      if (!code) return;
      const store = prompt("Sklep/kategoria (opcjonalnie):") || "";
      this._addCard({ name: name.trim(), code: code.trim(), store: store.trim() });
    }, { capture: true });
    qs("#loyalty-list")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".show-barcode");
      if (btn) {
        const li = e.target.closest(".card-item");
        const id = li?.dataset?.id;
        if (!id) return;
        const snap = Storage.getSnapshot();
        const card = (snap.loyalty_cards || []).find(c => c.id === id);
        if (card?.code) openBarcodeDialogFor(card.code);
      }
    });
    this._bindLongPressDelete();
    this._bus.on?.("storage:synced", () => this.render());
    this.render();
  },
  _bindLongPressDelete() {
    const root = qs("#loyalty-list");
    if (!root) return;
    let timer = null, targetLi = null;
    root.addEventListener("pointerdown", (e) => {
      const li = e.target.closest(".card-item");
      if (!li) return;
      targetLi = li;
      timer = setTimeout(() => {
        timer = null;
        const id = targetLi?.dataset?.id;
        if (!id) return;
        if (confirm("Czy usunąć kartę lojalnościową?")) {
          Storage.remove("loyalty_cards", id, { permanent: false });
          toast("Kartę przeniesiono do kosza.");
          this.render();
        }
      }, 650);
    }, { passive: true });
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } targetLi = null; };
    ["pointerup","pointercancel","pointerleave","scroll"].forEach(ev => root.addEventListener(ev, cancel, { passive: true }));
  },
  _addCard({ name, code, store }) {
    const rec = {
      id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name, code, store: store || "",
      updated_at: Date.now()
    };
    Storage.upsert("loyalty_cards", rec);
    toast("Karta zapisana.");
    this.render();
  },
  render() {
    const ul = qs("#loyalty-list");
    if (!ul) return;
    const snap = Storage.getSnapshot();
    const arr = (snap.loyalty_cards || []).slice().sort((a,b) => (a.name || "").localeCompare(b.name || ""));
    ul.innerHTML = "";
    for (const c of arr) {
      const tpl = qs("#tpl-loyalty-card");
      const li = tpl?.content?.firstElementChild?.cloneNode(true) || document.createElement("li");
      li.className = li.className || "card-item";
      li.dataset.id = c.id;
      const logo = li.querySelector(".card-logo-css");
      if (logo) logo.innerHTML = `<i class="icon icon-store"></i>`;
      li.querySelector(".card-title")?.replaceChildren(document.createTextNode(c.name || "Karta"));
      const codeEl = li.querySelector(".card-code");
      if (codeEl) {
        codeEl.textContent = c.code || "";
        if (c.store) codeEl.textContent += ` • ${c.store}`;
      }
      ul.appendChild(li);
    }
    if (!ul.children.length) {
      const info = document.createElement("div");
      info.className = "muted small";
      info.textContent = "Brak zapisanych kart. Użyj „Skanuj kartę” lub „Dodaj kartę”.";
      ul.appendChild(info);
    }
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Loyalty.init(window.Bus));
} else {
  Loyalty.init(window.Bus);
}
export default Loyalty;