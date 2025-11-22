const { clamp, randChoice } = require('../utils/math');
const inventory = require('./inventory');

// Gatunki ryb z podziałem na tereny
const SPECIES = {
  WATER: [
    { name: 'Płoć', min: 0.3, max: 1.2, rarity: 'common' },
    { name: 'Okoń', min: 0.4, max: 1.5, rarity: 'common' },
    { name: 'Leszcz', min: 0.6, max: 3.0, rarity: 'common' },
    { name: 'Karaś', min: 0.3, max: 2.0, rarity: 'common' },
    { name: 'Karp', min: 1.0, max: 8.0, rarity: 'uncommon' },
    { name: 'Szczupak', min: 1.2, max: 10.0, rarity: 'uncommon' },
    { name: 'Pstrąg', min: 0.8, max: 4.0, rarity: 'uncommon' },
    { name: 'Sandacz', min: 1.0, max: 7.0, rarity: 'rare' },
    { name: 'Amur', min: 2.0, max: 12.0, rarity: 'rare' },
    { name: 'Węgorz', min: 0.5, max: 4.0, rarity: 'rare' },
    { name: 'Sum', min: 5.0, max: 40.0, rarity: 'epic' },
    { name: 'Łosoś', min: 3.0, max: 18.0, rarity: 'epic' }
  ],
  
  MOUNTAIN: [
    { name: 'Pstrąg górski', min: 0.8, max: 4.0, rarity: 'common' },
    { name: 'Karp górski', min: 1.0, max: 8.0, rarity: 'uncommon' },
    { name: 'Leszcz górski', min: 0.6, max: 3.0, rarity: 'common' },
    { name: 'Sandacz górski', min: 1.0, max: 7.0, rarity: 'rare' }
  ],
  
  FOREST: [
    { name: 'Okoń leśny', min: 0.4, max: 1.5, rarity: 'common' },
    { name: 'Pstrąg leśny', min: 0.8, max: 4.0, rarity: 'uncommon' },
    { name: 'Szczupak leśny', min: 1.2, max: 10.0, rarity: 'uncommon' },
    { name: 'Węgorz leśny', min: 0.5, max: 4.0, rarity: 'rare' }
  ],
  
  BEACH: [
    { name: 'Rekin', min: 20.0, max: 100.0, rarity: 'legendary' },
    { name: 'Orka', min: 15.0, max: 80.0, rarity: 'legendary' },
    { name: 'Morszczuk', min: 10.0, max: 60.0, rarity: 'epic' },
    { name: 'Łosoś morski', min: 3.0, max: 18.0, rarity: 'epic' },
    { name: 'Sum morski', min: 5.0, max: 40.0, rarity: 'epic' }
  ]
};

const JUNK = [
  { name: 'Stary but', base: 5, var: 5 },
  { name: 'Zegarek', base: 60, var: 40 },
  { name: 'Telefon', base: 120, var: 80 },
  { name: 'Nieznana technologia UFO', base: 400, var: 300 },
  { name: 'Prezerwatywa', base: 2, var: 3 }
];

const MATERIALS_FROM_FISHING = [
  { name: 'Drewno', id: 'wood', chance: 0.1 },
  { name: 'Metal', id: 'metal', chance: 0.08 },
  { name: 'Plastik', id: 'plastic', chance: 0.05 },
  { name: 'Włókno węglowe', id: 'carbon_fiber', chance: 0.02 },
  { name: 'Stop tytanu', id: 'titanium_alloy', chance: 0.01 },
  { name: 'Grafen', id: 'graphene', chance: 0.005 },
  { name: 'Kryształ kwantowy', id: 'quantum_crystal', chance: 0.001 }
];

const rarOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

function rarityDistForLevel(level, baitBias = 0) {
  const base = { common: 0.7, uncommon: 0.22, rare: 0.07, epic: 0.01, legendary: 0.001 };
  const shift = Math.min(0.3, level * 0.02 + baitBias);
  let p = {
    common: base.common - shift * 0.6,
    uncommon: base.uncommon + shift * 0.34,
    rare: base.rare + shift * 0.23,
    epic: base.epic + shift * 0.03,
    legendary: base.legendary + shift * 0.005,
  };
  const sum = p.common + p.uncommon + p.rare + p.epic + p.legendary;
  for (const k in p) p[k] /= sum;
  return p;
}

