// client.js - Neon Blades (mobilnie: atak przyciskiem, orbitujące sztylety)
const socket = io();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// UI
const startEl = document.getElementById('start');
const nickEl = document.getElementById('nick');
const roomEl = document.getElementById('room');
const joinBtn = document.getElementById('joinBtn');
const randBtn = document.getElementById('randBtn');
const msgEl = document.getElementById('msg');
const shareEl = document.getElementById('share');
const roomsListEl = document.getElementById('roomsList');

const hudRoom = document.getElementById('hudRoom');
const hudKills = document.getElementById('hudKills');
const hudHp = document.getElementById('hudHp');
const hudEn = document.getElementById('hudEn');

const attackBtn = document.getElementById('attackBtn');
const s1Btn = document.getElementById('s1Btn');
const s2Btn = document.getElementById('s2Btn');
const dirBtns = [...document.querySelectorAll('#pad .dir')];

const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');

// Stan
let SELF_ID = null;
let ROOM_ID = null;
let MAP = { w: 2400, h: 1600, obstacles: [] };

const players = new Map(); // id -> {id,name,x,y,hp,maxHp,energy,maxEnergy,kills,color,blades,hitFlash}
const projectiles = new Map(); // id -> {type,x,y,ax,ay,speed,radius,ownerId,born}
const pickups = new Map();

let me = {
  x: 100, y: 100, speed: 235,
  hp: 0, maxHp: 0, energy: 0, maxEnergy: 0, kills: 0,
};

let lastSent = { x: 0, y: 0, t: 0 };
const input = { left:false, right:false, up:false, down:false };
let lastTs = performance.now();

let cd = { basic: 0, s1: 0, s2: 0 };

const pulses = new Map(); // id -> until
const localPhase = new Map(); // id -> angle phase (do rysowania ostrzy)

