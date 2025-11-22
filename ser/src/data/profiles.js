const { getDefaultInventory, getDefaultEquipment } = require('../game/inventory');
const { xpNextFor } = require('../utils/helpers');

function defaultProfile(name, color) {
  return {
    name, color,
    level: 1, xp: 0, gold: 0,
    bag: [],
    inventory: getDefaultInventory(),
    equipment: getDefaultEquipment(),
    stats: { fishCaught: 0, totalWeight: 0, totalTime: 0, rarestFish: null },
    missions: [],
    workshop: {
      level: 1,
      experience: 0,
      recipes: ['repair_rod'] // Domyślne odblokowane receptury
    }
  };
}

function addXP(player, amount) {
  player.xp += amount;
  while (player.xp >= xpNextFor(player.level)) { 
    player.xp -= xpNextFor(player.level); 
    player.level += 1; 
  }
}

function addWorkshopXP(player, amount) {
  const workshop = player.workshop;
  workshop.experience += amount;
  const xpNeeded = workshop.level * 100; // XP potrzebne do następnego poziomu
  if (workshop.experience >= xpNeeded) {
    workshop.experience -= xpNeeded;
    workshop.level += 1;
    // Odblokuj nowe receptury przy awansie
    unlockNewRecipes(player);
  }
}

function unlockNewRecipes(player) {
  const level = player.workshop.level;
  const newRecipes = [];
  
  if (level >= 2) newRecipes.push('rod_feeder_upgrade');
  if (level >= 3) newRecipes.push('rod_spin_upgrade');
  
  // Dodaj nowe receptury do odblokowanych
  for (const recipe of newRecipes) {
    if (!player.workshop.recipes.includes(recipe)) {
      player.workshop.recipes.push(recipe);
    }
  }
}

module.exports = {
  defaultProfile,
  addXP,
  addWorkshopXP
};