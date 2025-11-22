const { clamp, mulberry32 } = require('../utils/math');

const TILE = 32;
const MAP_W = 160;
const MAP_H = 160;
const MAP_SEED = 12345;

// Typy terenów
const TERRAIN_TYPES = {
  GRASS: 'g',
  WATER: 'w',
  MOUNTAIN: 'm',
  FOREST: 'f',
  BEACH: 'b'
};

function generateMap() {
  const tiles = Array.from({ length: MAP_H }, () => 
    Array.from({ length: MAP_W }, () => TERRAIN_TYPES.GRASS)
  );
  const lakes = [];
  const decor = [];
  const colliders = [];
  const shops = { sell: null, rods: null, baits: null, hooks: null, npcJaroslaw: null };
  const rnd = mulberry32(MAP_SEED);

  // Środkowe miasto (bez wody!)
  const city = { x: Math.floor(MAP_W * 0.45), y: Math.floor(MAP_H * 0.45), w: 22, h: 16 };
  
  // Upewnij się, że miasto jest na trawie
  for (let y = city.y; y < city.y + city.h; y++) {
    for (let x = city.x; x < city.x + city.w; x++) {
      if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) {
        tiles[y][x] = TERRAIN_TYPES.GRASS;
      }
    }
  }
  
  // Generowanie różnych terenów
  function generateTerrain() {
    // Góry w górnej części mapy
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (rnd() > 0.3) {
          tiles[y][x] = TERRAIN_TYPES.MOUNTAIN;
        }
      }
    }
    
    // Las w dolnej części mapy
    for (let y = MAP_H - 40; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (rnd() > 0.4) {
          tiles[y][x] = TERRAIN_TYPES.FOREST;
        }
      }
    }
    
    // Generuj jeziora POZA miastem
    const lakeCount = 8 + Math.floor(rnd() * 4);
    for (let i = 0; i < lakeCount; i++) {
      let cx, cy, r;
      let validPosition = false;
      let attempts = 0;
      
      // Znajdź pozycję poza miastem
      while (!validPosition && attempts < 100) {
        cx = Math.floor(MAP_W * (0.15 + rnd() * 0.7));
        cy = Math.floor(MAP_H * (0.15 + rnd() * 0.7));
        r = Math.floor(10 + rnd() * 20);
        
        // Sprawdź czy jezioro nie nachodzi na miasto
        const minX = Math.max(0, cx - r - 5);
        const maxX = Math.min(MAP_W, cx + r + 5);
        const minY = Math.max(0, cy - r - 5);
        const maxY = Math.min(MAP_H, cy + r + 5);
        
        let overlapsCity = false;
        for (let y = minY; y < maxY && !overlapsCity; y++) {
          for (let x = minX; x < maxX && !overlapsCity; x++) {
            if (x >= city.x && x < city.x + city.w && y >= city.y && y < city.y + city.h) {
              overlapsCity = true;
            }
          }
        }
        
        if (!overlapsCity) {
          validPosition = true;
        }
        attempts++;
      }
      
      if (validPosition) {
        addLake(tiles, lakes, cx, cy, r, city);
      }
    }
  }

  function addLake(tiles, lakes, cx, cy, r, city) {
    lakes.push({ cx, cy, r });
    for (let y = Math.max(0, cy - r - 3); y < Math.min(MAP_H, cy + r + 3); y++) {
      for (let x = Math.max(0, cx - r - 3); x < Math.min(MAP_W, cx + r + 3); x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const wobble = (Math.sin(x * 0.9) + Math.cos(y * 1.1)) * 0.4;
        if (dist + wobble < r) {
          // Nie nadpisuj miasta
          const isInCity = (
            x >= city.x && x < city.x + city.w &&
            y >= city.y && y < city.y + city.h
          );
          
          if (!isInCity) {
            tiles[y][x] = TERRAIN_TYPES.WATER;
            // Dodaj plaże wokół wody
            addBeach(tiles, x, y, city);
          }
        }
      }
    }
  }

  function addBeach(tiles, x, y, city) {
    // Sprawdź sąsiednie kafelki i dodaj plażę (ale nie w mieście)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < MAP_W && ny < MAP_H) {
          const isInCity = (
            nx >= city.x && nx < city.x + city.w &&
            ny >= city.y && ny < city.y + city.h
          );
          
          if (tiles[ny][nx] === TERRAIN_TYPES.GRASS && !isInCity) {
            tiles[ny][nx] = TERRAIN_TYPES.BEACH;
          }
        }
      }
    }
  }

  function tryAddDecor(type, tx, ty) {
    if (tx < 2 || ty < 2 || tx >= MAP_W - 2 || ty >= MAP_H - 2) return;
    if (tiles[ty][tx] !== TERRAIN_TYPES.GRASS) return;
    decor.push({ type, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
  }

  // Generuj tereny
  generateTerrain();

  // Ogólne dekoracje
  for (let i = 0; i < 260; i++) tryAddDecor('tree', Math.floor(rnd() * MAP_W), Math.floor(rnd() * MAP_H));
  for (let i = 0; i < 180; i++) tryAddDecor('bush', Math.floor(rnd() * MAP_W), Math.floor(rnd() * MAP_H));
  for (let i = 0; i < 90; i++) tryAddDecor('rock', Math.floor(rnd() * MAP_W), Math.floor(rnd() * MAP_H));
  for (let i = 0; i < 120; i++) tryAddDecor('flower', Math.floor(rnd() * MAP_W), Math.floor(rnd() * MAP_H));

  // Miasto ogrodzone
  function addFenceRect(cx, cy, cw, ch) {
    const px = cx * TILE, py = cy * TILE, pw = cw * TILE, ph = ch * TILE;
    const step = TILE;
    for (let x = px; x <= px + pw; x += step) {
      decor.push({ type: 'fence', x, y: py });
      decor.push({ type: 'fence', x, y: py + ph });
    }
    for (let y = py; y <= py + ph; y += step) {
      decor.push({ type: 'fence', x: px, y });
      decor.push({ type: 'fence', x: px + pw, y });
    }
    const gx = px + pw / 2;
    decor.push({ type: 'gate', x: gx, y: py + ph });
  }
  addFenceRect(city.x, city.y, city.w, city.h);

  // Budynki (4x4 kafle)
  function addBuilding(kind, tx, ty, label) {
    const px = (tx + 2) * TILE, py = (ty + 2) * TILE;
    decor.push({ type: kind, x: px, y: py, label });
    return { x: px, y: py };
  }
  const rodsPos = addBuilding('shop', city.x + 2, city.y + 2, 'WĘDKI');
  const baitsPos = addBuilding('shop', city.x + city.w - 6, city.y + 2, 'ZANĘTY');
  const hooksPos = addBuilding('shop', city.x + 2, city.y + city.h - 6, 'HACZYKI');
  const sellPos = addBuilding('shop', city.x + city.w - 6, city.y + city.h - 6, 'SKUP');

  shops.rods = rodsPos;
  shops.baits = baitsPos;
  shops.hooks = hooksPos;
  shops.sell = sellPos;

  // NPC Jarosław (środek miasta)
  const npcX = (city.x + Math.floor(city.w / 2)) * TILE + TILE;
  const npcY = (city.y + Math.floor(city.h / 2)) * TILE + TILE;
  decor.push({ type: 'npc', x: npcX, y: npcY, label: 'Jarosław' });
  shops.npcJaroslaw = { x: npcX, y: npcY };

  return { 
    w: MAP_W, 
    h: MAP_H, 
    tiles, 
    lakes, 
    decor, 
    colliders, 
    shops, 
    city,
    terrainTypes: TERRAIN_TYPES
  };
}

function tileAt(px, py, world) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return world.terrainTypes.WATER;
  return world.tiles[ty][tx];
}

function isBlocked(px, py) {
  return false; // Usunięte kolizje
}

function nearWater(px, py, world) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x >= 0 && y >= 0 && x < world.w && y < world.h && world.tiles[y][x] === world.terrainTypes.WATER) return true;
    }
  return false;
}

module.exports = {
  generateMap,
  tileAt,
  isBlocked,
  nearWater,
  TILE,
  MAP_W,
  MAP_H
};