function sampleRarity(dist) {
  const r = Math.random();
  let acc = 0;
  for (const k of rarOrder) { acc += dist[k]; if (r <= acc) return k; }
  return 'common';
}

function startFishingFor(player, lastFishingStart, fishingSessions) {
  // Anty-cheat: blokada wielokrotnego startu
  const now = Date.now();
  const lastStart = lastFishingStart.get(player.id) || 0;
  if (now - lastStart < 1000) return null; // Blokada na 1 sekundę
  lastFishingStart.set(player.id, now);
  
  const fishId = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const expiresAt = Date.now() + 25000;

  // modyfikatory ekwipunku
  const rod = inventory.ITEMS.RODS.find(r => r.id === player.equipment.rod) || inventory.ITEMS.RODS[0];
  const hook = inventory.ITEMS.HOOKS.find(h => h.id === player.equipment.hook) || inventory.ITEMS.HOOKS[0];
  const bait = inventory.ITEMS.BAITS.find(b => b.id === player.equipment.bait) || inventory.ITEMS.BAITS[0];

  const requiredHits = 3 + Math.min(3, Math.floor(player.level / 5));
  let arcWidthDeg = 60 - Math.min(25, player.level * 1.2) + rod.power * 4;
  let needleSpeed = 2.6 + Math.min(1.2, player.level * 0.05) - rod.power * 0.1;
  if (needleSpeed < 1.8) needleSpeed = 1.8;

  const session = {
    fishId, expiresAt,
    minigame: { requiredHits, needleSpeed, arcWidthDeg },
    gear: { rod: rod.id, hook: hook.id, bait: bait.id }
  };
  fishingSessions.set(player.id, session);
  return session;
}

