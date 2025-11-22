// Funkcje matematyczne i pomocnicze
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function distance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

module.exports = {
  clamp,
  mulberry32,
  randChoice,
  distance
};