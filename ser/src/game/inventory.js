// Przedmioty w grze - ROZSZERZONE DO 20+
const ITEMS = {
  RODS: [
    { id: 'rod_basic', name: '🌿 Patyk', power: 0, price: 0 },
    { id: 'rod_feeder', name: '🎣 Feeder Pro', power: 1, price: 150 },
    { id: 'rod_spin', name: '🔄 Spin 3000', power: 2, price: 400 },
    { id: 'rod_legend', name: '⭐ Legendarny Kij', power: 3, price: 1200 },
    { id: 'rod_carbon', name: '⚫ Węglowa Super', power: 4, price: 2500 },
    { id: 'rod_trolling', name: '🚤 Trolling Master', power: 5, price: 5000 },
    { id: 'rod_sea', name: '🌊 Morska Potęga', power: 6, price: 10000 },
    { id: 'rod_composite', name: '🔷 Kompozytowy Ultra', power: 7, price: 18000 },
    { id: 'rod_telescopic', name: '🔭 Teleskopowy Pro', power: 8, price: 30000 },
    { id: 'rod_fiberglass', name: '💎 Szklano-Włóknisty', power: 9, price: 50000 },
    { id: 'rod_graphite', name: '🖤 Grafitowy Elite', power: 10, price: 80000 },
    { id: 'rod_nanotech', name: '🔬 Nano Technologia', power: 11, price: 120000 },
    { id: 'rod_titanium', name: '🛡️ Tytanowy X', power: 12, price: 180000 },
    { id: 'rod_plasma', name: '⚡ Plazmowy V', power: 13, price: 250000 },
    { id: 'rod_quantum', name: '🌀 Kwantowy Z', power: 14, price: 350000 },
    { id: 'rod_neutron', name: '☢️ Neutronowy Omega', power: 15, price: 500000 },
    { id: 'rod_antimatter', name: '💫 Antymaterii Alpha', power: 16, price: 700000 },
    { id: 'rod_blackhole', name: '🕳️ Czarna Dziura', power: 17, price: 1000000 },
    { id: 'rod_multiverse', name: '🌌 Multiversum Beta', power: 18, price: 1500000 },
    { id: 'rod_infinity', name: '♾️ Nieskończoność Gamma', power: 19, price: 2000000 },
    { id: 'rod_galaxy', name: '🌟 Galaktyczna Delta', power: 20, price: 3000000 }
  ],

  HOOKS: [
    { id: 'hook_small', name: '📌 Mały haczyk', modWeight: 0.00, price: 50 },
    { id: 'hook_med', name: '🪝 Średni haczyk', modWeight: 0.05, price: 120 },
    { id: 'hook_big', name: '⚓ Duży haczyk', modWeight: 0.12, price: 260 },
    { id: 'hook_treble', name: '🔱 Potrójny', modWeight: 0.18, price: 450 },
    { id: 'hook_circle', name: '⭕ Okrągły', modWeight: 0.25, price: 750 },
    { id: 'hook_jig', name: '💿 Jigging', modWeight: 0.32, price: 1200 },
    { id: 'hook_spinner', name: '🌪️ Spinner', modWeight: 0.40, price: 1800 },
    { id: 'hook_spoon', name: '🥄 Łyżka', modWeight: 0.48, price: 2600 },
    { id: 'hook_plug', name: '🔌 Plug', modWeight: 0.57, price: 3800 },
    { id: 'hook_crankbait', name: '🎯 Crankbait', modWeight: 0.66, price: 5500 },
    { id: 'hook_swimbait', name: '🏊 Swimbait', modWeight: 0.76, price: 8000 },
    { id: 'hook_frog', name: '🐸 Żabka', modWeight: 0.87, price: 12000 },
    { id: 'hook_mouse', name: '🐭 Myszka', modWeight: 0.99, price: 18000 },
    { id: 'hook_crawfish', name: '🦞 Rak', modWeight: 1.12, price: 26000 },
    { id: 'hook_minnow', name: '🐟 Minóg', modWeight: 1.26, price: 38000 },
    { id: 'hook_squid', name: '🦑 Kalmar', modWeight: 1.41, price: 55000 },
    { id: 'hook_eel', name: '🐍 Węgorz', modWeight: 1.57, price: 80000 },
    { id: 'hook_pike', name: '🐊 Szczupak', modWeight: 1.74, price: 120000 },
    { id: 'hook_bass', name: '🐠 Okoń', modWeight: 1.92, price: 180000 },
    { id: 'hook_tuna', name: '🐋 Tuńczyk', modWeight: 2.11, price: 250000 },
    { id: 'hook_marlin', name: '⚔️ Marlin', modWeight: 2.32, price: 350000 }
  ],

  BAITS: [
    { id: 'bait_bread', name: '🍞 Chleb', rarityBias: 0.00, price: 10 },
    { id: 'bait_corn', name: '🌽 Kukurydza', rarityBias: 0.05, price: 30 },
    { id: 'bait_worm', name: '🪱 Robak', rarityBias: 0.08, price: 50 },
    { id: 'bait_pellets', name: '⚪ Kulki proteinowe', rarityBias: 0.15, price: 120 },
    { id: 'bait_boilies', name: '🔴 Boilies', rarityBias: 0.23, price: 250 },
    { id: 'bait_lure', name: '🎣 Przynęta', rarityBias: 0.32, price: 500 },
    { id: 'bait_shrimp', name: '🦐 Krewetka', rarityBias: 0.42, price: 1000 },
    { id: 'bait_squid', name: '🦑 Kalmar', rarityBias: 0.53, price: 2000 },
    { id: 'bait_sardine', name: '🐟 Sardynka', rarityBias: 0.65, price: 4000 },
    { id: 'bait_mackerel', name: '🐠 Makrela', rarityBias: 0.78, price: 8000 },
    { id: 'bait_herring', name: '🐡 Śledź', rarityBias: 0.92, price: 15000 },
    { id: 'bait_sprat', name: '🐟 Sprat', rarityBias: 1.07, price: 25000 },
    { id: 'bait_pilchard', name: '🐠 Sardela', rarityBias: 1.23, price: 40000 },
    { id: 'bait_anchovy', name: '🐡 Anchois', rarityBias: 1.40, price: 65000 },
    { id: 'bait_saithe', name: '🐟 Mintaj', rarityBias: 1.58, price: 100000 },
    { id: 'bait_cod', name: '🐠 Dorsz', rarityBias: 1.77, price: 150000 },
    { id: 'bait_haddock', name: '🐡 Gładzica', rarityBias: 1.97, price: 220000 },
    { id: 'bait_pollock', name: '🐟 Makrela morska', rarityBias: 2.18, price: 320000 },
    { id: 'bait_halibut', name: '🐠 Halibut', rarityBias: 2.40, price: 450000 },
    { id: 'bait_tuna', name: '🐋 Tuńczyk', rarityBias: 2.63, price: 650000 },
    { id: 'bait_marlin', name: '⚔️ Marlin', rarityBias: 2.87, price: 900000 }
  ],

  MATERIALS: [
    { id: 'wood', name: '🪵 Drewno', price: 5 },
    { id: 'metal', name: '⚙️ Metal', price: 10 },
    { id: 'plastic', name: '🧊 Plastik', price: 3 },
    { id: 'carbon_fiber', name: '⚫ Włókno węglowe', price: 50 },
    { id: 'titanium_alloy', name: '🛡️ Stop tytanu', price: 100 },
    { id: 'graphene', name: '💎 Grafen', price: 200 },
    { id: 'quantum_crystal', name: '💠 Kryształ kwantowy', price: 500 },
    { id: 'neutron_core', name: '☢️ Rdzeń neutronowy', price: 1000 }
  ]
};

function getDefaultInventory() {
  return {
    rods: ['rod_basic'],
    hooks: ['hook_small'],
    baits: ['bait_bread'],
    materials: [] // Początkowo brak materiałów
  };
}

function getDefaultEquipment() {
  return {
    rod: 'rod_basic',
    hook: 'hook_small',
    bait: 'bait_bread'
  };
}

module.exports = {
  ITEMS,
  getDefaultInventory,
  getDefaultEquipment
};