// Helpers
function setMsg(s, isError=true) { msgEl.textContent = s || ''; msgEl.style.color = isError ? '#ff6b81' : '#aab0c0'; }
function getParam(name) { return new URLSearchParams(location.search).get(name) || ''; }
function randCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s=''; for (let i=0;i<4;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Prefill
const preRoom = getParam('room');
if (preRoom) roomEl.value = preRoom.toUpperCase();
if (!nickEl.value) nickEl.value = 'Gracz' + Math.floor(Math.random()*1000);
function refreshShare() {
  const code = (roomEl.value || '').toUpperCase();
  shareEl.textContent = code ? `Link do pokoju: ${location.origin}?room=${code}` : '';
}
roomEl.addEventListener('input', refreshShare);
randBtn.addEventListener('click', ()=>{ roomEl.value = randCode(); refreshShare(); });

joinBtn.addEventListener('click', () => {
  const nickname = nickEl.value.trim() || 'Gracz';
  const code = (roomEl.value.trim() || randCode()).toUpperCase();
  ROOM_ID = code;
  socket.emit('join', { roomId: code, nickname });
});

// Chat
function addChatLine(text) {
  const el = document.createElement('div');
  el.className = 'chatMsg';
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}
chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
function sendChat() {
  const t = chatInput.value.trim();
  if (!t) return;
  socket.emit('chat', t);
  chatInput.value = '';
}

// Rooms list
async function refreshRooms() {
  try {
    const res = await fetch('/api/rooms');
    const arr = await res.json();
    roomsListEl.innerHTML = '';
    if (!arr.length) roomsListEl.textContent = 'Brak aktywnych pokoi.';
    for (const r of arr) {
      const div = document.createElement('div');
      div.className = 'roomItem';
      div.innerHTML = `<div><b>${r.id}</b> • graczy: ${r.players}</div>`;
      const btn = document.createElement('button');
      btn.textContent = 'Dołącz';
      btn.addEventListener('click', () => { roomEl.value = r.id; refreshShare(); });
      div.appendChild(btn);
      roomsListEl.appendChild(div);
    }
  } catch (_) {}
}
setInterval(refreshRooms, 2000);
refreshRooms();

// Socket
socket.on('errorMsg', (m)=> setMsg(m));
socket.on('full', ()=> setMsg('Pokój pełny (max 10 osób).'));

socket.on('joined', (data) => {
  SELF_ID = data.selfId;
  ROOM_ID = data.roomId;
  MAP = data.map;

  players.clear();
  projectiles.clear();
  pickups.clear();
  pulses.clear();
  localPhase.clear();

  for (const p of data.players) {
    players.set(p.id, { ...p, hitFlash: 0 });
    localPhase.set(p.id, Math.random() * Math.PI * 2);
    if (p.id === SELF_ID) {
      me.x = p.x; me.y = p.y; me.hp = p.hp; me.maxHp = p.maxHp; me.energy = p.energy; me.maxEnergy = p.maxEnergy; me.kills = p.kills;
    }
  }
  for (const pk of data.pickups) pickups.set(pk.id, pk);

  hudRoom.textContent = `Pokój: ${ROOM_ID}`;
  hudKills.textContent = `Zabójstwa: ${me.kills}`;
  updateBars();

  startEl.style.display = 'none';
  refreshShare();
  setMsg('');

  addChatLine('— Dołączyłeś do pokoju ' + ROOM_ID + ' —');
});

socket.on('playerJoined', (p) => {
  players.set(p.id, { ...p, hitFlash: 0 });
  localPhase.set(p.id, Math.random() * Math.PI * 2);
  addChatLine(`• ${p.name} dołączył`);
});

socket.on('playerLeft', ({ id }) => {
  const p = players.get(id);
  if (p) addChatLine(`• ${p.name} wyszedł`);
  players.delete(id);
  localPhase.delete(id);
  pulses.delete(id);
});

socket.on('playerMoved', ({ id, x, y }) => {
  const p = players.get(id);
  if (p) { p.x = x; p.y = y; }
});

socket.on('stat', ({ id, hp, energy, blades }) => {
  const p = players.get(id);
  if (!p) return;
  if (typeof hp === 'number') { p.hp = hp; if (id === SELF_ID) me.hp = hp; }
  if (typeof energy === 'number') { p.energy = energy; if (id === SELF_ID) me.energy = energy; }
  if (typeof blades === 'number') p.blades = blades;
  if (id === SELF_ID) updateBars();
});

socket.on('respawn', ({ id, x, y, hp, energy }) => {
  const p = players.get(id);
  if (!p) return;
  p.x = x; p.y = y; p.hp = hp; p.energy = energy;
  if (id === SELF_ID) { me.x = x; me.y = y; me.hp = hp; me.energy = energy; updateBars(); }
});

socket.on('score', ({ killerId, killerKills }) => {
  const killer = players.get(killerId);
  if (killer) {
    killer.kills = killerKills;
    if (killerId === SELF_ID) { me.kills = killerKills; hudKills.textContent = `Zabójstwa: ${my.kills}`; }
  }
});

socket.on('hitFlash', ({ victimIds }) => {
  const now = performance.now() + 120;
  for (const id of victimIds) {
    const t = players.get(id);
    if (t) t.hitFlash = now;
    if (id === SELF_ID && navigator.vibrate) navigator.vibrate(10);
  }
});

socket.on('projSpawn', (p) => { projectiles.set(p.id, { ...p, born: performance.now() }); });
socket.on('projRemove', ({ id }) => { projectiles.delete(id); });

socket.on('pickupSpawn', (pk) => { pickups.set(pk.id, pk); });
socket.on('pickupRemove', ({ id }) => { pickups.delete(id); });

socket.on('pulse', ({ id, until }) => { pulses.set(id, until); });

socket.on('chatMsg', ({ from, text }) => { addChatLine(`${from}: ${text}`); });

socket.on('cdUpdate', (o) => { cd = o; });

// Sterowanie
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'a' || e.key === 'ArrowLeft') input.left = true;
  if (k === 'd' || e.key === 'ArrowRight') input.right = true;
  if (k === 'w' || e.key === 'ArrowUp') input.up = true;
  if (k === 's' || e.key === 'ArrowDown') input.down = true;
  if (e.key === ' ') doAttack();
  if (k === 'q') doSkill1();
  if (k === 'e') doSkill2();
});
addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'a' || e.key === 'ArrowLeft') input.left = false;
  if (k === 'd' || e.key === 'ArrowRight') input.right = false;
  if (k === 'w' || e.key === 'ArrowUp') input.up = false;
  if (k === 's' || e.key === 'ArrowDown') input.down = false;
});

const pressed = new Set();
function onDirPress(e) { const btn = e.currentTarget; pressed.add(`${btn.dataset.dx},${btn.dataset.dy}`); syncPressed(); e.preventDefault(); }
function onDirRelease(e) { const btn = e.currentTarget; pressed.delete(`${btn.dataset.dx},${btn.dataset.dy}`); syncPressed(); }
function syncPressed() {
  input.left = [...pressed].some(k => k === '-1,0');
  input.right = [...pressed].some(k => k === '1,0');
  input.up = [...pressed].some(k => k === '0,-1');
  input.down = [...pressed].some(k => k === '0,1');
}
for (const b of dirBtns) {
  b.addEventListener('pointerdown', onDirPress);
  b.addEventListener('pointerup', onDirRelease);
  b.addEventListener('pointercancel', onDirRelease);
  b.addEventListener('pointerleave', onDirRelease);
}

