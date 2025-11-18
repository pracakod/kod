"use strict";
const LS_BARCODE_MAP = "lista:barcode-map";
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
function loadMap() {
  try {
    const raw = localStorage.getItem(LS_BARCODE_MAP);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveMap(map) {
  try { localStorage.setItem(LS_BARCODE_MAP, JSON.stringify(map)); } catch {}
}
function toast(text, actionLabel = null, actionFn = null, timeout = 3000) {
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
export const Barcode = {
  _inited: false,
  _bus: { on() {}, emit() {} },
  _detector: null,
  _stream: null,
  _anim: null,
  _lastDetect: 0,
  _purpose: "shopping",
  _map: {},
  async init(Bus) {
    if (this._inited) return;
    this._inited = true;
    if (Bus && typeof Bus.emit === "function") this._bus = Bus;
    this._map = loadMap();
    qs("#btn-scan-barcode")?.addEventListener("click", () => this.open({ purpose: "shopping" }));
    qs("#btn-loyalty-scan")?.addEventListener("click", () => this.open({ purpose: "loyalty" }));
    qs("#btn-scanner-cancel")?.addEventListener("click", () => this.close());
  },
  async open({ purpose = "shopping" } = {}) {
    this._purpose = purpose;
    const dlg = qs("#dialog-scanner");
    if (!dlg) return;
    const res = qs("#scanner-result");
    res.textContent = "Trwa inicjalizacja kamery…";
    try {
      await this._startCamera();
      await this._initDetector();
      this._renderManualHintIfNeeded();
      this._loop();
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
    } catch (e) {
      res.textContent = "Nie udało się uruchomić aparatu. Wprowadź kod ręcznie.";
      this._renderManualEntryUI();
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
    }
  },
  async close() {
    cancelAnimationFrame(this._anim); this._anim = null;
    try { this._stream?.getTracks?.().forEach(t => t.stop()); } catch {}
    this._stream = null;
    const v = qs("#scanner-video");
    if (v) v.srcObject = null;
    const dlg = qs("#dialog-scanner");
    if (dlg?.open) dlg.close();
  },
  async _startCamera() {
    const video = qs("#scanner-video");
    if (!video) throw new Error("Brak elementu video.");
    const constraints = {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
    this._stream = stream;
    this._resizeOverlay();
    window.addEventListener("resize", this._onResizeBound || (this._onResizeBound = () => this._resizeOverlay()));
    qs("#scanner-result").textContent = "Skieruj aparat na kod kreskowy…";
  },
  _resizeOverlay() {
    const video = qs("#scanner-video");
    const canvas = qs("#scanner-overlay");
    if (!video || !canvas) return;
    const rect = video.getBoundingClientRect();
    canvas.width = Math.max(320, Math.floor(rect.width));
    canvas.height = Math.max(200, Math.floor(rect.height));
  },
  async _initDetector() {
    try {
      if ("BarcodeDetector" in window) {
        const formats = ["ean_13","ean_8","upc_a","code_128","code_39","itf","codabar","qr_code","data_matrix","pdf417"];
        this._detector = new window.BarcodeDetector({ formats });
      } else {
        this._detector = null;
      }
    } catch {
      this._detector = null;
    }
  },
  _renderManualHintIfNeeded() {
    if (this._detector) return;
    const res = qs("#scanner-result");
    const hint = document.createElement("div");
    hint.className = "small muted";
    hint.textContent = "Przeglądarka nie obsługuje natywnego rozpoznawania kodów. Skorzystaj z trybu ręcznego.";
    res.appendChild(hint);
    this._renderManualEntryUI();
  },
  _renderManualEntryUI() {
    const res = qs("#scanner-result");
    if (!res) return;
    const exist = res.querySelector(".manual-wrap");
    if (exist) exist.remove();
    const wrap = document.createElement("div");
    wrap.className = "manual-wrap";
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "1fr auto";
    wrap.style.gap = "8px";
    wrap.style.marginTop = "8px";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Wpisz kod…";
    input.autocomplete = "off";
    input.inputMode = "numeric";
    const btn = document.createElement("button");
    btn.className = "btn-primary";
    btn.textContent = "Użyj kodu";
    btn.addEventListener("click", () => {
      const code = (input.value || "").trim();
      if (!code) return;
      this._onDetected({ code, format: "manual" });
    });
    wrap.append(input, btn);
    res.appendChild(wrap);
  },
  _loop() {
    const canvas = qs("#scanner-overlay");
    const ctx = canvas?.getContext?.("2d");
    const video = qs("#scanner-video");
    const drawOverlay = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = Math.floor(canvas.width * 0.82);
      const h = Math.floor(canvas.height * 0.32);
      const x = Math.floor((canvas.width - w) / 2);
      const y = Math.floor((canvas.height - h) / 2);
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(23,105,170,.95)";
      const c = 16;
      ctx.beginPath();
      ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
      ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c);
      ctx.moveTo(x, y + h - c); ctx.lineTo(x, y + h); ctx.lineTo(x + c, y + h);
      ctx.moveTo(x + w - c, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - c);
      ctx.stroke();
      const t = (performance.now() % 1800) / 1800;
      const ly = y + Math.floor(h * t);
      ctx.strokeStyle = "rgba(255,0,0,.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 6, ly);
      ctx.lineTo(x + w - 6, ly);
      ctx.stroke();
    };
    const detect = async () => {
      if (!this._detector || !video?.srcObject) return;
      const now = performance.now();
      if (now - this._lastDetect < 120) return;
      this._lastDetect = now;
      try {
        const codes = await this._detector.detect(video);
        if (codes && codes.length) {
          const first = codes[0];
          const code = first.rawValue || String(first);
          const format = first.format || "unknown";
          this._onDetected({ code, format });
        }
      } catch {
      }
    };
    const frame = () => {
      drawOverlay();
      detect();
      this._anim = requestAnimationFrame(frame);
    };
    this._anim = requestAnimationFrame(frame);
  },
  _onDetected({ code, format }) {
    const res = qs("#scanner-result");
    if (res) {
      res.innerHTML = `<div><strong>Wykryto kod:</strong> ${code} <span class="muted small">(${format})</span></div>`;
      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";
      actions.style.marginTop = "8px";
      const btnUse = document.createElement("button");
      btnUse.className = "btn-primary";
      btnUse.textContent = "Zastosuj";
      btnUse.addEventListener("click", () => this._applyCodeToContext(code));
      const btnMap = document.createElement("button");
      btnMap.className = "btn-secondary";
      btnMap.textContent = "Powiąż z nazwą";
      btnMap.addEventListener("click", () => this._mapProductFlow(code));
      actions.append(btnUse, btnMap);
      if (this._purpose === "loyalty") {
        const btnSaveCard = document.createElement("button");
        btnSaveCard.className = "btn-secondary";
        btnSaveCard.textContent = "Dodaj kartę";
        btnSaveCard.addEventListener("click", () => this._saveLoyaltyCardFlow(code));
        actions.appendChild(btnSaveCard);
      }
      res.appendChild(actions);
    }
    try { this._bus.emit("barcode:detected", { code, format, purpose: this._purpose }); } catch {}
    toast("Kod rozpoznany.");
  },
  _applyCodeToContext(code) {
    if (this._purpose === "shopping") {
      const nameInput = qs("#shop-name");
      const mapped = this._map?.[code];
      if (nameInput) {
        if (mapped && (!nameInput.value || !nameInput.value.trim())) {
          nameInput.value = mapped;
        } else if (!nameInput.value?.trim()) {
          nameInput.value = `Produkt (${code})`;
        }
      }
      this.close();
    } else if (this._purpose === "loyalty") {
      alert("Kod karty został odczytany. Możesz skorzystać z przycisku „Dodaj kartę”.");
    } else {
      this.close();
    }
  },
  _mapProductFlow(code) {
    const current = this._map?.[code] || "";
    const name = prompt("Powiąż kod z nazwą produktu:", current);
    if (!name) return;
    this._map[code] = name.trim();
    saveMap(this._map);
    const nameInput = qs("#shop-name");
    if (nameInput && (!nameInput.value || !nameInput.value.trim())) {
      nameInput.value = this._map[code];
    }
    toast("Powiązanie zapisano lokalnie.");
  },
  _saveLoyaltyCardFlow(code) {
    const name = prompt("Nazwa karty (np. Biedronka, Lidl):");
    if (!name) return;
    const store = prompt("Sklep/kategoria (opcjonalnie):") || "";
    try { this._bus.emit("loyalty:add", { name: name.trim(), code, store }); } catch {}
    toast("Wysłano żądanie dodania karty.");
    this.close();
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Barcode.init(window.Bus));
} else {
  Barcode.init(window.Bus);
}
export default Barcode;