function endFishingFor(player, result, fishingSessions) {
  const session = fishingSessions.get(player.id);
  if (!session) return { ok: false, reason: 'no-session' };
  if (Date.now() > session.expiresAt) { fishingSessions.delete(player.id); return { ok: false, reason: 'expired' }; }
  fishingSessions.delete(player.id);

  const { score: s, perfects = 0, castPower = 0.5 } = result;
  const score = clamp(Number(s ?? 0), 0, 1);
  
  // Anty-cheat: ograniczenie perfects
  const maxPerfects = session.minigame.requiredHits;
  const validPerfects = Math.min(perfects, maxPerfects);

  const rod = inventory.ITEMS.RODS.find(r => r.id === player.equipment.rod) || inventory.ITEMS.RODS[0];
  const hook = inventory.ITEMS.HOOKS.find(h => h.id === player.equipment.hook) || inventory.ITEMS.HOOKS[0];
  const bait = inventory.ITEMS.BAITS.find(b => b.id === player.equipment.bait) || inventory.ITEMS.BAITS[0];

  // Szansa na śmieć
  let junkChance = 0.08 + (1 - castPower) * 0.1 + (score < 0.4 ? 0.12 : 0);
  if (bait.id === 'bait_worm') junkChance -= 0.02;
  if (Math.random() < junkChance) {
    const j = randChoice(JUNK);
    const value = Math.max(1, Math.round(j.base + (Math.random() - 0.5) * j.var));
    const item = { id: session.fishId, species: j.name, weight: 0, rarity: 'junk', quality: 0, value };
    player.bag.push(item);
    return {
      ok: true,
      catch: { ...item, xpGain: 2, level: player.level },
      leveledUp: false,
    };
  }

  // Szansa na materiał z łowienia
  for (const material of MATERIALS_FROM_FISHING) {
    if (Math.random() < material.chance * (player.level * 0.01 + 1)) {
      // Dodaj materiał do ekwipunku
      const existingMaterial = player.inventory.materials.find(m => m.id === material.id);
      if (existingMaterial) {
        existingMaterial.amount += 1;
      } else {
        player.inventory.materials.push({ id: material.id, amount: 1 });
      }
      
      return {
        ok: true,
        catch: { 
          species: material.name, 
          weight: 0, 
          rarity: 'common', 
          quality: 0, 
          value: 0,
          materialFound: material.id,
          xpGain: 5, 
          level: player.level 
        },
        leveledUp: false,
      };
    }
  }

  // Rzadkość wg poziomu, przynęty i jakości
  let rarity = sampleRarity(rarityDistForLevel(player.level, bait.rarityBias));
  let idx = rarOrder.indexOf(rarity);
  if (score > 0.9) idx += 2;
  else if (score > 0.75) idx += 1;
  else if (score < 0.25) idx -= 1;
  idx += (castPower > 0.7) ? 1 : 0;
  idx = clamp(idx, 0, rarOrder.length - 1);
  rarity = rarOrder[idx];

  // Wybierz gatunek ryb na podstawie terenu
  const terrainFish = SPECIES.WATER; // Domyślnie woda
  const pool = terrainFish.filter(sp => sp.rarity === rarity);
  
  // Zabezpieczenie przed pustą pulą
  if (pool.length === 0) {
    const fallbackFish = { name: 'Mała rybka', min: 0.1, max: 1.0, rarity: 'common' };
    const weight = Math.random() * 0.9 + 0.1;
    const fish = {
      id: session.fishId,
      species: fallbackFish.name,
      weight: Number(weight.toFixed(2)),
      rarity: fallbackFish.rarity,
      quality: 0.5,
      value: 10
    };
    player.bag.push(fish);
    return {
      ok: true,
      catch: { ...fish, xpGain: 10, level: player.level },
      leveledUp: false,
    };
  }
  
  const species = randChoice(pool);
  const base = species.min + Math.random() * (species.max - species.min);
  const hitsFactor = 1 + Math.max(0, (session.minigame.requiredHits - 3)) * 0.05;
  const perfectFactor = 1 + Math.min(0.5, validPerfects * 0.08);
  const castFactor = 0.8 + 0.4 * castPower;
  const hookFactor = 1 + (inventory.ITEMS.HOOKS.find(h => h.id === player.equipment.hook)?.modWeight || 0);
  const rodFactor = 1 + rod.power * 0.08;

  let weight = base * (0.35 + 0.65 * score) * hitsFactor * perfectFactor * castFactor * hookFactor * rodFactor * (1 + player.level * 0.03);
  weight = Math.max(species.min * 0.6, Math.min(species.max * 1.3, weight));
  const quality = clamp(0.5 + 0.5 * score, 0.5, 1.0);

  const rarityBonus = { common: 5, uncommon: 12, rare: 25, epic: 50, legendary: 100 }[rarity];
  const xpGain = Math.round(10 * weight + rarityBonus * score);
  const oldLevel = player.level;
  // addXP(player, xpGain); // Zakładamy, że ta funkcja istnieje

  const rarityMul = { common: 1, uncommon: 1.8, rare: 3.5, epic: 7, legendary: 15 }[rarity];
  const priceBase = weight * 15;
  const price = Math.max(1, Math.round(priceBase * rarityMul * (0.8 + quality * 0.6) * (0.8 + score * 0.7)));

  const fish = {
    id: session.fishId,
    species: species.name,
    weight: Number(weight.toFixed(2)),
    rarity,
    quality: Number(quality.toFixed(2)),
    value: price
  };
  
  // Naprawiono: ryba dodawana tylko jeśli trafiono w zielone
  if (score > 0) {
    player.bag.push(fish);
  }
  
  return {
    ok: true,
    catch: score > 0 ? { ...fish, xpGain, level: player.level } : { species: 'Nic', weight: 0, rarity: 'common', quality: 0, value: 0, xpGain: 0, level: player.level },
    leveledUp: player.level > oldLevel,
  };
}

module.exports = {
  startFishingFor,
  endFishingFor,
  SPECIES,
  JUNK,
  rarOrder
};