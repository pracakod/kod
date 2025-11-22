const { tileAt } = require('../world/map');
const { clamp } = require('../utils/math');
const { getProfile, saveProfile } = require('../data/database');
const { defaultProfile, addXP } = require('../data/profiles');
const { startFishingFor, endFishingFor } = require('../game/fishing');
const { getDefaultInventory, getDefaultEquipment } = require('../game/inventory');
const { buildElement, canBuildElement } = require('../game/building');

// Referencje globalne przekazywane z websocket.js
let broadcast, scoreBoard;

function handlePlayerMessage(ws, player, msg, globalRefs) {
  // Ustawienie referencji globalnych
  if (globalRefs) {
    broadcast = (msg, exceptId) => {
      const data = JSON.stringify(msg);
      for (const [id, client] of globalRefs.sockets) {
        if (id === exceptId) continue;
        if (client.readyState === 1) client.send(data);
      }
    };
    scoreBoard = () => {
      const arr = Array.from(globalRefs.players.values()).map(p => ({
        id: p.id, name: p.name, fishCount: p.fishCount, bestWeight: p.bestWeight, level: p.level, gold: p.gold
      }));
      arr.sort((a, b) => (b.fishCount - a.fishCount) || (b.bestWeight - a.bestWeight));
      return arr;
    };
  }

  switch (msg.type) {
    case 'resume':
      handleResume(ws, player, msg);
      break;
    case 'move':
      handleMove(ws, player, msg, globalRefs);
      break;
    case 'startFishing':
      handleStartFishing(ws, player, globalRefs);
      break;
    case 'fishingResult':
      handleFishingResult(ws, player, msg, globalRefs);
      break;
    case 'sellAll':
      handleSellAll(ws, player, globalRefs);
      break;
    case 'buyItem':
      handleBuyItem(ws, player, msg, globalRefs);
      break;
    case 'equip':
      handleEquip(ws, player, msg);
      break;
    case 'setName':
      handleSetName(ws, player, msg, globalRefs);
      break;
    case 'chat':
      handleChat(ws, player, msg, globalRefs);
      break;
    case 'buildElement':
      handleBuildElement(ws, player, msg, globalRefs);
      break;
    case 'resetCharacter':
      handleResetCharacter(ws, player, globalRefs);
      break;
  }
}

function handleResume(ws, player, msg) {
  const token = String(msg.token || '').slice(0, 64);
  player.token = token || null;
  if (player.token) {
    const profile = getProfile(player.token);
    if (!profile) {
      const newProfile = defaultProfile(player.name, player.color);
      saveProfile(player.token, newProfile);
    } else {
      // wczytaj
      player.name = profile.name || player.name;
      player.color = profile.color || player.color;
      player.level = profile.level || 1;
      player.xp = profile.xp || 0;
      player.gold = profile.gold || 0;
      player.bag = Array.isArray(profile.bag) ? profile.bag : [];
      player.inventory = profile.inventory || getDefaultInventory();
      player.equipment = profile.equipment || getDefaultEquipment();
      player.stats = profile.stats || { fishCaught: 0, totalWeight: 0, totalTime: 0, rarestFish: null };
    }
    ws.send(JSON.stringify({
      type: 'profile',
      gold: player.gold,
      bag: player.bag,
      inventory: player.inventory,
      equipment: player.equipment,
      stats: player.stats
    }));
    broadcast({ type: 'scoreboard', scoreboard: scoreBoard() }, null);
  }
}

