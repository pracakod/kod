const { ITEMS } = require('./inventory');

// Receptury na ulepszenia - ROZSZERZONE
const RECIPES = {
  // Ulepszenia wędek
  'rod_feeder_upgrade': {
    name: 'Ulepszenie Feeder Pro',
    required: {
      baseItem: 'rod_feeder',
      materials: [
        { id: 'wood', amount: 5 },
        { id: 'metal', amount: 3 }
      ],
      gold: 100
    },
    result: {
      id: 'rod_feeder_plus',
      name: 'Feeder Pro+',
      power: 1.5,
      durability: 200,
      maxDurability: 200
    }
  },
  
  'rod_spin_upgrade': {
    name: 'Ulepszenie Spin 3000',
    required: {
      baseItem: 'rod_spin',
      materials: [
        { id: 'metal', amount: 8 },
        { id: 'plastic', amount: 5 }
      ],
      gold: 300
    },
    result: {
      id: 'rod_spin_plus',
      name: 'Spin 3000+',
      power: 2.5,
      durability: 250,
      maxDurability: 250
    }
  },
  
  'rod_legend_upgrade': {
    name: 'Ulepszenie Legendarnego Kija',
    required: {
      baseItem: 'rod_legend',
      materials: [
        { id: 'carbon_fiber', amount: 3 },
        { id: 'titanium_alloy', amount: 2 }
      ],
      gold: 1500
    },
    result: {
      id: 'rod_legend_plus',
      name: 'Legendarny Kij+',
      power: 3.5,
      durability: 350,
      maxDurability: 350
    }
  },
  
  'rod_carbon_upgrade': {
    name: 'Ulepszenie Węglowej Super',
    required: {
      baseItem: 'rod_carbon',
      materials: [
        { id: 'carbon_fiber', amount: 5 },
        { id: 'graphene', amount: 2 }
      ],
      gold: 3000
    },
    result: {
      id: 'rod_carbon_plus',
      name: 'Węglowa Super+',
      power: 4.5,
      durability: 450,
      maxDurability: 450
    }
  },
  
  'rod_trolling_upgrade': {
    name: 'Ulepszenie Trolling Master',
    required: {
      baseItem: 'rod_trolling',
      materials: [
        { id: 'titanium_alloy', amount: 3 },
        { id: 'quantum_crystal', amount: 1 }
      ],
      gold: 6000
    },
    result: {
      id: 'rod_trolling_plus',
      name: 'Trolling Master+',
      power: 5.5,
      durability: 550,
      maxDurability: 550
    }
  },
  
  // Naprawy
  'repair_rod': {
    name: 'Naprawa wędki',
    required: {
      baseItem: 'any_rod',
      materials: [
        { id: 'wood', amount: 2 },
        { id: 'metal', amount: 1 }
      ],
      gold: 50
    },
    result: {
      restoreDurability: 50
    }
  },
  
  'repair_advanced': {
    name: 'Zaawansowana naprawa',
    required: {
      baseItem: 'any_rod',
      materials: [
        { id: 'metal', amount: 3 },
        { id: 'plastic', amount: 2 }
      ],
      gold: 150
    },
    result: {
      restoreDurability: 100
    }
  },
  
  'repair_premium': {
    name: 'Premium naprawa',
    required: {
      baseItem: 'any_rod',
      materials: [
        { id: 'carbon_fiber', amount: 2 },
        { id: 'titanium_alloy', amount: 1 }
      ],
      gold: 500
    },
    result: {
      restoreDurability: 200
    }
  },
  
  // Tworzenie nowych wędek
  'create_basic_rod': {
    name: 'Stwórz podstawową wędkę',
    required: {
      baseItem: null,
      materials: [
        { id: 'wood', amount: 10 },
        { id: 'metal', amount: 5 }
      ],
      gold: 200
    },
    result: {
      id: 'rod_basic_plus',
      name: 'Podstawowa wędka+',
      power: 0.5,
      durability: 150,
      maxDurability: 150
    }
  }
};

function canCraftRecipe(player, recipeId) {
  const recipe = RECIPES[recipeId];
  if (!recipe) return false;
  
  // Sprawdź złoto
  if (player.gold < recipe.required.gold) return false;
  
  // Sprawdź materiały
  for (const material of recipe.required.materials) {
    const playerMaterial = player.inventory.materials.find(m => m.id === material.id);
    if (!playerMaterial || playerMaterial.amount < material.amount) {
      return false;
    }
  }
  
  // Sprawdź bazowy przedmiot jeśli wymagany
  if (recipe.required.baseItem && recipe.required.baseItem !== 'any_rod') {
    const hasBaseItem = player.inventory.rods.includes(recipe.required.baseItem);
    if (!hasBaseItem) return false;
  }
  
  return true;
}

function craftRecipe(player, recipeId) {
  const recipe = RECIPES[recipeId];
  if (!recipe || !canCraftRecipe(player, recipeId)) {
    return { success: false, error: 'Nie można wykonać receptury' };
  }
  
  // Pobierz koszty
  player.gold -= recipe.required.gold;
  
  // Usuń materiały
  for (const material of recipe.required.materials) {
    const playerMaterial = player.inventory.materials.find(m => m.id === material.id);
    playerMaterial.amount -= material.amount;
    if (playerMaterial.amount <= 0) {
      player.inventory.materials = player.inventory.materials.filter(m => m.id !== material.id);
    }
  }
  
  // Usuń bazowy przedmiot jeśli wymagany
  if (recipe.required.baseItem && recipe.required.baseItem !== 'any_rod') {
    player.inventory.rods = player.inventory.rods.filter(id => id !== recipe.required.baseItem);
  }
  
  // Dodaj wynik
  if (recipe.result.id) {
    // Nowy przedmiot
    player.inventory.rods.push(recipe.result.id);
    // Dodaj do ITEMS jeśli nie istnieje
    if (!ITEMS.RODS.find(r => r.id === recipe.result.id)) {
      ITEMS.RODS.push({
        id: recipe.result.id,
        name: recipe.result.name,
        power: recipe.result.power,
        price: recipe.result.price || 0,
        durability: recipe.result.durability,
        maxDurability: recipe.result.maxDurability
      });
    }
  } else if (recipe.result.restoreDurability) {
    // Naprawa
    const rod = ITEMS.RODS.find(r => r.id === player.equipment.rod);
    if (rod) {
      rod.durability = Math.min(rod.maxDurability, rod.durability + recipe.result.restoreDurability);
    }
  }
  
  return { success: true, result: recipe.result };
}

function getAvailableRecipes(player) {
  return Object.keys(RECIPES).filter(recipeId => 
    canCraftRecipe(player, recipeId)
  ).map(recipeId => ({
    id: recipeId,
    ...RECIPES[recipeId]
  }));
}

module.exports = {
  RECIPES,
  canCraftRecipe,
  craftRecipe,
  getAvailableRecipes
};