attackBtn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); doAttack(); });
s1Btn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); doSkill1(); });
s2Btn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); doSkill2(); });

function doAttack() { if (cd.basic > 0) return; socket.emit('attack'); }
function doSkill1() { if (cd.s1 > 0) return; socket.emit('skill1'); }
function doSkill2() { if (cd.s2 > 0) return; socket.emit('skill2'); }

// Canvas sizing
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

function updateBars() {
  hudHp.textContent = `HP: ${Math.round(me.hp)}/${me.maxHp}`;
  hudEn.textContent = `EN: ${Math.round(me.energy)}/${me.maxEnergy}`;
}

// Rysowanie
function worldToScreen(wx, wy, camX, camY, w, h) {
  return { x: Math.floor(wx - camX + w/2), y: Math.floor(wy - camY + h/2) };
}
function drawBackground(ctx, camX, camY, w, h) {
  // Neon gradient
  const g = ctx.createLinearGradient(0,0,w,h);
  g.addColorStop(0, '#0b0f2a');
  g.addColorStop(1, '#070a1e');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);

  // neon grid
  const grid = 64;
  const offX = -((camX - w/2) % grid);
  const offY = -((camY - h/2) % grid);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#10245c';
  ctx.lineWidth = 1;
  for (let x = offX; x < w; x += grid) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for (let y = offY; y < h; y += grid) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  ctx.restore();
}

let bangs = [];