function handleMove(ws, player, msg, globalRefs) {
  let nx = clamp(msg.x, 16, globalRefs.WORLD.w * 32 - 16);
  let ny = clamp(msg.y, 16, globalRefs.WORLD.h * 32 - 16);
  
  // Anty-cheat: limit prędkości
  const now = Date.now();
  if (player.lastMoveTime > 0) {
    const timeDiff = now - player.lastMoveTime;
    const distance = Math.sqrt(Math.pow(nx - player.x, 2) + Math.pow(ny - player.y, 2));
    const maxSpeed = 200; // pikseli na sekundę
    const maxDistance = maxSpeed * (timeDiff / 1000);
    
    if (distance > maxDistance) {
      // Zredukuj ruch
      const ratio = maxDistance / distance;
      player.x = player.x + (nx - player.x) * ratio;
      player.y = player.y + (ny - player.y) * ratio;
    } else {
      player.x = nx;
      player.y = ny;
    }
  } else {
    player.x = nx;
    player.y = ny;
  }
  player.lastMoveTime = now;
  
  if (tileAt(player.x, player.y, globalRefs.WORLD) === 'w') {
    ws.send(JSON.stringify({ type: 'corr', id: player.id, x: player.x, y: player.y, dir: player.dir }));
    return;
  }
  player.dir = msg.dir || 0;
  broadcast({ type: 'state', id: player.id, x: player.x, y: player.y, dir: player.dir }, player.id);
}

function handleStartFishing(ws, player, globalRefs) {
  const session = startFishingFor(player, globalRefs.lastFishingStart, globalRefs.fishingSessions);
  if (!session) {
    ws.send(JSON.stringify({ type: 'fishingDenied' }));
  } else {
    ws.send(JSON.stringify({
      type: 'fishingStart',
      fishId: session.fishId,
      timeLimitMs: 25000,
      castTimeMs: 600,
      minigame: session.minigame
    }));
  }
}

function handleFishingResult(ws, player, msg, globalRefs) {
  const result = endFishingFor(player, { score: msg.score, perfects: msg.perfects, castPower: msg.castPower }, globalRefs.fishingSessions);
  if (!result.ok) { 
    ws.send(JSON.stringify({ type: 'fishingResult', ok: false, reason: result.reason })); 
    return; 
  }
  player.fishCount += 1;
  if (result.catch.weight > (player.bestWeight || 0)) player.bestWeight = result.catch.weight;

  // Aktualizacja statystyk
  if (result.catch.weight > 0) {
    player.stats.fishCaught++;
    player.stats.totalWeight += result.catch.weight;
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    if (!player.stats.rarestFish || rarities.indexOf(result.catch.rarity) > rarities.indexOf(player.stats.rarestFish)) {
      player.stats.rarestFish = result.catch.rarity;
    }
  }

  const payload = { type: 'fishEvent', id: player.id, name: player.name, catch: result.catch, scoreboard: scoreBoard() };
  broadcast(payload, null);
  saveProfileFromPlayer(player);

  if (result.leveledUp) broadcast({ type: 'levelUp', id: player.id, level: player.level }, null);
}

function handleSellAll(ws, player, globalRefs) {
  let earned = 0;
  for (const f of player.bag) earned += f.value || 0;
  const sold = player.bag.length;
  player.gold += earned; 
  player.bag = [];
  saveProfileFromPlayer(player);
  ws.send(JSON.stringify({ type: 'sellResult', ok: true, earned, gold: player.gold, sold }));
  broadcast({ type: 'scoreboard', scoreboard: scoreBoard() }, null);
}

function handleBuyItem(ws, player, msg, globalRefs) {
  const { ITEMS } = require('../game/inventory');
  const cat = msg.category;
  const idItem = String(msg.itemId || '');
  let item = null;
  
  if (cat === 'rod') item = ITEMS.RODS.find(i => i.id === idItem);
  if (cat === 'hook') item = ITEMS.HOOKS.find(i => i.id === idItem);
  if (cat === 'bait') item = ITEMS.BAITS.find(i => i.id === idItem);
  
  if (!item) { 
    ws.send(JSON.stringify({ type: 'buyResult', ok: false, reason: 'no-item' })); 
    return; 
  }
  if (player.gold < item.price) { 
    ws.send(JSON.stringify({ type: 'buyResult', ok: false, reason: 'no-gold' })); 
    return; 
  }
  
  // Sprawdzenie czy gracz już ma przedmiot
  const own = player.inventory;
  const arr = cat === 'rod' ? own.rods : (cat === 'hook' ? own.hooks : own.baits);
  if (arr.includes(item.id)) { 
    ws.send(JSON.stringify({ type: 'buyResult', ok: false, reason: 'already-owned' })); 
    return; 
  }
  
  arr.push(item.id);
  player.gold -= item.price;
  saveProfileFromPlayer(player);
  ws.send(JSON.stringify({ type: 'buyResult', ok: true, gold: player.gold, inventory: player.inventory }));
}

