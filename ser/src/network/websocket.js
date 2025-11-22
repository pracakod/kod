const { WebSocketServer } = require('ws');
const { handlePlayerMessage } = require('./messages');
const { pickSpawn } = require('../world/spawn');
const { getDefaultInventory, getDefaultEquipment } = require('../game/inventory');
const { defaultProfile } = require('../data/profiles');
const { generateToken } = require('../utils/helpers');

const MAX_PLAYERS = 4;

// Zmienne globalne przekazywane z server.js
let players, sockets, fishingSessions, lastFishingStart, WORLD;

function setupWebSocketServer(server, globalRefs) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  
  // Przypisanie referencji globalnych
  players = globalRefs.players;
  sockets = globalRefs.sockets;
  fishingSessions = globalRefs.fishingSessions;
  lastFishingStart = globalRefs.lastFishingStart;
  WORLD = globalRefs.WORLD;
  
  wss.on('connection', (ws) => {
    if (players.size >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ type: 'full', msg: 'Serwer pełny (max 4 graczy)' }));
      ws.close(); 
      return;
    }

    handlePlayerConnection(ws);
  });
  
  return wss;
}

function handlePlayerConnection(ws) {
  const id = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const { x, y } = pickSpawn(WORLD);
  const player = {
    id,
    name: makeName(),
    color: randomColor(),
    x, y, dir: 0,
    fishCount: 0,
    bestWeight: 0,
    level: 1,
    xp: 0,
    gold: 0,
    bag: [],
    inventory: getDefaultInventory(),
    equipment: getDefaultEquipment(),
    token: null,
    stats: { fishCaught: 0, totalWeight: 0, totalTime: 0, rarestFish: null },
    missions: [],
    workshop: {
      level: 1,
      experience: 0,
      recipes: ['repair_rod']
    },
    lastMoveTime: 0
  };

  players.set(id, player);
  sockets.set(id, ws);

  // init
  ws.send(JSON.stringify({
    type: 'init',
    you: { id, name: player.name, color: player.color, level: player.level, xp: player.xp, gold: player.gold, bagCount: player.bag.length },
    map: { w: WORLD.w, h: WORLD.h, lakes: WORLD.lakes, decor: WORLD.decor, shops: WORLD.shops, city: WORLD.city },
    players: Array.from(players.values()).map(p => ({ id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, dir: p.dir, level: p.level })),
    scoreboard: scoreBoard()
  }));

  broadcast({ type: 'join', player: { id, name: player.name, color: player.color, x, y, dir: 0, level: player.level } }, id);

  ws.on('message', (data) => {
    let msg;
    try { 
      msg = JSON.parse(data.toString()); 
    } catch { 
      return; 
    }
    
    // Przekazujemy referencje do handlePlayerMessage
    handlePlayerMessage(ws, player, msg, {
      players, sockets, fishingSessions, lastFishingStart, WORLD
    });
  });

  ws.on('close', () => {
    players.delete(id); 
    sockets.delete(id); 
    fishingSessions.delete(id); 
    lastFishingStart.delete(id);
    broadcast({ type: 'leave', id }, null);
  });
}

function makeName() {
  const base = ['Karpik', 'Leszcz', 'Okonek', 'Sumik', 'Wędkarz', 'Rybol'];
  return `${base[Math.floor(Math.random() * base.length)]}#${Math.floor(100 + Math.random() * 900)}`;
}

function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue} 80% 60%)`;
}

function scoreBoard() {
  const arr = Array.from(players.values()).map(p => ({
    id: p.id, name: p.name, fishCount: p.fishCount, bestWeight: p.bestWeight, level: p.level, gold: p.gold
  }));
  arr.sort((a, b) => (b.fishCount - a.fishCount) || (b.bestWeight - a.bestWeight));
  return arr;
}

function broadcast(msg, exceptId = null) {
  const data = JSON.stringify(msg);
  for (const [id, client] of sockets) {
    if (id === exceptId) continue;
    if (client.readyState === 1) client.send(data);
  }
}

module.exports = {
  setupWebSocketServer,
  broadcast,
  scoreBoard
};