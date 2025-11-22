const { TILE } = require('./map');

function pickSpawn(world) {
  // Spawn zawsze w środku miasta
  const city = world.city;
  if (city) {
    const x = (city.x + city.w / 2) * TILE;
    const y = (city.y + city.h / 2) * TILE;
    return { x, y };
  }
  
  // Zapasowy spawn - upewnij się, że jest na trawie
  for (let tries = 0; tries < 6000; tries++) {
    const x = Math.floor(world.w * (0.35 + Math.random() * 0.3));
    const y = Math.floor(world.h * (0.35 + Math.random() * 0.3));
    if (world.tiles[y][x] === 'g') return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
  }
  return { x: TILE * 2, y: TILE * 2 };
}

module.exports = { pickSpawn };