function handleEquip(ws, player, msg) {
  const { ITEMS } = require('../game/inventory');
  let changed = false;
  
  if (msg.rod && ITEMS.RODS.find(r => r.id === msg.rod) && player.inventory.rods.includes(msg.rod)) {
    player.equipment.rod = msg.rod;
    changed = true;
  }
  if (msg.hook && ITEMS.HOOKS.find(h => h.id === msg.hook) && player.inventory.hooks.includes(msg.hook)) {
    player.equipment.hook = msg.hook;
    changed = true;
  }
  if (msg.bait && ITEMS.BAITS.find(b => b.id === msg.bait) && player.inventory.baits.includes(msg.bait)) {
    player.equipment.bait = msg.bait;
    changed = true;
  }
  
  if (changed) {
    saveProfileFromPlayer(player);
    ws.send(JSON.stringify({ type: 'equipAck', equipment: player.equipment }));
  } else {
    ws.send(JSON.stringify({ type: 'equipAck', error: 'invalid-item' }));
  }
}

function handleSetName(ws, player, msg, globalRefs) {
  let name = ('' + (msg.name ?? '')).trim().slice(0, 16);
  if (!name) name = makeName();
  player.name = name;
  saveProfileFromPlayer(player);
  ws.send(JSON.stringify({ type: 'nameAck', id: player.id, name }));
  broadcast({ type: 'rename', id: player.id, name }, player.id);
  broadcast({ type: 'scoreboard', scoreboard: scoreBoard() }, null);
}

function handleChat(ws, player, msg, globalRefs) {
  let text = ('' + (msg.text ?? '')).trim().slice(0, 60);
  if (!text) return;
  broadcast({ type: 'chat', id: player.id, name: player.name, text }, null);
}

function handleBuildElement(ws, player, msg, globalRefs) {
  const result = buildElement(player, msg.elementId, msg.x, msg.y, globalRefs.WORLD);
  if (result.success) {
    ws.send(JSON.stringify({ type: 'buildResult', success: true, element: result.element }));
    // Powiadom innych graczy o nowym elemencie
    broadcast({ type: 'addElement', element: result.element }, null);
  } else {
    ws.send(JSON.stringify({ type: 'buildResult', success: false, error: result.error }));
  }
}

function handleResetCharacter(ws, player, globalRefs) {
  // Resetuj postać do stanu początkowego
  player.level = 1;
  player.xp = 0;
  player.gold = 0;
  player.bag = [];
  player.inventory = getDefaultInventory();
  player.equipment = getDefaultEquipment();
  player.stats = { fishCaught: 0, totalWeight: 0, totalTime: 0, rarestFish: null };
  
  saveProfileFromPlayer(player);
  
  ws.send(JSON.stringify({ 
    type: 'resetResult', 
    success: true,
    profile: {
      gold: player.gold,
      bag: player.bag,
      inventory: player.inventory,
      equipment: player.equipment,
      stats: player.stats
    }
  }));
  
  broadcast({ type: 'scoreboard', scoreboard: scoreBoard() }, null);
}

function saveProfileFromPlayer(player) {
  if (!player.token) return;
  const profile = {
    name: player.name, 
    color: player.color, 
    level: player.level, 
    xp: player.xp, 
    gold: player.gold,
    bag: player.bag,
    inventory: player.inventory,
    equipment: player.equipment,
    stats: player.stats
  };
  saveProfile(player.token, profile);
}

// Funkcja pomocnicza
function makeName() {
  const base = ['Karpik', 'Leszcz', 'Okonek', 'Sumik', 'Wędkarz', 'Rybol'];
  return `${base[Math.floor(Math.random() * base.length)]}#${Math.floor(100 + Math.random() * 900)}`;
}

module.exports = { handlePlayerMessage };