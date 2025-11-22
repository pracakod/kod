const { TILE } = require('../world/map');

// Typy elementów budowlanych
const BUILDING_ELEMENTS = {
  PATH: 'path',
  WALL: 'wall',
  FENCE: 'fence',
  TREE: 'tree',
  BUSH: 'bush',
  ROCK: 'rock',
  FLOWER: 'flower'
};

// Koszty budowy
const BUILDING_COSTS = {
  [BUILDING_ELEMENTS.PATH]: { gold: 50, materials: [{ id: 'stone', amount: 2 }] },
  [BUILDING_ELEMENTS.WALL]: { gold: 200, materials: [{ id: 'stone', amount: 5 }, { id: 'wood', amount: 3 }] },
  [BUILDING_ELEMENTS.FENCE]: { gold: 100, materials: [{ id: 'wood', amount: 4 }] },
  [BUILDING_ELEMENTS.TREE]: { gold: 30, materials: [{ id: 'seed', amount: 1 }] },
  [BUILDING_ELEMENTS.BUSH]: { gold: 20, materials: [{ id: 'seed', amount: 1 }] },
  [BUILDING_ELEMENTS.ROCK]: { gold: 10, materials: [] },
  [BUILDING_ELEMENTS.FLOWER]: { gold: 15, materials: [{ id: 'seed', amount: 1 }] }
};

// Lista dostępnych elementów budowlanych
const AVAILABLE_ELEMENTS = [
  { id: BUILDING_ELEMENTS.PATH, name: 'Chodnik', icon: '🧱' },
  { id: BUILDING_ELEMENTS.WALL, name: 'Ściana', icon: '🧱' },
  { id: BUILDING_ELEMENTS.FENCE, name: 'Płot', icon: '建篗' },
  { id: BUILDING_ELEMENTS.TREE, name: 'Drzewo', icon: '🌳' },
  { id: BUILDING_ELEMENTS.BUSH, name: 'Krzew', icon: '🌿' },
  { id: BUILDING_ELEMENTS.ROCK, name: 'Kamień', icon: '🪨' },
  { id: BUILDING_ELEMENTS.FLOWER, name: 'Kwiat', icon: '🌸' }
];

function canBuildElement(player, elementId) {
  const cost = BUILDING_COSTS[elementId];
  if (!cost) return false;
  
  // Sprawdź złoto
  if (player.gold < cost.gold) return false;
  
  // Sprawdź materiały
  for (const material of cost.materials) {
    const playerMaterial = player.inventory.materials.find(m => m.id === material.id);
    if (!playerMaterial || playerMaterial.amount < material.amount) {
      return false;
    }
  }
  
  return true;
}

function buildElement(player, elementId, x, y, world) {
  const cost = BUILDING_COSTS[elementId];
  if (!cost || !canBuildElement(player, elementId)) {
    return { success: false, error: 'Nie można zbudować elementu' };
  }
  
  // Sprawdź czy pozycja jest wolna
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) {
    return { success: false, error: 'Nieprawidłowa pozycja' };
  }
  
  // Tylko na trawie można budować
  if (world.tiles[ty][tx] !== 'g') {
    return { success: false, error: 'Można budować tylko na trawie' };
  }
  
  // Pobierz koszty
  player.gold -= cost.gold;
  
  // Usuń materiały
  for (const material of cost.materials) {
    const playerMaterial = player.inventory.materials.find(m => m.id === material.id);
    playerMaterial.amount -= material.amount;
    if (playerMaterial.amount <= 0) {
      player.inventory.materials = player.inventory.materials.filter(m => m.id !== material.id);
    }
  }
  
  // Dodaj element do dekoracji świata
  const decorElement = {
    type: elementId,
    x: tx * TILE + TILE / 2,
    y: ty * TILE + TILE / 2,
    playerId: player.id // Zapisz kto zbudował
  };
  
  // Dodaj do globalnej listy dekoracji
  world.decor.push(decorElement);
  
  return { success: true, element: decorElement };
}

function getAvailableElements() {
  return AVAILABLE_ELEMENTS;
}

function getBuildingCost(elementId) {
  return BUILDING_COSTS[elementId] || null;
}

module.exports = {
  BUILDING_ELEMENTS,
  canBuildElement,
  buildElement,
  getAvailableElements,
  getBuildingCost
};