function draw() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const camX = clamp(me.x, w/2, MAP.w - w/2);
  const camY = clamp(me.y, h/2, MAP.h - h/2);

  drawBackground(ctx, camX, camY, w, h);

  // Granice mapy
  ctx.save();
  ctx.shadowBlur = 12; ctx.shadowColor = '#1dd3ff';
  ctx.strokeStyle = 'rgba(0,229,255,0.5)'; ctx.lineWidth = 3;
  ctx.strokeRect(Math.floor(w/2 - camX), Math.floor(h/2 - camY), MAP.w, MAP.h);
  ctx.restore();

  // Przeszkody (neon)
  for (const r of MAP.obstacles || []) {
    const s = worldToScreen(r.x, r.y, camX, camY, w, h);
    ctx.save();
    ctx.fillStyle = '#0d153b';
    ctx.fillRect(s.x, s.y, r.w, r.h);
    ctx.shadowBlur = 8; ctx.shadowColor = '#2948ff';
    ctx.strokeStyle = 'rgba(90,120,255,.65)';
    ctx.strokeRect(s.x, s.y, r.w, r.h);
    ctx.restore();
  }

  const now = performance.now();

  // Pickupy (bonusy)
  for (const pk of pickups.values()) {
    const s = worldToScreen(pk.x, pk.y, camX, camY, w, h);
    const col = pk.kind === 'hp' ? '#ff6b81' : pk.kind === 'en' ? '#00e5ff' : pk.kind === 'haste' ? '#8aff80' : pk.kind === 'blade' ? '#ffd166' : '#a08bff';
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.x, s.y, 12, 0, Math.PI*2);
    ctx.fillStyle = col; ctx.fill();
    ctx.shadowBlur = 14; ctx.shadowColor = col;
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  // Pociski (boomerangi)
  for (const p of projectiles.values()) {
    const dt = (now - p.born) / 1000;
    const px = p.x + p.ax * p.speed * dt;
    const py = p.y + p.ay * p.speed * dt;
    const s = worldToScreen(px, py, camX, camY, w, h);
    ctx.save();
    ctx.strokeStyle = '#ff7ac3'; ctx.lineWidth = 3; ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.moveTo(s.x - p.ax*14, s.y - p.ay*14); ctx.lineTo(s.x + p.ax*14, s.y + p.ay*14); ctx.stroke();
    ctx.restore();
  }

  // Efekty pulse
  for (const [pid, until] of pulses) {
    if (until < Date.now()) continue;
    const p = players.get(pid); if (!p) continue;
    const s = worldToScreen(p.x, p.y, camX, camY, w, h);
    const frac = (until - Date.now()) / 260;
    ctx.save();
    ctx.globalAlpha = 0.4 * Math.max(0, frac);
    ctx.strokeStyle = '#f15bb5';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(s.x, s.y, 76 - 40*(1-frac), 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  // Eksplozje / uderzenia (nieużywane tu – zostawiamy mechanikę na później)
  bangs = bangs.filter(b => b.until > now);

  // Gracze + ostrza
  for (const p of players.values()) {
    const s = worldToScreen(p.x, p.y, camX, camY, w, h);
    const isMe = p.id === SELF_ID;
    const r = 18;

    // cień
    ctx.save();
    ctx.beginPath(); ctx.ellipse(s.x, s.y+10, r*0.9, r*0.55, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
    ctx.restore();

    // glow ring
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = 16; ctx.shadowColor = p.color || '#00e5ff';
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI*2);
    ctx.fillStyle = (p.color || '#00e5ff') + 'AA'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = isMe ? 3 : 2; ctx.stroke();
    ctx.restore();

    // HP/EN
    drawBar(s.x, s.y - r - 18, 48, 6, (p.hp ?? 100) / (p.maxHp || 100), '#17c964');
    drawBar(s.x, s.y - r - 10, 48, 4, (p.energy ?? 0) / (p.maxEnergy || 1), '#28c7ff');

    // nick
    ctx.fillStyle = 'rgba(230,235,250,0.95)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${p.name} ${p.kills?`(${p.kills})`:''}`, s.x, s.y - r - 26);

    // aura przy trafieniu
    if ((p.hitFlash || 0) > now) {
      ctx.beginPath(); ctx.arc(s.x, s.y, r+12, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,77,109,0.35)'; ctx.lineWidth = 3; ctx.stroke();
    }

    // Ostrza (lokalna faza – czysto wizualnie)
    const phase = (localPhase.get(p.id) || 0);
    const blades = p.blades || 4;
    const pulseActive = (pulses.get(p.id) || 0) > Date.now();
    const orbitR = 56 * (pulseActive ? 1.6 : 1);
    for (let i = 0; i < blades; i++) {
      const ang = phase + (i / blades) * Math.PI*2;
      const bx = s.x + Math.cos(ang) * orbitR;
      const by = s.y + Math.sin(ang) * orbitR;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 10; ctx.shadowColor = p.color || '#00e5ff';
      ctx.beginPath();
      ctx.arc(bx, by, 7, 0, Math.PI*2);
      ctx.fillStyle = p.color || '#00e5ff';
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawBar(x, y, w, h, frac, col) {
  ctx.fillStyle = '#0b1120aa'; ctx.fillRect(x - w/2, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x - w/2, y, w * clamp(frac,0,1), h);
  ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.strokeRect(x - w/2, y, w, h);
}

// Pętla
function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  // Ruch
  const ax = (input.right?1:0) - (input.left?1:0);
  const ay = (input.down?1:0) - (input.up?1:0);
  const len = Math.hypot(ax, ay) || 1;
  const nx = ax / len, ny = ay / len;

  me.x += nx * (me.speed || 235) * dt;
  me.y += ny * (me.speed || 235) * dt;
  me.x = clamp(me.x, 0, MAP.w);
  me.y = clamp(me.y, 0, MAP.h);

  // wysyłaj pozycję
  const now = performance.now();
  const moved = Math.hypot(me.x - lastSent.x, me.y - lastSent.y) > 0.5;
  if (moved && now - lastSent.t > 33) {
    socket.emit('move', { x: me.x, y: me.y });
    lastSent = { x: me.x, y: me.y, t: now };
    const mine = players.get(SELF_ID);
    if (mine) { mine.x = me.x; mine.y = me.y; }
  }

  // cooldown UI
  cd.basic = Math.max(0, cd.basic - (dt*1000));
  cd.s1 = Math.max(0, cd.s1 - (dt*1000));
  cd.s2 = Math.max(0, cd.s2 - (dt*1000));
  paintCooldown(attackBtn, cd.basic);
  paintCooldown(s1Btn, cd.s1);
  paintCooldown(s2Btn, cd.s2);

  // animacja ostrzy
  for (const [id, p] of players) {
    const cur = (localPhase.get(id) || 0) + (3.6 * (pulses.get(id) > Date.now() ? 1.2 : 1)) * dt;
    localPhase.set(id, cur % (Math.PI*2));
  }

  // rysuj
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function paintCooldown(btn, ms) {
  if (ms <= 0) { btn.classList.remove('cooldown'); btn.removeAttribute('data-cd'); return; }
  btn.classList.add('cooldown');
  btn.setAttribute('data-cd', (ms/1000).toFixed(1)+'s');
}